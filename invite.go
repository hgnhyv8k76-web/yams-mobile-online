package main

import (
	"net/http"
	"net/url"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

func (s *Server) handleInviteQR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
		return
	}
	code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))
	origin, err := url.Parse(r.URL.Query().Get("origin"))
	if err != nil || origin == nil || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Host != r.Host || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || (origin.Path != "" && origin.Path != "/") || len(origin.String()) > 300 {
		http.Error(w, "Adresse d’invitation invalide", http.StatusBadRequest)
		return
	}
	s.mu.RLock()
	room := s.rooms[code]
	s.mu.RUnlock()
	if room == nil {
		http.Error(w, "Partie introuvable", http.StatusNotFound)
		return
	}
	// Only the public room code is encoded, never a player's resume token.
	link := origin.Scheme + "://" + origin.Host + "/?code=" + url.QueryEscape(code)
	png, err := qrcode.Encode(link, qrcode.Medium, 384)
	if err != nil {
		http.Error(w, "QR code indisponible", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(png)
}
