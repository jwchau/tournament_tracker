// What a court's scoreboard shows: a single game's score, or a best-of
// series' game in play (its games won are shown beside it).
export function boardScores(match) {
  return match.best_of > 1
    ? { team1: match.game_team1_score ?? 0, team2: match.game_team2_score ?? 0 }
    : { team1: match.team1_score ?? 0, team2: match.team2_score ?? 0 }
}
