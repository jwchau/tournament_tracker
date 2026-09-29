import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { generatePoolSchedule, getPoolMatches, setMatchRef } from './api'
import { useAuth } from './auth'
import CorrectionForm from './CorrectionForm'
import Loading from './Loading'
import { refName, refUpdate } from './refModel'
import RefSelect from './RefSelect'
import { usePolling } from './usePolling'
import { useRowLimit } from './useRowLimit'
import { slotsInView } from './scheduleView'

function groupBySlot(matches) {
  const slots = new Map()
  for (const match of matches) {
    if (!slots.has(match.round)) slots.set(match.round, [])
    slots.get(match.round).push(match)
  }
  return [...slots.entries()].sort(([a], [b]) => a - b)
}

const matchAnchor = (match) => `pool-match-${match.id}`

// A match's cell in a team's row (a playing or ref cell); the schedule jumps
// back to the first team's.
const gridAnchor = (match, teamId) => `grid-match-${match.id}-${teamId}`

/**
 * A match's ref. Signed in, a dropdown: Automatic (naming who the rules
 * picked), the teams free to ref this slot, or N/A.
 */
function MatchRef({ match, eligible, nameOf, signedIn, onChange, saving, error }) {
  if (!signedIn) return <p className="slot-ref">Ref: {refName(match, nameOf)}</p>
  return (
    <div className="slot-ref">
      <label>
        Ref{' '}
        <RefSelect
          match={match}
          options={eligible}
          nameOf={nameOf}
          label={`Ref for ${nameOf(match.team1_id)} vs ${nameOf(match.team2_id)}`}
          disabled={saving}
          onChange={onChange}
        />
      </label>
      {error && <p className="finish-note">{error}</p>}
    </div>
  )
}

// A team's score and the other side's, as the schedule's flip-card chips:
// the winner's in amber once finished, both muted while it's played.
function CellScore({ match, teamId }) {
  if (match.team1_score == null) return null
  const first = match.team1_id === teamId
  const own = first ? match.team1_score : match.team2_score
  const other = first ? match.team2_score : match.team1_score
  const complete = match.status === 'complete'
  const chip = (won) => (complete && won ? 'score-chip score-won' : 'score-chip')
  return (
    <span className="slot-score" data-live={complete ? undefined : ''}>
      <span className={chip(match.winner_id === teamId)}>{own}</span>
      <span className="score-sep">–</span>
      <span className={chip(match.winner_id != null && match.winner_id !== teamId)}>
        {other}
      </span>
    </span>
  )
}

/**
 * Each team's day: slots across, the pool's teams down, every cell what that
 * team does in that slot: plays whom on which court (with the score once
 * there is one), refs which match (an outlined cell), or rests. The slot
 * being played is outlined. A playing or ref cell jumps to its match in the
 * schedule below; choosing one marks the match in both.
 */
