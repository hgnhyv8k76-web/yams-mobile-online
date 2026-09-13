package main

import (
	"encoding/json"
	"image/png"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestChallengeTotalsTiesAndPersistence(t *testing.T) {
	for _, length := range []int{3, 5} {
		t.Run(string(rune('0'+length)), func(t *testing.T) {
			s := durableServer(t, filepath.Join(t.TempDir(), "challenge.db"))
			r := &Room{Code: "ABCDEF", HostID: "a", ChallengeRounds: length, Round: length, Finished: true, Players: []*Player{
				{ID: "a", Name: "Alex", Scores: map[string]int{}}, {ID: "b", Name: "Alex", Scores: map[string]int{}},
			}}
			for round := 1; round <= length; round++ {
				r.MatchHistory = append(r.MatchHistory, MatchResult{Round: round, WinnerIDs: []string{"a", "b"}, EndedAt: time.Now(), Players: []MatchScore{{PlayerID: "a", Name: "Alex", Score: 200}, {PlayerID: "b", Name: "Alex", Score: 200}}})
			}
			view := r.challengeView()
			if !view.Completed || len(view.WinnerIDs) != 2 || len(view.Standings) != 2 || view.Standings[0].Score != 200*length || view.CompletedRounds != length {
				t.Fatalf("bad totals: %+v", view)
			}
			if err := s.handleRoomAction(r, "a", WSMessage{Type: "rematch"}); err == nil {
				t.Fatal("allowed extra challenge round")
			}
			if err := s.saveRoomLocked(r); err != nil {
				t.Fatal(err)
			}
			fresh := &Server{db: s.db, rooms: map[string]*Room{}}
			if err := fresh.loadRooms(); err != nil {
				t.Fatal(err)
			}
			if fresh.rooms[r.Code].ChallengeRounds != length || len(fresh.rooms[r.Code].challengeView().WinnerIDs) != 2 {
				t.Fatal("challenge lost on restart")
			}
		})
	}
}
func TestChallengeWinnerUsesCumulativePoints(t *testing.T) {
	r := &Room{ChallengeRounds: 3, Round: 3, Finished: true, MatchHistory: []MatchResult{
		{Round: 1, WinnerIDs: []string{"a"}, Players: []MatchScore{{PlayerID: "a", Name: "A", Score: 250}, {PlayerID: "b", Name: "B", Score: 150}}},
		{Round: 2, WinnerIDs: []string{"a"}, Players: []MatchScore{{PlayerID: "a", Name: "A", Score: 250}, {PlayerID: "b", Name: "B", Score: 150}}},
		{Round: 3, WinnerIDs: []string{"b"}, Players: []MatchScore{{PlayerID: "a", Name: "A", Score: 100}, {PlayerID: "b", Name: "B", Score: 200}}},
	}}
	view := r.challengeView()
	if len(view.WinnerIDs) != 1 || view.WinnerIDs[0] != "a" || view.Standings[0].Score != 600 {
		t.Fatalf("last round confused with challenge: %+v", view)
	}
}
func TestChallengeLocksRosterBetweenRounds(t *testing.T) {
	r := &Room{Code: "ABCDEF", HostID: "a", ChallengeRounds: 3, Round: 1, Finished: true, MaxPlayers: 4, Players: []*Player{{ID: "a", Scores: map[string]int{}}, {ID: "b", Scores: map[string]int{}}}, MatchHistory: []MatchResult{{Round: 1}}}
	s := &Server{rooms: map[string]*Room{r.Code: r}}
	if err := s.handleRoomAction(r, "b", WSMessage{Type: "rematch"}); err == nil {
		t.Fatal("non-host advanced challenge")
	}
	if err := s.handleRoomAction(r, "a", WSMessage{Type: "rematch"}); err != nil {
		t.Fatal(err)
	}
	if r.Round != 2 || !r.challengeInProgress() {
		t.Fatal("challenge did not advance")
	}
	if _, _, err := s.joinRoom(nil, WSMessage{Code: r.Code, Name: "Late"}); err == nil {
		t.Fatal("late join changed challenge roster")
	}
}
func TestInviteQRIsLocalPNGAndRejectsForeignOrigin(t *testing.T) {
	s := &Server{rooms: map[string]*Room{"ABCDEF": {Code: "ABCDEF"}}}
	for _, tc := range []struct {
		origin, code string
		status       int
	}{
		{"https://game.example", "ABCDEF", 200}, {"http://game.example", "ABCDEF", 200},
		{"https://other.example", "ABCDEF", 400}, {"javascript:alert(1)", "ABCDEF", 400}, {"https://user:pass@game.example", "ABCDEF", 400},
		{"https://game.example", "XXXXXX", 404},
	} {
		req := httptest.NewRequest(http.MethodGet, "http://game.example/api/invite-qr", nil)
		q := req.URL.Query()
		q.Set("origin", tc.origin)
		q.Set("code", tc.code)
		req.URL.RawQuery = q.Encode()
		out := httptest.NewRecorder()
		s.handleInviteQR(out, req)
		if out.Code != tc.status {
			t.Fatalf("%s got %d want %d", tc.origin, out.Code, tc.status)
		}
		if out.Code == 200 {
			img, err := png.Decode(out.Body)
			if err != nil || img.Bounds().Dx() != 384 {
				t.Fatalf("bad PNG: %v", err)
			}
		}
	}
}
func TestReactionIsAttributedAndRateLimited(t *testing.T) {
	s := &Server{}
	r := &Room{Players: []*Player{{ID: "a", Name: "Alex", Scores: map[string]int{}}}}
	if err := s.handleRoomAction(r, "a", WSMessage{Type: "reaction", Reaction: "👏"}); err != nil {
		t.Fatal(err)
	}
	if len(r.Chat) != 1 || r.Chat[0].PlayerID != "a" || r.Chat[0].Reaction != "👏" {
		t.Fatal("reaction attribution missing")
	}
	if err := s.handleRoomAction(r, "a", WSMessage{Type: "reaction", Reaction: "❤️"}); err == nil {
		t.Fatal("reaction flood allowed")
	}
	data, _ := json.Marshal(r.Chat[0])
	if strings.Contains(string(data), "token") {
		t.Fatal("unexpected private data")
	}
}

func TestChallengeAdvancesThroughThreeScoredRounds(t *testing.T) {
	s := &Server{}
	room := &Room{Code: "ABCDEF", HostID: "a", ChallengeRounds: 3, Round: 1, Players: []*Player{{ID: "a", Name: "A", Online: true, Ready: true, Scores: map[string]int{}}, {ID: "b", Name: "B", Online: true, Ready: true, Scores: map[string]int{}}}}
	for round := 1; round <= 3; round++ {
		room.mu.Lock()
		for _, p := range room.Players {
			p.Ready = true
			for _, cat := range categories {
				if cat != "Chance" {
					p.Scores[cat] = 0
				}
			}
		}
		room.mu.Unlock()
		if err := s.handleRoomAction(room, "a", WSMessage{Type: "start"}); err != nil {
			t.Fatal(err)
		}
		for _, id := range []string{"a", "b"} {
			room.mu.Lock()
			room.Rolls = 1
			room.Dice = [5]int{1, 2, 3, 4, 5}
			room.mu.Unlock()
			if err := s.handleRoomAction(room, id, WSMessage{Type: "score", Category: "Chance"}); err != nil {
				t.Fatal(err)
			}
		}
		room.mu.Lock()
		view := room.challengeView()
		room.mu.Unlock()
		if view.CompletedRounds != round || view.Standings[0].Score != 15*round || view.Completed != (round == 3) {
			t.Fatalf("bad round %d: %+v", round, view)
		}
		err := s.handleRoomAction(room, "a", WSMessage{Type: "rematch"})
		if round < 3 && err != nil {
			t.Fatal(err)
		}
		if round == 3 && err == nil {
			t.Fatal("fourth round accepted")
		}
	}
}
