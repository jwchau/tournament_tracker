import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { generatePoolSchedule, getPoolMatches } from './api'
import { useAuth } from './auth'
import CorrectionForm from './CorrectionForm'
import Loading from './Loading'
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

const matchAnchor = (match) => `pool-match-${match.id}`
const where = (match) => `Slot ${match.round} · Court ${match.court ?? '–'}`

const gridAnchor = (match, teamId) => `grid-match-${match.id}-${teamId}`
const letter = (index) => String.fromCharCode(65 + index)

// A score as "21–15", the winner's side marked (winner: 'left', 'right' or null).
function Score({ left, right, winner }) {
  return (
    <span className="score-pair">
      <span className={winner === 'left' ? 'score-won' : undefined}>{left}</span>–
      <span className={winner === 'right' ? 'score-won' : undefined}>{right}</span>
    </span>
  )
}

/**
 * The round-robin sheet: every team down and across (lettered, so a head is
 * never read as a standings rank), each cell the result from the row team's
 * side, or when the pair plays. Each result or appointment links to its
 * match in the schedule below; choosing one marks the pairing in both.
 */
function ResultsGrid({ poolTeams, matches, nowSlot, selectedId, onSelect }) {
  function between(rowTeam, columnTeam) {
    return matches.filter(
      (match) =>
        (match.team1_id === rowTeam.id && match.team2_id === columnTeam.id) ||
        (match.team1_id === columnTeam.id && match.team2_id === rowTeam.id),
    )
  }

  function cellEntry(rowTeam, match) {
    const first = match.team1_id === rowTeam.id
    const own = first ? match.team1_score : match.team2_score
    const other = first ? match.team2_score : match.team1_score
    const complete = match.status === 'complete'
    const classes = ['grid-entry']
    if (complete) classes.push('grid-result')
    if (match.round === nowSlot) classes.push('grid-now')
    return (
      <a
        key={match.id}
        id={gridAnchor(match, rowTeam.id)}
        href={`#${matchAnchor(match)}`}
        className={classes.join(' ')}
        aria-current={match.id === selectedId ? 'true' : undefined}
        onClick={() => onSelect(match.id)}
      >
        {complete ? (
          <Score
            left={own}
            right={other}
            winner={match.winner_id === rowTeam.id ? 'left' : match.winner_id ? 'right' : null}
          />
        ) : (
          <span className="grid-when">
            <span aria-hidden="true">
              <span>S{match.round}</span> <span>Ct {match.court ?? '–'}</span>
            </span>
            <span className="visually-hidden">{where(match)}</span>
          </span>
        )}
      </a>
    )
  }

  return (
    <div className="grid-scroll">
      <table className="results-grid" aria-label="Results grid">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Team</span>
            </th>
            {poolTeams.map((team, index) => (
              <th key={team.id} scope="col">
                <abbr title={team.name}>{letter(index)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {poolTeams.map((rowTeam, rowIndex) => (
            <tr key={rowTeam.id}>
              <th scope="row">
                <span className="grid-number">{letter(rowIndex)}</span> {rowTeam.name}
              </th>
              {poolTeams.map((columnTeam) =>
                columnTeam.id === rowTeam.id ? (
                  <td key={columnTeam.id} className="grid-self" />
                ) : (
                  <td key={columnTeam.id}>
                    {between(rowTeam, columnTeam).map((match) => cellEntry(rowTeam, match))}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A pool's results grid and its slot-by-slot schedule. Scores are kept on
 * each court's scoreboard, so an unfinished match links there; a finished
 * one can be corrected here.
 */
export default function PoolSchedule({ pool, teams, onMatchesChange }) {
  // null until the first load, so the generate form doesn't flash for pools
  // that already have a schedule.
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  // The pairing last chosen in the grid or the schedule, marked in both.
  const [selectedId, setSelectedId] = useState(null)
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

  if (matches === null) return <Loading label="Loading schedule" rows={4} />

  if (matches.length === 0) {
    return user ? (
      <form onSubmit={handleGenerate} className="pool-generate">
        <p className="setup-note">No schedule yet. Generate one from the pool’s teams and courts.</p>
        <button type="submit">Generate schedule</button>
        {error && <p className="finish-note">{error}</p>}
      </form>
    ) : (
      <p className="setup-note">The schedule hasn’t been made yet.</p>
    )
  }

  const slots = groupBySlot(matches)
  const nowSlot = slots.find(([, slotMatches]) =>
    slotMatches.some((match) => match.status !== 'complete'),
  )?.[0]

  return (
    <>
      <section aria-labelledby="results-grid-heading" className="board-section pool-results">
        <h3 id="results-grid-heading">Results</h3>
        <ResultsGrid
          poolTeams={poolTeams}
          matches={matches}
          nowSlot={nowSlot}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </section>

      <section aria-labelledby="schedule-heading" className="board-section pool-schedule">
        <h3 id="schedule-heading">Schedule</h3>
        <ol className="slot-list">
          {slots.map(([slot, slotMatches]) => {
            const playing = new Set(slotMatches.flatMap((m) => [m.team1_id, m.team2_id]))
            const [observing, resting] = splitIdle(poolTeams.filter((t) => !playing.has(t.id)))
            const now = slot === nowSlot
            return (
              <li key={slot} className="slot" data-now={now ? '' : undefined}>
                <h4>
                  Slot {slot}
                  {now && (
                    <>
                      {' '}
                      <span className="now-chip">Now</span>
                    </>
                  )}
                </h4>
                <ul className="slot-matches">
                  {slotMatches.map((match) => {
                    const team1 = nameOf(match.team1_id)
                    const team2 = nameOf(match.team2_id)
                    const complete = match.status === 'complete'
                    return (
                      <li
                        key={match.id}
                        id={matchAnchor(match)}
                        className="slot-match"
                        aria-current={match.id === selectedId ? 'true' : undefined}
                      >
                        <span className="court-tag">Court {match.court ?? '–'}</span>
                        <a
                          className="slot-teams"
                          href={`#${gridAnchor(match, match.team1_id)}`}
                          onClick={() => setSelectedId(match.id)}
                        >
                          {`${team1} vs ${team2}`}
                        </a>
                        {match.team1_score != null && (
                          <span className="slot-score" data-live={complete ? undefined : ''}>
                            <span
                              className={
                                complete && match.winner_id === match.team1_id
                                  ? 'score-chip score-won'
                                  : 'score-chip'
                              }
                            >
                              {match.team1_score}
                            </span>
                            <span className="score-sep">–</span>
                            <span
                              className={
                                complete && match.winner_id === match.team2_id
                                  ? 'score-chip score-won'
                                  : 'score-chip'
                              }
                            >
                              {match.team2_score}
                            </span>
                          </span>
                        )}
                        {!complete && match.court != null && (
                          <Link
                            className="slot-court-link"
                            to={`/tournaments/${pool.tournament_id}/courts/${match.court}`}
                          >
                            {user ? `Score on Court ${match.court}` : `Watch Court ${match.court}`}
                          </Link>
                        )}
                        {user && complete && (
                          <CorrectionForm
                            key={`${match.id}-${match.version}`}
                            match={match}
                            team1Name={team1}
                            team2Name={team2}
                            onCorrected={({ match: corrected }) => handleScored(corrected)}
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
                {observing.length > 0 && (
                  <p className="slot-idle">Observing: {observing.map((team) => team.name).join(', ')}</p>
                )}
                {resting.length > 0 && (
                  <p className="slot-idle">Resting: {resting.map((team) => team.name).join(', ')}</p>
                )}
              </li>
            )
          })}
        </ol>
      </section>
    </>
  )
}
