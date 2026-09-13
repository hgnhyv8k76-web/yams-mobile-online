package main

import "sort"

type ChallengeStanding struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
	Score    int    `json:"score"`
	Wins     int    `json:"wins"`
}
type ChallengeView struct {
	Completed       bool                `json:"completed"`
	CompletedRounds int                 `json:"completedRounds"`
	Standings       []ChallengeStanding `json:"standings"`
	WinnerIDs       []string            `json:"winnerIds"`
}

func normalizeChallengeRounds(rounds int) int {
	if rounds == 3 || rounds == 5 {
		return rounds
	}
	return 0
}
func (room *Room) challengeInProgress() bool {
	return room.ChallengeRounds > 0 && len(room.MatchHistory) > 0 && !(room.Finished && room.Round >= room.ChallengeRounds)
}
func (room *Room) challengeView() *ChallengeView {
	if room.ChallengeRounds == 0 {
		return nil
	}
	result := &ChallengeView{Completed: room.Finished && room.Round >= room.ChallengeRounds, Standings: []ChallengeStanding{}, WinnerIDs: []string{}}
	byID := map[string]*ChallengeStanding{}
	for _, p := range room.Players {
		byID[p.ID] = &ChallengeStanding{PlayerID: p.ID, Name: p.Name}
	}
	for _, round := range room.MatchHistory {
		if round.Round > room.ChallengeRounds {
			continue
		}
		result.CompletedRounds++
		for _, p := range round.Players {
			standing := byID[p.PlayerID]
			if standing == nil {
				standing = &ChallengeStanding{PlayerID: p.PlayerID, Name: p.Name}
				byID[p.PlayerID] = standing
			}
			standing.Score += p.Score
			for _, id := range round.WinnerIDs {
				if id == p.PlayerID {
					standing.Wins++
					break
				}
			}
		}
	}
	for _, standing := range byID {
		result.Standings = append(result.Standings, *standing)
	}
	sort.Slice(result.Standings, func(i, j int) bool {
		if result.Standings[i].Score != result.Standings[j].Score {
			return result.Standings[i].Score > result.Standings[j].Score
		}
		return result.Standings[i].PlayerID < result.Standings[j].PlayerID
	})
	if result.Completed && len(result.Standings) > 0 {
		for _, p := range result.Standings {
			if p.Score == result.Standings[0].Score {
				result.WinnerIDs = append(result.WinnerIDs, p.PlayerID)
			}
		}
	}
	return result
}
