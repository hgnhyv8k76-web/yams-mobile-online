package main

import (
	"math"
	"math/rand"
	"time"
)

func normalizeLevel(level string) string {
	switch level {
	case "easy", "medium", "hard":
		return level
	}
	return "medium"
}
func levelLabel(level string) string {
	switch level {
	case "easy":
		return "facile"
	case "hard":
		return "difficile"
	}
	return "normal"
}
func newBot(level string) *Player {
	return &Player{ID: randomID(), Name: "Robot · " + levelLabel(level), Avatar: "🤖", Color: "purple", Scores: map[string]int{}, Online: true, Ready: true, BotLevel: level, Assisted: true, JoinedAt: time.Now()}
}

func bestBotCategory(dice [5]int, scores map[string]int, strategic bool) (string, float64) {
	best := ""
	value := math.Inf(-1)
	for i, cat := range categories {
		if _, used := scores[cat]; used {
			continue
		}
		points := scoreCategory(dice, cat)
		utility := float64(points)
		if strategic {
			// Prefer upper-section progress while preserving scarce high-value categories.
			if i < 6 {
				upper := 0
				for _, c := range categories[:6] {
					upper += scores[c]
				}
				if upper < 63 {
					utility += float64(points) * .45
				}
			}
			if points == 0 {
				utility = -float64([]int{3, 6, 9, 12, 15, 18, 20, 24, 25, 30, 40, 50, 22}[i]) * .25
			}
			if cat == "Chance" {
				utility -= 7
			}
		}
		if utility > value {
			best = cat
			value = utility
		}
	}
	return best, value
}

func botDecision(room *Room, p *Player) WSMessage {
	if room.Rolls == 0 {
		return WSMessage{Type: "roll"}
	}
	cat, current := bestBotCategory(room.Dice, p.Scores, p.BotLevel == "hard")
	if room.Rolls >= 3 {
		return WSMessage{Type: "score", Category: cat}
	}
	if p.BotLevel == "easy" {
		// A beginner takes one throw and chooses a random available scoring box.
		choices := []string{}
		for _, c := range categories {
			if _, used := p.Scores[c]; !used && scoreCategory(room.Dice, c) > 0 {
				choices = append(choices, c)
			}
		}
		if len(choices) > 0 {
			cat = choices[rand.Intn(len(choices))]
		}
		return WSMessage{Type: "score", Category: cat}
	}
	if p.BotLevel == "medium" {
		if scoreCategory(room.Dice, cat) >= 25 {
			return WSMessage{Type: "score", Category: cat}
		}
		counts := [7]int{}
		face := 1
		for _, d := range room.Dice {
			counts[d]++
		}
		for d := 2; d <= 6; d++ {
			if counts[d] >= counts[face] {
				face = d
			}
		}
		mask := 0
		for i, d := range room.Dice {
			if d == face {
				mask |= 1 << i
			}
		}
		return WSMessage{Type: "roll", Index: mask}
	}
	// Compare every keep mask using sampled outcomes of a legal reroll.
	// This never reads future dice; actual throws still use the shared game engine.
	bestMask := 31
	best := current
	for mask := 0; mask < 31; mask++ {
		expected := 0.0
		for sample := 0; sample < 64; sample++ {
			dice := room.Dice
			for i := range dice {
				if mask&(1<<i) == 0 {
					dice[i] = rand.Intn(6) + 1
				}
			}
			_, value := bestBotCategory(dice, p.Scores, true)
			expected += value / 64
		}
		if expected > best+.15 {
			best = expected
			bestMask = mask
		}
	}
	if bestMask == 31 {
		return WSMessage{Type: "score", Category: cat}
	}
	return WSMessage{Type: "roll", Index: bestMask}
}

func (s *Server) runBots() {
	ticker := time.NewTicker(1100 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.RLock()
		rooms := make([]*Room, 0, len(s.rooms))
		for _, r := range s.rooms {
			rooms = append(rooms, r)
		}
		s.mu.RUnlock()
		for _, r := range rooms {
			s.stepBot(r)
		}
	}
}
func (s *Server) stepBot(room *Room) {
	room.mu.Lock()
	defer room.mu.Unlock()
	if !room.Started || room.Finished || room.CurrentPlayer < 0 || room.CurrentPlayer >= len(room.Players) {
		return
	}
	p := room.Players[room.CurrentPlayer]
	if p.BotLevel == "" {
		return
	}
	// Pause when everyone has left. Reconnection resumes the scheduler automatically.
	hasHuman := false
	for _, other := range room.Players {
		if other.BotLevel == "" && other.Online {
			hasHuman = true
		}
	}
	if !hasHuman {
		return
	}
	msg := botDecision(room, p)
	originalHeld := room.Held
	if msg.Type == "roll" && room.Rolls > 0 {
		for i := range room.Held {
			room.Held[i] = msg.Index&(1<<i) != 0
		}
	}
	if err := s.applyRoomActionLocked(room, p.ID, msg); err != nil {
		room.Held = originalHeld
	}
}
