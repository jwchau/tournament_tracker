import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { generatePoolSchedule, getPoolMatches, setMatchRef } from './api'
import { useAuth } from './auth'
import CorrectionForm from './CorrectionForm'
import Loading from './Loading'
import { refName, refUpdate } from './refModel'
import RefSelect from './RefSelect'
import { usePolling } from './usePolling'
import { useMediaQuery } from './useMediaQuery'
import { useRowLimit } from './useRowLimit'
import { groupByRound, roundsInView } from './scheduleView'

const matchAnchor = (match) => `pool-match-${match.id}`

// A pairing's cell in a team's row (a playing or ref cell), named for the
// pairing's first game; the schedule jumps back to the first team's.
const gridAnchor = (pairing, teamId) => `grid-match-${pairing.games[0].id}-${teamId}`

/**
 * A match's ref. Signed in, a dropdown: Automatic (naming who the rules
 * picked), the teams free to ref this game, or N/A.
 */
function MatchRef({ match, eligible, nameOf, signedIn, onChange, saving, error }) {
  if (!signedIn) return <p className="round-ref">Ref: {refName(match, nameOf)}</p>
  return (
    <div className="round-ref">
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
// the winner's in amber once finished, both muted while it's played. One
// pair for each game of the pairing that has a score.
function CellScores({ games, teamId }) {
  return games.map((game) => <CellScore key={game.id} match={game} teamId={teamId} />)
}

function CellScore({ match, teamId }) {
  if (match.team1_score == null) return null
  const first = match.team1_id === teamId
  const own = first ? match.team1_score : match.team2_score
  const other = first ? match.team2_score : match.team1_score
  const complete = match.status === 'complete'
  const chip = (won) => (complete && won ? 'score-chip score-won' : 'score-chip')
  return (
    <span className="round-score" data-live={complete ? undefined : ''}>
      <span className={chip(match.winner_id === teamId)}>{own}</span>
      <span className="score-sep">–</span>
      <span className={chip(match.winner_id != null && match.winner_id !== teamId)}>
        {other}
      </span>
    </span>
  )
}

/**
 * Each team's day: rounds across, the pool's teams down, every cell what that
 * team does in that round: plays whom on which court (with each game's score
 * once there is one), refs which match (an outlined cell), or rests. The round
 * being played is outlined. A playing or ref cell jumps to its match in the
 * schedule below; choosing one marks the match in both.
 */
function ResultsGrid({ poolTeams, rounds, nowRound, selectedId, onSelect, nameOf }) {
  // Beside the standings (from 1024px) the panel takes their height, set in
  // CSS; stacked on narrower screens it shows four teams. Either way the rest
  // scroll under the pinned round heads.
  const besideStandings = useMediaQuery('(min-width: 1024px)')
  const scrollRef = useRef(null)
  const limit = useRowLimit(scrollRef, 'tbody tr', besideStandings ? Infinity : 4, poolTeams.length)

  function cell(team, round) {
    const pairing = round.pairings.find(({ games }) =>
      [games[0].team1_id, games[0].team2_id].includes(team.id),
    )
    const reffed = round.matches.filter((match) => match.ref_team_id === team.id)
    const reffing = reffed[0]
    if (!pairing && !reffing) {
      return (
        <span className="round-cell" data-kind="rest">
          Rest
        </span>
      )
    }
    const target = pairing ? pairing.games : [reffing]
    const chosen = target.find((match) => match.id === selectedId)
    const shared = {
      href: `#${matchAnchor(chosen ?? target[0])}`,
      'aria-current': chosen ? 'true' : undefined,
      onClick: () => onSelect((chosen ?? target[0]).id),
    }
    if (pairing) {
      const first = pairing.games[0]
      const opponent = first.team1_id === team.id ? first.team2_id : first.team1_id
      return (
        <a
          id={gridAnchor(pairing, team.id)}
          className="round-cell"
          data-kind="play"
          {...shared}
        >
          <span className="round-cell-line">
            Ct {first.court ?? '–'} · vs {nameOf(opponent)}
          </span>
          <CellScores games={pairing.games} teamId={team.id} />
        </a>
      )
    }
    return (
      <a className="round-cell" data-kind="ref" {...shared}>
        <span className="round-cell-line">Ref · Ct {reffing.court ?? '–'}</span>
        <span className="round-cell-sub">
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
      <table className="round-grid" aria-label="Results grid">
        <thead>
          <tr>
            <th scope="col" className="round-grid-corner">
              <span className="visually-hidden">Team</span>
            </th>
            {rounds.map(({ round }) => (
              <th key={round} scope="col" data-now={round === nowRound ? '' : undefined}>
                Round {round}
                {round === nowRound && <span className="visually-hidden"> (now)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {poolTeams.map((team) => (
            <tr key={team.id}>
              <th scope="row">{team.name}</th>
              {rounds.map((round) => (
                <td key={round.round} data-now={round.round === nowRound ? '' : undefined}>
                  {cell(team, round)}
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
 * A pool's results grid and its round-by-round schedule. Scores are kept on
 * each court's scoreboard, so an unfinished match links there; a finished
 * one can be corrected here.
 */
export default function PoolSchedule({ pool, teams, gamesPerPairing = 1, onMatchesChange }) {
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

  // The schedule shows about three matches' worth of rounds; the rest scroll.
  // A round plays every game of each of its pairings.
  const rounds = groupByRound(matches ?? [], gamesPerPairing)
  const matchesPerRound = Math.max(1, ...rounds.map((round) => round.matches.length))
  const scheduleRef = useRef(null)
  const scheduleLimit = useRowLimit(
    scheduleRef,
    ':scope > .pool-round',
    roundsInView(matchesPerRound),
    matches?.length,
  )
  // Open the schedule on the round being played, once, without moving the page.
  const openedOnNow = useRef(false)
  useEffect(() => {
    const list = scheduleRef.current
    if (openedOnNow.current || !list || !scheduleLimit.limited) return
    const now = list.querySelector(':scope > .pool-round[data-now]')
    // Measured from the list's padding edge, so the round's top ring stays in view.
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

  const nowRound = rounds.find((round) =>
    round.matches.some((match) => match.status !== 'complete'),
  )?.round

  return (
    <>
      <section aria-labelledby="results-grid-heading" className="board-section pool-results">
        <h3 id="results-grid-heading">Results</h3>
        <ResultsGrid
          poolTeams={poolTeams}
          rounds={rounds}
          nowRound={nowRound}
          selectedId={selectedId}
          onSelect={setSelectedId}
          nameOf={nameOf}
        />
      </section>

      <section aria-labelledby="schedule-heading" className="board-section pool-schedule">
        <h3 id="schedule-heading">Schedule</h3>
        <ol
          ref={scheduleRef}
          className="round-list"
          style={scheduleLimit.style}
          data-more={scheduleLimit.more ? '' : undefined}
        >
          {rounds.map(({ round, pairings, matches: roundMatches }) => {
            const playing = new Set(roundMatches.flatMap((m) => [m.team1_id, m.team2_id]))
            const idle = poolTeams.filter((team) => !playing.has(team.id))
            const reffing = new Set(roundMatches.map((m) => m.ref_team_id))
            const resting = idle.filter((team) => !reffing.has(team.id))
            const now = round === nowRound
            return (
              <li key={round} className="pool-round" data-now={now ? '' : undefined}>
                <h4>
                  Round {round}
                  {now && (
                    <>
                      {' '}
                      <span className="now-chip">Now</span>
                    </>
                  )}
                </h4>
                <ul className="round-matches">
                  {pairings.flatMap((pairing) =>
                    pairing.games.map((match) => {
                      const team1 = nameOf(match.team1_id)
                      const team2 = nameOf(match.team2_id)
                      const complete = match.status === 'complete'
                      return (
                        <li
                          key={match.id}
                          id={matchAnchor(match)}
                          className="round-match"
                          data-continues={match.gameNumber > 1 ? '' : undefined}
                          aria-current={match.id === selectedId ? 'true' : undefined}
                        >
                          <span className="court-tag">Court {match.court ?? '–'}</span>
                          <div className="round-pairing">
                            <a
                              className="round-teams"
                              href={`#${gridAnchor(pairing, match.team1_id)}`}
                              onClick={() => setSelectedId(match.id)}
                            >
                              {`${team1} vs ${team2}`}
                            </a>
                            {pairing.games.length > 1 && (
                              <span className="game-tag">Game {match.gameNumber}</span>
                            )}
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
                            <span className="round-score" data-live={complete ? undefined : ''}>
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
                              className="round-court-link"
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
                    }),
                  )}
                </ul>
                {resting.length > 0 && (
                  <p className="round-idle">Resting: {resting.map((team) => team.name).join(', ')}</p>
                )}
              </li>
            )
          })}
        </ol>
      </section>
    </>
  )
}
