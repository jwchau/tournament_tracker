import { useEffect, useState } from 'react'

import { generatePoolSchedule, getPoolMatches } from './api'
import { useAuth } from './auth'
import ScoreEntryForm from './ScoreEntryForm'
import { usePolling } from './usePolling'

function groupBySlot(matches) {
  const slots = new Map()
  for (const match of matches) {
    if (!slots.has(match.round)) slots.set(match.round, [])
    slots.get(match.round).push(match)
  }
  return [...slots.entries()].sort(([a], [b]) => a - b)
}

// Observing vs. resting is only a display label for idle teams (scheduling only tracks playing vs. idle):
// split them as evenly as possible, observers first.
function splitIdle(idleTeams) {
  const observing = Math.ceil(idleTeams.length / 2)
  return [idleTeams.slice(0, observing), idleTeams.slice(observing)]
}

function scoreText(match) {
  return match.team1_score != null ? ` — ${match.team1_score}–${match.team2_score}` : ''
}

export default function PoolSchedule({ pool, teams, onMatchesChange }) {
  // null until the first load, so the generate form doesn't flash for pools
  // that already have a schedule.
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  const { user } = useAuth()

  usePolling(() => getPoolMatches(pool.id), setMatches, pool.id)

  useEffect(() => {
    if (matches !== null) onMatchesChange?.(matches)
  }, [matches, onMatchesChange])

  const poolTeams = teams.filter((team) => team.pool_id === pool.id)
  const nameOf = (teamId) => teams.find((team) => team.id === teamId)?.name ?? `Team ${teamId}`

  async function handleGenerate(event) {
    event.preventDefault()
    setError(null)
    try {
      setMatches(await generatePoolSchedule(pool.id))
    } catch (failure) {
      const body = await failure?.json?.().catch(() => null)
      setError(body?.detail ?? "Couldn't generate the schedule.")
    }
  }

  function handleScored(updated) {
    setMatches((current) =>
      (current ?? []).map((match) => (match.id === updated.id ? updated : match)),
    )
  }

  return (
    <>
      {user && matches?.length === 0 && (
        <form onSubmit={handleGenerate}>
          <button type="submit">Generate schedule</button>
          {error && <p>{error}</p>}
        </form>
      )}

      <ol>
        {groupBySlot(matches ?? []).map(([slot, slotMatches]) => {
          const playing = new Set(slotMatches.flatMap((m) => [m.team1_id, m.team2_id]))
          const [observing, resting] = splitIdle(poolTeams.filter((t) => !playing.has(t.id)))
          return (
            <li key={slot}>
              <h5>Slot {slot}</h5>
              <ul>
                {slotMatches.map((match) => (
                  <li key={match.id}>
                    {`Court ${match.court}: ${nameOf(match.team1_id)} vs ${nameOf(match.team2_id)}${scoreText(match)}`}
                  </li>
                ))}
              </ul>
              {observing.length > 0 && (
                <p>Observing: {observing.map((team) => team.name).join(', ')}</p>
              )}
              {resting.length > 0 && <p>Resting: {resting.map((team) => team.name).join(', ')}</p>}
              {user &&
                slotMatches
                  .filter((match) => match.status !== 'complete')
                  .map((match) => (
                    <ScoreEntryForm
                      key={match.id}
                      match={match}
                      team1Name={nameOf(match.team1_id)}
                      team2Name={nameOf(match.team2_id)}
                      onScored={handleScored}
                    />
                  ))}
            </li>
          )
        })}
      </ol>
    </>
  )
}
