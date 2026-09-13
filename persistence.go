package main

import (
	"encoding/json"
	"fmt"
	"time"
)

// Tokens are stored only in the database envelope, never in a public snapshot.
type savedRoom struct {
	Room     *Room                `json:"room"`
	Tokens   map[string]string    `json:"tokens"`
	LastRoll map[string]time.Time `json:"lastRoll"`
	LastChat map[string]time.Time `json:"lastChat"`
}

// Caller holds room.mu, or owns a room that has not been published yet.
func encodeRoom(room *Room) []byte {
	tokens := make(map[string]string)
	rolls := map[string]time.Time{}
	chats := map[string]time.Time{}
	for _, p := range room.Players {
		tokens[p.ID] = p.ReconnectToken
		rolls[p.ID] = p.LastRollAt
		chats[p.ID] = p.LastChatAt
	}
	data, err := json.Marshal(savedRoom{Room: room, Tokens: tokens, LastRoll: rolls, LastChat: chats})
	if err != nil {
		panic(err)
	} // The model contains only JSON-safe values.
	return data
}

func restoreRoom(room *Room, data []byte) error {
	// Reset exported fields without copying mutexes or replacing live connections.
	var saved savedRoom
	if err := json.Unmarshal(data, &saved); err != nil {
		return err
	}
	if saved.Room == nil {
		return fmt.Errorf("sauvegarde de partie vide")
	}
	r := saved.Room
	room.Code = r.Code
	room.HostID = r.HostID
	room.Players = r.Players
	room.Chat = r.Chat
	room.CurrentPlayer = r.CurrentPlayer
	room.Dice = r.Dice
	room.Held = r.Held
	room.Rolls = r.Rolls
	room.Started = r.Started
	room.Finished = r.Finished
	room.Winner = r.Winner
	room.MaxPlayers = r.MaxPlayers
	room.Round = r.Round
	room.MatchHistory = r.MatchHistory
	room.UpdatedAt = r.UpdatedAt
	for _, p := range room.Players {
		p.ReconnectToken = saved.Tokens[p.ID]
		p.LastRollAt = saved.LastRoll[p.ID]
		p.LastChatAt = saved.LastChat[p.ID]
	}
	return nil
}

func (s *Server) saveRoomLocked(room *Room) error {
	if s.db == nil {
		return nil
	} // In-memory server used by unit tests.
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("sauvegarde indisponible : %w", err)
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`INSERT INTO saved_rooms(code,payload) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload`, room.Code, encodeRoom(room)); err != nil {
		return fmt.Errorf("sauvegarde impossible : %w", err)
	}
	if room.Finished {
		marker, e := tx.Exec(`INSERT OR IGNORE INTO recorded_rounds(code,round) VALUES(?,?)`, room.Code, room.Round)
		if e != nil {
			return e
		}
		inserted, e := marker.RowsAffected()
		if e != nil {
			return e
		}
		if inserted > 0 {
			for _, result := range room.MatchHistory {
				if result.Round != room.Round {
					continue
				}
				for _, p := range result.Players {
					// Robot-assisted sheets are preserved in the room, not the public human leaderboard.
					if p.Assisted {
						continue
					}
					if _, e = tx.Exec(`INSERT INTO results(player_name,score,room_code,played_at) VALUES(?,?,?,?)`, p.Name, p.Score, room.Code, result.EndedAt); e != nil {
						return e
					}
				}
			}
		}
	}
	return tx.Commit()
}

func (s *Server) loadRooms() error {
	rows, err := s.db.Query(`SELECT payload FROM saved_rooms`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var data []byte
		if err = rows.Scan(&data); err != nil {
			return err
		}
		room := &Room{clients: map[string]*client{}}
		if err = restoreRoom(room, data); err != nil {
			return err
		}
		for _, p := range room.Players {
			p.Online = p.BotLevel != ""
		}
		s.rooms[room.Code] = room
	}
	return rows.Err()
}