function ResultsGrid({ poolTeams, slots, nowSlot, selectedId, onSelect, nameOf }) {
  // Four teams in view; the rest scroll under the pinned slot heads.
  const scrollRef = useRef(null)
  const limit = useRowLimit(scrollRef, 'tbody tr', 4, poolTeams.length)

  function cell(team, slotMatches) {
    const playing = slotMatches.find(
      (match) => match.team1_id === team.id || match.team2_id === team.id,
    )
    const reffing = slotMatches.find((match) => match.ref_team_id === team.id)
    const match = playing ?? reffing
    if (!match) {
      return (
        <span className="slot-cell" data-kind="rest">
          Rest
        </span>
      )
    }
    const shared = {
      href: `#${matchAnchor(match)}`,
      'aria-current': match.id === selectedId ? 'true' : undefined,
      onClick: () => onSelect(match.id),
    }
    if (playing) {
      const opponent = playing.team1_id === team.id ? playing.team2_id : playing.team1_id
      return (
        <a
          id={gridAnchor(playing, team.id)}
          className="slot-cell"
          data-kind="play"
          {...shared}
        >
          <span className="slot-cell-line">
            Ct {playing.court ?? '–'} · vs {nameOf(opponent)}
          </span>
          <CellScore match={playing} teamId={team.id} />
        </a>
      )
    }
    return (
      <a className="slot-cell" data-kind="ref" {...shared}>
        <span className="slot-cell-line">Ref · Ct {reffing.court ?? '–'}</span>
        <span className="slot-cell-sub">
          {nameOf(reffing.team1_id)} v {nameOf(reffing.team2_id)}
        </span>
      </a>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="grid-scroll"
      style={limit.style}
      data-more={limit.more ? '' : undefined}
    >
      <table className="slot-grid" aria-label="Results grid">
        <thead>
          <tr>
            <th scope="col" className="slot-grid-corner">
              <span className="visually-hidden">Team</span>
            </th>
            {slots.map(([slot]) => (
              <th key={slot} scope="col" data-now={slot === nowSlot ? '' : undefined}>
                Slot {slot}
                {slot === nowSlot && <span className="visually-hidden"> (now)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {poolTeams.map((team) => (
            <tr key={team.id}>
              <th scope="row">{team.name}</th>
              {slots.map(([slot, slotMatches]) => (
                <td key={slot} data-now={slot === nowSlot ? '' : undefined}>
                  {cell(team, slotMatches)}
                </td>
              ))}
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
  // The match whose ref is being saved, and why the last ref change failed.
  const [savingRefId, setSavingRefId] = useState(null)
  const [refError, setRefError] = useState(null)
  const { user } = useAuth()

  // The schedule shows about three matches' worth of slots; the rest scroll.
  // Courts in use are the most matches any slot plays at once.
  const courtsInUse = Math.max(
    1,
    ...groupBySlot(matches ?? []).map(([, slotMatches]) => slotMatches.length),
  )
  const scheduleRef = useRef(null)
  const scheduleLimit = useRowLimit(
    scheduleRef,
    ':scope > .slot',
    slotsInView(courtsInUse),
    matches?.length,
  )
  // Open the schedule on the slot being played, once, without moving the page.
  const openedOnNow = useRef(false)
  useEffect(() => {
    const list = scheduleRef.current
    if (openedOnNow.current || !list || !scheduleLimit.limited) return
    const now = list.querySelector(':scope > .slot[data-now]')
    // Measured from the list's padding edge, so the slot's top ring stays in view.
    const padding = parseFloat(getComputedStyle(list).paddingTop) || 0
    if (now) list.scrollTop = Math.max(0, now.offsetTop - list.offsetTop - padding)
    openedOnNow.current = true
  }, [scheduleLimit.limited])

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

  async function handleRefChange(match, choice) {
    setSavingRefId(match.id)
    setRefError(null)
    try {
      await setMatchRef(match.id, { ...refUpdate(choice), version: match.version })
      // Other matches' automatic refs can move to make room, so reload them all.
      setMatches(await getPoolMatches(pool.id))
    } catch (failure) {
      const body = await failure?.json?.().catch(() => null)
      setRefError({ matchId: match.id, message: body?.detail ?? "Couldn't change the ref." })
    } finally {
      setSavingRefId(null)
    }
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
          slots={slots}
          nowSlot={nowSlot}
          selectedId={selectedId}
          onSelect={setSelectedId}
          nameOf={nameOf}
        />
      </section>

      <section aria-labelledby="schedule-heading" className="board-section pool-schedule">
        <h3 id="schedule-heading">Schedule</h3>
        <ol
          ref={scheduleRef}
          className="slot-list"
          style={scheduleLimit.style}
          data-more={scheduleLimit.more ? '' : undefined}
        >
          {slots.map(([slot, slotMatches]) => {
            const playing = new Set(slotMatches.flatMap((m) => [m.team1_id, m.team2_id]))
            const idle = poolTeams.filter((team) => !playing.has(team.id))
            const reffing = new Set(slotMatches.map((m) => m.ref_team_id))
            const resting = idle.filter((team) => !reffing.has(team.id))
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
                        <div className="slot-pairing">
                          <a
                            className="slot-teams"
                            href={`#${gridAnchor(match, match.team1_id)}`}
                            onClick={() => setSelectedId(match.id)}
                          >
                            {`${team1} vs ${team2}`}
                          </a>
                          <MatchRef
                            match={match}
                            eligible={idle}
                            nameOf={nameOf}
                            signedIn={Boolean(user)}
                            onChange={handleRefChange}
                            saving={savingRefId === match.id}
                            error={refError?.matchId === match.id ? refError.message : null}
                          />
                        </div>
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
