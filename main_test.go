package main

import (
	"database/sql"
	"encoding/json"
	"github.com/gorilla/websocket"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestScores(t *testing.T) {
	for _, tc := range []struct {
		dice [5]int
		cat  string
		want int
	}{
		{[5]int{2, 2, 2, 5, 5}, "Full", 25}, {[5]int{2, 2, 2, 2, 2}, "Full", 0},
		{[5]int{1, 2, 3, 4, 4}, "Petite suite", 30}, {[5]int{2, 3, 4, 5, 6}, "Grande suite", 40},
		{[5]int{6, 6, 6, 6, 6}, "Yams", 50}, {[5]int{6, 6, 6, 2, 1}, "Brelan", 21},
	} {
		if got := scoreCategory(tc.dice, tc.cat); got != tc.want {
			t.Errorf("%s: got %d want %d", tc.cat, got, tc.want)
		}
	}
	for _, tc := range []struct{ six, want int }{{17, 62}, {18, 98}} {
		scores := map[string]int{"As": 3, "Deux": 6, "Trois": 9, "Quatre": 12, "Cinq": 15, "Six": tc.six}
		if got := totalScore(scores); got != tc.want {
			t.Errorf("bonus got %d want %d", got, tc.want)
		}
	}
}

func TestInvalidTransitions(t *testing.T) {
	s := &Server{}
	room := &Room{HostID: "a", Started: true, Rolls: 2, Players: []*Player{{ID: "a", Ready: true, Online: true}, {ID: "b", Ready: true, Online: true}}}
	for _, action := range []string{"start", "rematch"} {
		if err := s.handleRoomAction(room, "a", WSMessage{Type: action}); err == nil {
			t.Fatalf("accepted %s", action)
		}
		if room.Rolls != 2 {
			t.Fatal("existing turn reset")
		}
	}
}

func TestSessionReconnect(t *testing.T) {
	s := &Server{rooms: map[string]*Room{}}
	server := httptest.NewServer(http.HandlerFunc(s.handleWS))
	defer server.Close()
	dial := func() *websocket.Conn {
		c, _, e := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { c.Close() })
		return c
	}
	read := func(c *websocket.Conn) map[string]any {
		t.Helper()
		c.SetReadDeadline(time.Now().Add(3 * time.Second))
		var m map[string]any
		if e := c.ReadJSON(&m); e != nil {
			t.Fatal(e)
		}
		return m
	}
	first := dial()
	first.WriteJSON(WSMessage{Type: "create", Name: "Même nom", MaxPlayers: 2})
	session := read(first)
	if session["type"] != "session" || session["token"] == "" {
		t.Fatalf("missing identity: %v", session)
	}
	snap := read(first)
	data, _ := json.Marshal(snap)
	if strings.Contains(string(data), session["token"].(string)) {
		t.Fatal("token leaked in public state")
	}
	bad := dial()
	bad.WriteJSON(WSMessage{Type: "reconnect", Code: session["code"].(string), PlayerID: session["playerId"].(string)})
	if read(bad)["type"] != "error" {
		t.Fatal("reconnect without secret accepted")
	}
	next := dial()
	next.WriteJSON(WSMessage{Type: "reconnect", Code: session["code"].(string), PlayerID: session["playerId"].(string), Token: session["token"].(string)})
	if read(next)["type"] != "session" {
		t.Fatal("reconnect failed")
	}
	read(next)
	next.WriteJSON(WSMessage{Type: "ready", Ready: true})
	for {
		m := read(next)
		if m["type"] != "state" {
			continue
		}
		p := m["room"].(map[string]any)["players"].([]any)[0].(map[string]any)
		if p["online"] != true {
			t.Fatal("old connection marked replacement offline")
		}
		if p["ready"] == true {
			break
		}
	}
}

