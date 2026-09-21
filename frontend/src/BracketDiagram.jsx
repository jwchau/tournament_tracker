import { useEffect, useState } from 'react'

import { getBracket } from './api'
import { createCircuitBreaker } from './circuitBreaker'
import ScoreEntryForm from './ScoreEntryForm'
import { withTimeout } from './withTimeout'

const MATCH_WIDTH = 140
const MATCH_HEIGHT = 40
const ROUND_GAP = 60
const ROW_UNIT = 60
const POLL_INTERVAL_MS = 4000
const REQUEST_TIMEOUT_MS = 5000
const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 30000

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
  const [connectionLost, setConnectionLost] = useState(false)

  useEffect(() => {
    let cancelled = false
    const breaker = createCircuitBreaker({
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
    })

    function refresh() {
      breaker
        .execute(() => withTimeout(getBracket(tournamentId), REQUEST_TIMEOUT_MS))
        .then((data) => {
          if (!cancelled) setMatches(data)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setConnectionLost(breaker.getState() === 'open')
        })
    }

    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [tournamentId])

  function handleScored(updated) {
    setMatches((current) =>
      current.map((match) => (match.id === updated.id ? updated : match)),
    )
  }

  const byId = Object.fromEntries(matches.map((match) => [match.id, match]))
  const scorable = matches.filter(
    (match) =>
      match.team1_id != null && match.team2_id != null && match.status !== 'complete',
  )
  const rounds = [...new Set(matches.map((match) => match.round))]
  const height = matches.length
    ? Math.max(...matches.map((match) => matchY(match.round, match.position))) + ROW_UNIT
    : 0

  return (
    <>
      {connectionLost && (
        <p role="status">
          Connection lost — retrying automatically (checks again every {COOLDOWN_MS / 1000}s).
        </p>
      )}
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
      {scorable.map((match) => (
        <ScoreEntryForm key={match.id} match={match} onScored={handleScored} />
      ))}
    </>
  )
}
