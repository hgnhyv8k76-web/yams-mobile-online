package main

import (
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"math"
	mrand "math/rand"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	_ "modernc.org/sqlite"
)

//go:embed web/*
var webFS embed.FS

type Player struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Avatar     string         `json:"avatar"`
	Color      string         `json:"color"`
	Scores     map[string]int `json:"scores"`
	JoinedAt   time.Time      `json:"joinedAt"`
	Online     bool           `json:"online"`
	Ready      bool           `json:"ready"`
	LastChatAt time.Time      `json:"-"`
	LastRollAt time.Time      `json:"-"`
}

type ChatMessage struct {
	ID       string    `json:"id"`
	PlayerID string    `json:"playerId"`
	Name     string    `json:"name"`
	Text     string    `json:"text"`
	SentAt   time.Time `json:"sentAt"`
}

type MatchResult struct {
	Round   int            `json:"round"`
	Winner  string         `json:"winner"`
	Scores  map[string]int `json:"scores"`
	EndedAt time.Time      `json:"endedAt"`
}

type Room struct {
	Code          string        `json:"code"`
	HostID        string        `json:"hostId"`
	Players       []*Player     `json:"players"`
	Chat          []ChatMessage `json:"chat"`
	CurrentPlayer int           `json:"currentPlayer"`
	Dice          [5]int        `json:"dice"`
	Held          [5]bool       `json:"held"`
	Rolls         int           `json:"rolls"`
	Started       bool          `json:"started"`
	Finished      bool          `json:"finished"`
	Winner        string        `json:"winner,omitempty"`
	MaxPlayers    int           `json:"maxPlayers"`
	Round         int           `json:"round"`
	MatchHistory  []MatchResult `json:"matchHistory"`
	UpdatedAt     time.Time     `json:"updatedAt"`
	clients       map[string]*websocket.Conn
	mu            sync.Mutex
}

type Server struct {
	rooms    map[string]*Room
	mu       sync.RWMutex
	db       *sql.DB
	upgrader websocket.Upgrader
}

type WSMessage struct {
	Type       string `json:"type"`
	PlayerID   string `json:"playerId,omitempty"`
	Name       string `json:"name,omitempty"`
	Avatar     string `json:"avatar,omitempty"`
	Color      string `json:"color,omitempty"`
	Code       string `json:"code,omitempty"`
	Index      int    `json:"index,omitempty"`
	Held       bool   `json:"held,omitempty"`
	Category   string `json:"category,omitempty"`
	Text       string `json:"text,omitempty"`
	Ready      bool   `json:"ready,omitempty"`
	Reaction   string `json:"reaction,omitempty"`
	MaxPlayers int    `json:"maxPlayers,omitempty"`
}

type Snapshot struct {
	Type string    `json:"type"`
	Room *RoomView `json:"room"`
}

type RoomView struct {
	Code          string        `json:"code"`
	HostID        string        `json:"hostId"`
	Players       []*Player     `json:"players"`
	Chat          []ChatMessage `json:"chat"`
	CurrentPlayer int           `json:"currentPlayer"`
	Dice          [5]int        `json:"dice"`
	Held          [5]bool       `json:"held"`
	Rolls         int           `json:"rolls"`
	Started       bool          `json:"started"`
	Finished      bool          `json:"finished"`
	Winner        string        `json:"winner,omitempty"`
	MaxPlayers    int           `json:"maxPlayers"`
	Round         int           `json:"round"`
	MatchHistory  []MatchResult `json:"matchHistory"`
}

var categories = []string{
	"As", "Deux", "Trois", "Quatre", "Cinq", "Six",
	"Brelan", "Carré", "Full", "Petite suite", "Grande suite", "Yams", "Chance",
}

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "data/yams.db"
	}
	if dir := filepath.Dir(dbPath); dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatal(err)
		}
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := initDB(db); err != nil {
		log.Fatal(err)
	}

	s := &Server{
		rooms: make(map[string]*Room),
		db:    db,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWS)
	mux.HandleFunc("/api/leaderboard", s.handleLeaderboard)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	webRoot, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatal(err)
	}
	mux.Handle("/", http.FileServer(http.FS(webRoot)))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	addr := ":" + port
	log.Printf("Yam's Sandra d'amour V10 démarré sur le port %s", port)
	log.Fatal(http.ListenAndServe(addr, logRequests(mux)))
}