func TestSameNameAndLeave(t *testing.T) {
	s := &Server{rooms: map[string]*Room{}}
	server := httptest.NewServer(http.HandlerFunc(s.handleWS))
	defer server.Close()
	dial := func() *websocket.Conn {
		c, _, e := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { c.Close() })
		return c
	}
	read := func(c *websocket.Conn) map[string]any {
		t.Helper()
		c.SetReadDeadline(time.Now().Add(3 * time.Second))
		var m map[string]any
		if e := c.ReadJSON(&m); e != nil {
			t.Fatal(e)
		}
		return m
	}
	a := dial()
	a.WriteJSON(WSMessage{Type: "create", Name: "Joueur", MaxPlayers: 2})
	sa := read(a)
	read(a)
	b := dial()
	b.WriteJSON(WSMessage{Type: "join", Name: "Joueur", Code: sa["code"].(string)})
	sb := read(b)
	read(b)
	if sa["playerId"] == sb["playerId"] {
		t.Fatal("same-name identities collide")
	}
	a.WriteJSON(WSMessage{Type: "leave"})
	for {
		if read(a)["type"] == "left" {
			break
		}
	}
	for {
		m := read(b)
		r := m["room"].(map[string]any)
		if len(r["players"].([]any)) == 1 {
			if r["hostId"] != sb["playerId"] {
				t.Fatal("host not transferred")
			}
			break
		}
	}
}

func TestFinishedRoundPreservesIdentitiesAndTies(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := initDB(db); err != nil {
		t.Fatal(err)
	}
	s := &Server{db: db, rooms: map[string]*Room{}}
	room := &Room{Code: "ABCDEF", HostID: "a", Round: 1, Started: true, Rolls: 1,
		CurrentPlayer: 1, Dice: [5]int{1, 1, 1, 1, 1}, MaxPlayers: 3,
		Players: []*Player{{ID: "a", Name: "Alex", Scores: map[string]int{}}, {ID: "b", Name: "Alex", Scores: map[string]int{}}}}
	s.rooms[room.Code] = room
	for _, p := range room.Players {
		for _, cat := range categories {
			p.Scores[cat] = 0
		}
	}
	room.Players[0].Scores["Chance"] = 5
	delete(room.Players[1].Scores, "Chance")
	if err := s.handleRoomAction(room, "b", WSMessage{Type: "score", Category: "Chance"}); err != nil {
		t.Fatal(err)
	}
	room.mu.Lock()
	if !room.Finished || room.Started || len(room.MatchHistory) != 1 {
		t.Fatal("round did not finish")
	}
	result := room.MatchHistory[0]
	room.mu.Unlock()
	if len(result.WinnerIDs) != 2 || result.WinnerIDs[0] != "a" || result.WinnerIDs[1] != "b" {
		t.Fatalf("lost tied winners: %+v", result)
	}
	if len(result.Players) != 2 || result.Players[0].Score != 5 || result.Players[1].Score != 5 {
		t.Fatalf("lost same-name scores: %+v", result)
	}
	if _, _, err := s.joinRoom(nil, WSMessage{Code: room.Code, Name: "New"}); err == nil {
		t.Fatal("joined finished round")
	}
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM results").Scan(&count); err != nil || count != 2 {
		t.Fatalf("saved results: count=%d err=%v", count, err)
	}
	if err := s.handleRoomAction(room, "a", WSMessage{Type: "rematch"}); err != nil {
		t.Fatal(err)
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	if len(room.Players[0].Scores) != 0 || room.MatchHistory[0].Players[0].Score != 5 {
		t.Fatal("rematch changed historical results")
	}
}

func TestMatchResultKeepsOnlyHighestScoringWinners(t *testing.T) {
	room := &Room{Players: []*Player{
		{ID: "a", Name: "Alex", Scores: map[string]int{"Chance": 5}},
		{ID: "b", Name: "Alex", Scores: map[string]int{"Chance": 20}},
		{ID: "c", Name: "Sam", Scores: map[string]int{"Chance": 10}},
	}}
	result := room.matchResult()
	if len(result.WinnerIDs) != 1 || result.WinnerIDs[0] != "b" {
		t.Fatalf("wrong winner: %+v", result)
	}
	if len(result.Players) != 3 {
		t.Fatal("same-name player lost")
	}
}
