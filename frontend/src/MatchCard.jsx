import { Link } from 'react-router-dom'

import { bothTeamsKnown, matchStatus, slotLabel } from './bracketModel'

// A team's score on a card: a series' games won, a finished game's score, or
// a single game's running score while it's played (shown muted).
function cardScore(match, index, bestOf) {
  const score = [match.team1_score, match.team2_score][index]
  const teamId = [match.team1_id, match.team2_id][index]
  if (teamId == null || score == null) return null
  if (bestOf > 1 || match.status === 'complete') return { value: score, live: false }
  return { value: score, live: true }
}

// The match's two teams, each with its score as a small flip card.
export function MatchTeams({ match, teamsById, bestOf }) {
  return [match.team1_id, match.team2_id].map((teamId, index) => {
    const score = cardScore(match, index, bestOf)
    const decided = match.status === 'complete' && match.winner_id != null
    const won = decided && teamId === match.winner_id
    const lost = decided && teamId != null && teamId !== match.winner_id
    return (
      <span key={index} className={lost ? 'card-team lost' : 'card-team'}>
        <span className="card-team-name">{slotLabel(teamsById, teamId, match.status)}</span>
        {score && (
          <span
            className={`score-chip${won ? ' score-won' : ''}${score.live ? ' score-live' : ''}`}
          >
            {score.value}
          </span>
        )}
      </span>
    )
  })
}

/**
 * One match as a card: its teams and scores open it; beneath, where it
 * stands and its court. A match being played on a court is marked live.
 * Rendered as an <li> in a round's list, or as a positioned <div> in the tree.
 */
export function BracketCard({
  match,
  label,
  teamsById,
  bestOf,
  queuePosition,
  overflow,
  tournamentId,
  signedIn,
  selected,
  onSelect,
  as: Tag = 'li',
  style,
}) {
  const live = match.court != null && bothTeamsKnown(match) && match.status !== 'complete'
  return (
    <Tag
      className="round-card"
      style={style}
      data-live={live ? '' : undefined}
      aria-current={selected ? 'true' : undefined}
    >
      <button
        type="button"
        className="round-card-open"
        aria-label={`${label}: ${slotLabel(teamsById, match.team1_id, match.status)} vs ${slotLabel(teamsById, match.team2_id, match.status)}`}
        onClick={() => onSelect(match.id)}
      >
        <MatchTeams match={match} teamsById={teamsById} bestOf={bestOf} />
      </button>
      <p className="round-card-meta">
        <span>{matchStatus(match, queuePosition, overflow)}</span>
        <CourtLink match={match} tournamentId={tournamentId} signedIn={signedIn} />
      </p>
    </Tag>
  )
}

// "Score on Court 2" for a scorekeeper, "Watch Court 2" for everyone else,
// while the match is on a court.
export function CourtLink({ match, tournamentId, signedIn }) {
  if (match.status === 'complete' || match.court == null || !bothTeamsKnown(match)) return null
  return (
    <Link className="slot-court-link" to={`/tournaments/${tournamentId}/courts/${match.court}`}>
      {signedIn ? `Score on Court ${match.court}` : `Watch Court ${match.court}`}
    </Link>
  )
}