func initDB(db *sql.DB) error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS results(
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		player_name TEXT NOT NULL,
		score INTEGER NOT NULL,
		room_code TEXT NOT NULL,
		played_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_results_score ON results(score DESC);
	`)
	return err
}

func (s *Server) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(`
		SELECT player_name, score, played_at
		FROM results
		ORDER BY score DESC, played_at ASC
		LIMIT 20
	`)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	type row struct {
		Name  string `json:"name"`
		Score int    `json:"score"`
		Date  string `json:"date"`
	}
	var out []row
	for rows.Next() {
		var rr row
		var t time.Time
		if err := rows.Scan(&rr.Name, &rr.Score, &t); err == nil {
			rr.Date = t.Format("02/01/2006")
			out = append(out, rr)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	var room *Room
	var playerID string

	defer func() {
		if room != nil && playerID != "" {
			room.mu.Lock()
			if p := room.playerByID(playerID); p != nil {
				p.Online = false
				room.addSystemMessage(p.Name + " s’est déconnecté.")
			}
			delete(room.clients, playerID)
			room.UpdatedAt = time.Now()
			room.mu.Unlock()
			s.broadcast(room)
		}
		conn.Close()
	}()

	for {
		var msg WSMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}

		switch msg.Type {
		case "create":
			room, playerID, err = s.createRoom(conn, msg)
		case "join":
			room, playerID, err = s.joinRoom(conn, msg)
		case "reconnect":
			room, playerID, err = s.reconnect(conn, msg)
		default:
			if room == nil || playerID == "" {
				err = fmt.Errorf("rejoins d'abord une partie")
				break
			}
			err = s.handleRoomAction(room, playerID, msg)
		}

		if err != nil {
			_ = conn.WriteJSON(map[string]any{"type": "error", "message": err.Error()})
		}
	}
}

func normalizeAvatar(v string) string {
	allowed := map[string]bool{"🎲": true, "❤️": true, "😎": true, "👑": true, "⭐": true, "🚀": true, "🐱": true, "🐶": true}
	if allowed[v] {
		return v
	}
	return "🎲"
}

func normalizeColor(v string) string {
	allowed := map[string]bool{"blue": true, "pink": true, "green": true, "gold": true, "purple": true, "orange": true}
	if allowed[v] {
		return v
	}
	return "blue"
}

func (s *Server) createRoom(conn *websocket.Conn, msg WSMessage) (*Room, string, error) {
	name := strings.TrimSpace(msg.Name)
	if name == "" {
		name = "Joueur"
	}

	maxPlayers := msg.MaxPlayers
	if maxPlayers < 2 {
		maxPlayers = 2
	}
	if maxPlayers > 6 {
		maxPlayers = 6
	}

	playerID := randomID()
	code := s.newRoomCode()

	room := &Room{
		Code:       code,
		HostID:     playerID,
		MaxPlayers: maxPlayers,
		Round:      1,
		Players: []*Player{{
			ID: playerID, Name: name, Avatar: normalizeAvatar(msg.Avatar), Color: normalizeColor(msg.Color), Scores: map[string]int{},
			JoinedAt: time.Now(), Online: true,
		}},
		Dice:      [5]int{1, 1, 1, 1, 1},
		clients:   map[string]*websocket.Conn{playerID: conn},
		UpdatedAt: time.Now(),
	}

	s.mu.Lock()
	s.rooms[code] = room
	s.mu.Unlock()

	s.broadcast(room)
	return room, playerID, nil
}

func (s *Server) joinRoom(conn *websocket.Conn, msg WSMessage) (*Room, string, error) {
	code := strings.ToUpper(strings.TrimSpace(msg.Code))
	s.mu.RLock()
	room := s.rooms[code]
	s.mu.RUnlock()
	if room == nil {
		return nil, "", fmt.Errorf("partie introuvable")
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	if room.Started {
		return nil, "", fmt.Errorf("la partie a déjà commencé")
	}
	if len(room.Players) >= room.MaxPlayers {
		return nil, "", fmt.Errorf("partie complète")
	}

	name := strings.TrimSpace(msg.Name)
	if name == "" {
		name = fmt.Sprintf("Joueur %d", len(room.Players)+1)
	}

	playerID := randomID()
	room.Players = append(room.Players, &Player{
		ID: playerID, Name: name, Avatar: normalizeAvatar(msg.Avatar), Color: normalizeColor(msg.Color), Scores: map[string]int{},
		JoinedAt: time.Now(), Online: true,
	})
	room.clients[playerID] = conn
	room.UpdatedAt = time.Now()
	room.addSystemMessage(name + " a rejoint la partie.")

	go s.broadcast(room)
	return room, playerID, nil
}

func (s *Server) reconnect(conn *websocket.Conn, msg WSMessage) (*Room, string, error) {
	code := strings.ToUpper(strings.TrimSpace(msg.Code))
	s.mu.RLock()
	room := s.rooms[code]
	s.mu.RUnlock()
	if room == nil {
		return nil, "", fmt.Errorf("partie expirée ou introuvable")
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	p := room.playerByID(msg.PlayerID)
	if p == nil {
		return nil, "", fmt.Errorf("joueur introuvable dans cette partie")
	}

	p.Online = true
	room.clients[p.ID] = conn
	room.UpdatedAt = time.Now()
	room.addSystemMessage(p.Name + " s’est reconnecté.")

	go s.broadcast(room)
	return room, p.ID, nil
}

func (s *Server) handleRoomAction(room *Room, playerID string, msg WSMessage) error {
	room.mu.Lock()
	defer room.mu.Unlock()

	switch msg.Type {
	case "start":
		if playerID != room.HostID {
			return fmt.Errorf("seul l'hôte peut démarrer")
		}
		if len(room.Players) < 2 {
			return fmt.Errorf("il faut au moins 2 joueurs")
		}
		for _, pp := range room.Players {
			if !pp.Ready {
				return fmt.Errorf("tous les joueurs doivent être prêts")
			}
		}
		room.Started = true
		room.CurrentPlayer = 0
		room.addSystemMessage("La partie commence !")
		room.Rolls = 0
		room.Held = [5]bool{}
		room.Dice = [5]int{1, 1, 1, 1, 1}

	case "roll":
		if err := room.ensureTurn(playerID); err != nil {
			return err
		}
		p := room.playerByID(playerID)
		if p != nil && time.Since(p.LastRollAt) < 350*time.Millisecond {
			return fmt.Errorf("un peu trop vite")
		}
		if p != nil {
			p.LastRollAt = time.Now()
		}
		if room.Rolls >= 3 {
			return fmt.Errorf("3 lancers maximum")
		}
		for i := 0; i < 5; i++ {
			if !room.Held[i] {
				room.Dice[i] = mrand.Intn(6) + 1
			}
		}
		room.Rolls++

	case "hold":
		if err := room.ensureTurn(playerID); err != nil {
			return err
		}
		if room.Rolls == 0 {
			return fmt.Errorf("lance d'abord les dés")
		}
		if msg.Index < 0 || msg.Index >= 5 {
			return fmt.Errorf("dé invalide")
		}
		room.Held[msg.Index] = msg.Held

	case "ready":
		if room.Started {
			return fmt.Errorf("la partie a déjà commencé")
		}
		p := room.playerByID(playerID)
		if p == nil {
			return fmt.Errorf("joueur introuvable")
		}
		p.Ready = msg.Ready
		if p.Ready {
			room.addSystemMessage(p.Name + " est prêt.")
		} else {
			room.addSystemMessage(p.Name + " n’est plus prêt.")
		}

	case "reaction":
		p := room.playerByID(playerID)
		if p == nil {
			return fmt.Errorf("joueur introuvable")
		}
		allowed := map[string]bool{"❤️": true, "😂": true, "🎲": true, "👏": true}
		if !allowed[msg.Reaction] {
			return fmt.Errorf("réaction invalide")
		}
		room.Chat = append(room.Chat, ChatMessage{ID: randomID(), PlayerID: "system", Name: "Réaction", Text: p.Name + " " + msg.Reaction, SentAt: time.Now()})
		if len(room.Chat) > 100 {
			room.Chat = room.Chat[len(room.Chat)-100:]
		}

	case "chat":
		msgText := strings.TrimSpace(msg.Text)
		if msgText == "" {
			return fmt.Errorf("message vide")
		}
		if len([]rune(msgText)) > 300 {
			return fmt.Errorf("message trop long")
		}
		p := room.playerByID(playerID)
		if p == nil {
			return fmt.Errorf("joueur introuvable")
		}
		if time.Since(p.LastChatAt) < 700*time.Millisecond {
			return fmt.Errorf("attends un instant avant d’envoyer un autre message")
		}
		p.LastChatAt = time.Now()
		room.Chat = append(room.Chat, ChatMessage{
			ID:       randomID(),
			PlayerID: playerID,
			Name:     p.Name,
			Text:     msgText,
			SentAt:   time.Now(),
		})
		if len(room.Chat) > 100 {
			room.Chat = room.Chat[len(room.Chat)-100:]
		}

	case "score":
		if err := room.ensureTurn(playerID); err != nil {
			return err
		}
		if room.Rolls == 0 {
			return fmt.Errorf("lance d'abord les dés")
		}
		if !validCategory(msg.Category) {
			return fmt.Errorf("catégorie invalide")
		}

		p := room.playerByID(playerID)
		if _, exists := p.Scores[msg.Category]; exists {
			return fmt.Errorf("case déjà utilisée")
		}

		score := scoreCategory(room.Dice, msg.Category)
		p.Scores[msg.Category] = score
		if msg.Category == "Yams" && score == 50 {
			room.addSystemMessage("🎉 " + p.Name + " vient de faire un Yams !")
		} else {
			room.addSystemMessage(fmt.Sprintf("%s valide %s pour %d point(s).", p.Name, msg.Category, score))
		}

		if room.allFinished() {
			room.Finished = true
			room.Started = false
			winner := room.Players[0]
			for _, pp := range room.Players[1:] {
				if totalScore(pp.Scores) > totalScore(winner.Scores) {
					winner = pp
				}
			}
			room.Winner = winner.Name
			roundScores := map[string]int{}
			for _, pp := range room.Players {
				roundScores[pp.Name] = totalScore(pp.Scores)
			}
			room.MatchHistory = append(room.MatchHistory, MatchResult{Round: room.Round, Winner: winner.Name, Scores: roundScores, EndedAt: time.Now()})
			if len(room.MatchHistory) > 20 {
				room.MatchHistory = room.MatchHistory[len(room.MatchHistory)-20:]
			}
			for _, pp := range room.Players {
				_, _ = s.db.Exec(
					`INSERT INTO results(player_name,score,room_code,played_at) VALUES(?,?,?,?)`,
					pp.Name, totalScore(pp.Scores), room.Code, time.Now(),
				)
			}
		} else {
			room.CurrentPlayer = (room.CurrentPlayer + 1) % len(room.Players)
			room.Rolls = 0
			room.Held = [5]bool{}
			room.Dice = [5]int{1, 1, 1, 1, 1}
		}

	case "rematch":
		if playerID != room.HostID {
			return fmt.Errorf("seul l'hôte peut lancer une revanche")
		}
		for _, pp := range room.Players {
			pp.Scores = map[string]int{}
			pp.Ready = false
		}
		room.CurrentPlayer = 0
		room.Dice = [5]int{1, 1, 1, 1, 1}
		room.Held = [5]bool{}
		room.Rolls = 0
		room.Finished = false
		room.Started = false
		room.Winner = ""
		room.Round++
		room.addSystemMessage(fmt.Sprintf("Revanche prête ! Manche %d. Tout le monde doit se remettre prêt.", room.Round))

	default:
		return fmt.Errorf("action inconnue")
	}

	room.UpdatedAt = time.Now()
	go s.broadcast(room)
	return nil
}

func (room *Room) ensureTurn(playerID string) error {
	if !room.Started {
		return fmt.Errorf("la partie n'a pas commencé")
	}
	if room.Finished {
		return fmt.Errorf("partie terminée")
	}
	if room.CurrentPlayer < 0 || room.CurrentPlayer >= len(room.Players) {
		return fmt.Errorf("tour invalide")
	}
	if room.Players[room.CurrentPlayer].ID != playerID {
		return fmt.Errorf("ce n'est pas ton tour")
	}
	return nil
}

func (room *Room) addSystemMessage(text string) {
	room.Chat = append(room.Chat, ChatMessage{
		ID:       randomID(),
		PlayerID: "system",
		Name:     "Système",
		Text:     text,
		SentAt:   time.Now(),
	})
	if len(room.Chat) > 100 {
		room.Chat = room.Chat[len(room.Chat)-100:]
	}
}

func (room *Room) playerByID(id string) *Player {
	for _, p := range room.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func (room *Room) allFinished() bool {
	for _, p := range room.Players {
		if len(p.Scores) < len(categories) {
			return false
		}
	}
	return true
}

func (s *Server) broadcast(room *Room) {
	room.mu.Lock()
	view := &RoomView{
		Code:          room.Code,
		HostID:        room.HostID,
		Players:       make([]*Player, 0, len(room.Players)),
		Chat:          append([]ChatMessage(nil), room.Chat...),
		CurrentPlayer: room.CurrentPlayer,
		Dice:          room.Dice,
		Held:          room.Held,
		Rolls:         room.Rolls,
		Started:       room.Started,
		Finished:      room.Finished,
		Winner:        room.Winner,
		MaxPlayers:    room.MaxPlayers,
		Round:         room.Round,
		MatchHistory:  append([]MatchResult(nil), room.MatchHistory...),
	}
	for _, p := range room.Players {
		cp := *p
		cp.Scores = copyScores(p.Scores)
		view.Players = append(view.Players, &cp)
	}
	clients := make([]*websocket.Conn, 0, len(room.clients))
	for _, c := range room.clients {
		clients = append(clients, c)
	}
	room.mu.Unlock()

	msg := Snapshot{Type: "state", Room: view}
	for _, c := range clients {
		_ = c.WriteJSON(msg)
	}
}

func copyScores(in map[string]int) map[string]int {
	out := make(map[string]int, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func validCategory(cat string) bool {
	for _, c := range categories {
		if c == cat {
			return true
		}
	}
	return false
}

func scoreCategory(dice [5]int, cat string) int {
	counts := map[int]int{}
	sum := 0
	for _, d := range dice {
		counts[d]++
		sum += d
	}

	upper := map[string]int{"As": 1, "Deux": 2, "Trois": 3, "Quatre": 4, "Cinq": 5, "Six": 6}
	if face, ok := upper[cat]; ok {
		return face * counts[face]
	}

	switch cat {
	case "Brelan":
		for _, n := range counts {
			if n >= 3 {
				return sum
			}
		}
	case "Carré":
		for _, n := range counts {
			if n >= 4 {
				return sum
			}
		}
	case "Full":
		has2, has3 := false, false
		for _, n := range counts {
			if n == 2 {
				has2 = true
			}
			if n == 3 {
				has3 = true
			}
		}
		if has2 && has3 {
			return 25
		}
	case "Petite suite":
		if hasRun(counts, []int{1, 2, 3, 4}) || hasRun(counts, []int{2, 3, 4, 5}) || hasRun(counts, []int{3, 4, 5, 6}) {
			return 30
		}
	case "Grande suite":
		if hasRun(counts, []int{1, 2, 3, 4, 5}) || hasRun(counts, []int{2, 3, 4, 5, 6}) {
			return 40
		}
	case "Yams":
		for _, n := range counts {
			if n == 5 {
				return 50
			}
		}
	case "Chance":
		return sum
	}
	return 0
}

func hasRun(counts map[int]int, run []int) bool {
	for _, x := range run {
		if counts[x] == 0 {
			return false
		}
	}
	return true
}

func totalScore(scores map[string]int) int {
	upperCats := []string{"As", "Deux", "Trois", "Quatre", "Cinq", "Six"}
	upper := 0
	total := 0
	for _, c := range upperCats {
		upper += scores[c]
	}
	for _, v := range scores {
		total += v
	}
	if upper >= 63 {
		total += 35
	}
	return total
}

func (s *Server) newRoomCode() string {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	for {
		buf := make([]byte, 6)
		for i := range buf {
			buf[i] = letters[mrand.Intn(len(letters))]
		}
		code := string(buf)
		s.mu.RLock()
		_, exists := s.rooms[code]
		s.mu.RUnlock()
		if !exists {
			return code
		}
	}
}

func randomID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

// Keep imports stable if toolchains differ.
var _ = math.Max
var _ = sort.Ints
