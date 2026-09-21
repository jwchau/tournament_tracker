import { useEffect, useState } from 'react'

import { getBracket } from './api'

const MATCH_WIDTH = 140
const MATCH_HEIGHT = 40
const ROUND_GAP = 60
const ROW_UNIT = 60

function slotLabel(teamId, status) {
  if (teamId != null) return `Team ${teamId}`
  return status === 'complete' ? 'BYE' : 'TBD'
}

function matchY(round, position) {
  const spacing = ROW_UNIT * 2 ** (round - 1)
  return spacing * (position - 1) + spacing / 2
}

export default function BracketDiagram({ tournamentId }) {
  const [matches, setMatches] = useState([])

  useEffect(() => {
    getBracket(tournamentId).then(setMatches)
  }, [tournamentId])

  const byId = Object.fromEntries(matches.map((match) => [match.id, match]))
  const rounds = [...new Set(matches.map((match) => match.round))]
  const height = matches.length
    ? Math.max(...matches.map((match) => matchY(match.round, match.position))) + ROW_UNIT
    : 0

  return (
    <svg
      role="img"
      aria-label="Bracket"
      width={rounds.length * (MATCH_WIDTH + ROUND_GAP)}
      height={height}
    >
      {matches
        .filter((match) => match.winner_next_match_id)
        .map((match) => {
          const next = byId[match.winner_next_match_id]
          if (!next) return null
          const x1 = (match.round - 1) * (MATCH_WIDTH + ROUND_GAP) + MATCH_WIDTH
          const y1 = matchY(match.round, match.position) + MATCH_HEIGHT / 2
          const x2 = (next.round - 1) * (MATCH_WIDTH + ROUND_GAP)
          const y2 = matchY(next.round, next.position) + MATCH_HEIGHT / 2
          return (
            <line
              key={match.id}
              data-testid={`line-${match.id}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="black"
            />
          )
        })}
      {matches.map((match) => (
        <g
          key={match.id}
          data-testid={`match-${match.round}-${match.position}`}
          transform={`translate(${(match.round - 1) * (MATCH_WIDTH + ROUND_GAP)}, ${matchY(
            match.round,
            match.position,
          )})`}
        >
          <rect width={MATCH_WIDTH} height={MATCH_HEIGHT} fill="white" stroke="black" />
          <text y={MATCH_HEIGHT / 3}>{slotLabel(match.team1_id, match.status)}</text>
          <text y={(MATCH_HEIGHT * 2) / 3}>{slotLabel(match.team2_id, match.status)}</text>
        </g>
      ))}
    </svg>
  )
}
