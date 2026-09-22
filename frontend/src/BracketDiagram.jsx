import { useEffect, useState } from 'react'

import { getBracket } from './api'
import { createCircuitBreaker } from './circuitBreaker'
import CorrectionForm from './CorrectionForm'
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
const MAX_LABEL_LENGTH = 18

function teamName(teamsById, teamId) {
  return teamsById[teamId]?.name ?? `Team ${teamId}`
}

function slotLabel(teamsById, teamId, status) {
  if (teamId != null) return teamName(teamsById, teamId)
  return status === 'complete' ? 'BYE' : 'TBD'
}

function truncate(label) {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label
}

function matchY(round, position) {
  const spacing = ROW_UNIT * 2 ** (round - 1)
  return spacing * (position - 1) + spacing / 2
}

export default function BracketDiagram({ tournamentId, teams = [] }) {
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

  function handleCorrected({ match: corrected, reset_matches: resetMatches }) {
    const updatedById = Object.fromEntries(
      [corrected, ...resetMatches].map((match) => [match.id, match]),
    )
    setMatches((current) => current.map((match) => updatedById[match.id] ?? match))
  }

  const byId = Object.fromEntries(matches.map((match) => [match.id, match]))
  const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]))
  const finalMatch = matches.find((match) => match.winner_next_match_id == null)
  const champion =
    finalMatch?.status === 'complete' && finalMatch.winner_id != null
      ? teamName(teamsById, finalMatch.winner_id)
      : null
  const scorable = matches.filter(
    (match) =>
      match.team1_id != null && match.team2_id != null && match.status !== 'complete',
  )
  const correctable = matches.filter(
    (match) =>
      match.team1_id != null && match.team2_id != null && match.status === 'complete',
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
      {champion && (
        <section aria-label="Champion">
          <h4>Champion</h4>
          <p>🏆 {champion}</p>
        </section>
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
            {[match.team1_id, match.team2_id].map((teamId, index) => {
              const label = slotLabel(teamsById, teamId, match.status)
              const shown = truncate(label)
              return (
                <text key={index} y={(MATCH_HEIGHT * (index + 1)) / 3}>
                  {shown !== label && <title>{label}</title>}
                  {shown}
                </text>
              )
            })}
          </g>
        ))}
      </svg>
      {scorable.map((match) => (
        <ScoreEntryForm
          key={match.id}
          match={match}
          team1Name={teamName(teamsById, match.team1_id)}
          team2Name={teamName(teamsById, match.team2_id)}
          onScored={handleScored}
        />
      ))}
      {correctable.map((match) => (
        <CorrectionForm
          key={`${match.id}-${match.version}`}
          match={match}
          team1Name={teamName(teamsById, match.team1_id)}
          team2Name={teamName(teamsById, match.team2_id)}
          onCorrected={handleCorrected}
        />
      ))}
    </>
  )
}
