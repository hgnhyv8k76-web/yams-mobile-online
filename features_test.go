package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func durableServer(t *testing.T, path string) *Server {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	if err = initDB(db); err != nil {
		t.Fatal(err)
	}
	s := &Server{db: db, rooms: map[string]*Room{}}
	if err = s.loadRooms(); err != nil {
		t.Fatal(err)
	}
	return s
}
func testDial(t *testing.T, s *Server) *websocket.Conn {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(s.handleWS))
	t.Cleanup(server.Close)
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}
func readMessage(t *testing.T, c *websocket.Conn) map[string]any {
	t.Helper()
	c.SetReadDeadline(time.Now().Add(5 * time.Second))
	var msg map[string]any
	if err := c.ReadJSON(&msg); err != nil {
		t.Fatal(err)
	}
	return msg
}
func TestSoloSurvivesRestartAndReconnect(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rooms.db")
	s := durableServer(t, path)
	conn := testDial(t, s)
	conn.WriteJSON(WSMessage{Type: "create", Solo: true, BotLevel: "hard", Name: "Human"})
	session := readMessage(t, conn)
	readMessage(t, conn)
	code := session["code"].(string)
	id := session["playerId"].(string)
	token := session["token"].(string)
	conn.WriteJSON(WSMessage{Type: "roll"})
	readMessage(t, conn)
	conn.WriteJSON(WSMessage{Type: "hold", Index: 2, Held: true})
	readMessage(t, conn)
	// A second server only knows what was committed to disk, not the original memory.
	fresh := durableServer(t, path)
	room := fresh.rooms[code]
	if room == nil || !room.Started || room.Rolls != 1 || !room.Held[2] || room.Players[1].BotLevel != "hard" {
		t.Fatalf("lost game state: %+v", room)
	}
	if room.Players[0].Online || room.Players[0].ReconnectToken != token {
		t.Fatal("incorrect restored identity")
	}
	retry := testDial(t, fresh)
	retry.WriteJSON(WSMessage{Type: "reconnect", Code: code, PlayerID: id, Token: token})
	if readMessage(t, retry)["type"] != "session" {
		t.Fatal("reconnect failed")
	}
	snapshot := readMessage(t, retry)
	payload, _ := json.Marshal(snapshot)
	if strings.Contains(string(payload), token) {
		t.Fatal("saved token leaked")
	}
}
func TestReplacementPermissionsAndHumanReturn(t *testing.T) {
	s := durableServer(t, filepath.Join(t.TempDir(), "rooms.db"))
	room := &Room{Code: "ABCDEF", HostID: "a", Round: 1, MaxPlayers: 2, Started: true, CurrentPlayer: 1, Rolls: 1, Dice: [5]int{2, 2, 3, 4, 5}, clients: map[string]*client{}, Players: []*Player{
		{ID: "a", Name: "Host", Online: true, Ready: true, Scores: map[string]int{}},
		{ID: "b", Name: "Guest", ReconnectToken: "secret", Ready: true, Scores: map[string]int{"As": 3}},
	}}
	s.rooms[room.Code] = room
	if err := s.handleRoomAction(room, "b", WSMessage{Type: "replace", PlayerID: "a"}); err == nil {
		t.Fatal("non-host can replace")
	}
	if err := s.handleRoomAction(room, "a", WSMessage{Type: "replace", PlayerID: "a"}); err == nil {
		t.Fatal("host replaced self")
	}
	if err := s.handleRoomAction(room, "a", WSMessage{Type: "replace", PlayerID: "b", BotLevel: "easy"}); err != nil {
		t.Fatal(err)
	}
	s.stepBot(room)
	room.mu.Lock()
	if room.CurrentPlayer != 0 || !room.Players[1].Assisted || len(room.Players[1].Scores) != 2 {
		t.Fatal("replacement did not complete turn")
	}
	room.mu.Unlock()
	conn := testDial(t, s)
	conn.WriteJSON(WSMessage{Type: "reconnect", Code: "ABCDEF", PlayerID: "b", Token: "secret"})
	if readMessage(t, conn)["type"] != "session" {
		t.Fatal("return failed")
	}
	readMessage(t, conn)
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.Players[1].BotLevel != "" || !room.Players[1].Online || len(room.Players[1].Scores) != 2 {
		t.Fatal("return lost scores or retained bot control")
	}
}
func TestCompleteGamesAllBotLevels(t *testing.T) {
	for _, level := range []string{"easy", "medium", "hard"} {
		t.Run(level, func(t *testing.T) {
			s := durableServer(t, filepath.Join(t.TempDir(), "rooms.db"))
			bot := newBot(level)
			room := &Room{Code: "ABCDEF", HostID: "h", Round: 1, Started: true, MaxPlayers: 2, Players: []*Player{{ID: "h", Online: true, Scores: map[string]int{}}, bot}}
			for moves := 0; moves < 200; moves++ {
				room.mu.Lock()
				finished := room.Finished
				current := room.CurrentPlayer
				if finished {
					room.mu.Unlock()
					break
				}
				if current == 0 {
					room.Dice = [5]int{1, 2, 3, 4, 5}
					room.Rolls = 1
					cat, _ := bestBotCategory(room.Dice, room.Players[0].Scores, false)
					if err := s.applyRoomActionLocked(room, "h", WSMessage{Type: "score", Category: cat}); err != nil {
						t.Fatal(err)
					}
				} else {
					room.Players[1].LastRollAt = time.Time{}
				}
				room.mu.Unlock()
				if current == 1 {
					s.stepBot(room)
				}
			}
			room.mu.Lock()
			defer room.mu.Unlock()
			if !room.Finished || len(room.MatchHistory) != 1 || len(room.Players[1].Scores) != 13 {
				t.Fatal("bot failed to finish")
			}
			if room.Players[1].BestPlay == nil {
				t.Fatal("no best play")
			}
			if err := s.saveRoomLocked(room); err != nil {
				t.Fatal(err)
			}
			var count int
			s.db.QueryRow("SELECT COUNT(*) FROM results").Scan(&count)
			if count != 1 {
				t.Fatalf("expected human result once, got %d", count)
			}
		})
	}
}
func TestSaveFailureRollsBackAction(t *testing.T) {
	s := durableServer(t, filepath.Join(t.TempDir(), "rooms.db"))
	room := &Room{Code: "ABCDEF", Started: true, Rolls: 1, Dice: [5]int{6, 6, 6, 6, 6}, Players: []*Player{{ID: "a", ReconnectToken: "secret", Scores: map[string]int{}}, {ID: "b", Scores: map[string]int{}}}}
	s.db.Close()
	if err := s.handleRoomAction(room, "a", WSMessage{Type: "score", Category: "Yams"}); err == nil {
		t.Fatal("save failure ignored")
	}
	if room.CurrentPlayer != 0 || room.Rolls != 1 || len(room.Players[0].Scores) != 0 || room.Players[0].ReconnectToken != "secret" {
		t.Fatal("failed commit changed state")
	}
}
func TestBotPausesWithoutHumans(t *testing.T) {
	bot := newBot("easy")
	room := &Room{Started: true, CurrentPlayer: 1, Players: []*Player{{ID: "h", Scores: map[string]int{}}, bot}}
	(&Server{}).stepBot(room)
	if room.Rolls != 0 {
		t.Fatal("bot played while humans absent")
	}
}
