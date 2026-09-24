import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ConfirmModal from './ConfirmModal'
import {
  confirmSettings,
  deleteTournament,
  getTournament,
  getTournamentResults,
  listPlayers,
  listTeams,
  updateTournament,
} from './api'
import { useAuth } from './auth'
import Loading from './Loading'
import NotFound from './NotFound'
import { useNotify } from './NotificationContext'
import { useNotifyFailure } from './useNotifyFailure'
import PlayoffsPanel from './PlayoffsPanel'
import PoolsPanel from './PoolsPanel'
import PoolStandings from './PoolStandings'
import { stageLabel } from './stage'
import TeamForm from './TeamForm'
import { useLoad } from './useLoad'

// The settings everything else is built on. A new tournament confirms them
// once (after reviewing them in a dialog) before teams, pools, and brackets
// can be added; after the first score only the name can still change.
function ConfigForm({ tournamentId, tournament, onSaved }) {
  const [name, setName] = useState(tournament.name)
  const [advancePerPool, setAdvancePerPool] = useState(tournament.advance_per_pool)
  const [playoffBracketCount, setPlayoffBracketCount] = useState(
    tournament.playoff_bracket_count,
  )
  const [courtCount, setCourtCount] = useState(tournament.court_count)
  const [gamesPerPairing, setGamesPerPairing] = useState(tournament.games_per_pairing ?? 1)
  const [targetPoolSize, setTargetPoolSize] = useState(tournament.target_pool_size ?? 4)
  const [playoffBestOf, setPlayoffBestOf] = useState(tournament.playoff_best_of ?? 1)
  const [reviewing, setReviewing] = useState(false)
  const notify = useNotify()
  const locked = tournament.settings_locked
  const confirmed = tournament.settings_confirmed

  const settings = [
    ['Advance per pool', 'advance-per-pool', advancePerPool, setAdvancePerPool, undefined],
    ['Playoff bracket count', 'playoff-bracket-count', playoffBracketCount, setPlayoffBracketCount, undefined],
    ['Court count', 'court-count', courtCount, setCourtCount, undefined],
    ['Games per pairing', 'games-per-pairing', gamesPerPairing, setGamesPerPairing, '1'],
    ['Target pool size', 'target-pool-size', targetPoolSize, setTargetPoolSize, '2'],
  ]

  async function save() {
    const updated = await updateTournament(tournamentId, {
      name,
      advance_per_pool: Number(advancePerPool),
      playoff_bracket_count: Number(playoffBracketCount),
      court_count: Number(courtCount),
      games_per_pairing: Number(gamesPerPairing),
      target_pool_size: Number(targetPoolSize),
      playoff_best_of: Number(playoffBestOf),
    })
    if (confirmed) {
      notify('Tournament settings saved')
      onSaved(updated)
      return
    }
    onSaved(await confirmSettings(tournamentId))
    notify('Tournament settings confirmed')
  }

  async function saveOrExplain() {
    try {
      await save()
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to save settings', { type: 'error' })
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (confirmed) {
      await saveOrExplain()
    } else {
      setReviewing(true)
    }
  }

  async function handleConfirm() {
    setReviewing(false)
    await saveOrExplain()
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="tournament-name">Tournament name</label>
      <input
        id="tournament-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      {settings.map(([label, id, value, setValue, min]) => (
        <span key={id}>
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            type="number"
            min={min}
            value={value}
            disabled={locked}
            onChange={(event) => setValue(event.target.value)}
          />
        </span>
      ))}

      <label htmlFor="playoff-best-of">Playoff best-of</label>
      <select
        id="playoff-best-of"
        value={playoffBestOf}
        // Every playoff match is played to this many games; it's fixed once brackets exist.
        disabled={locked || ['playoffs', 'complete'].includes(tournament.stage)}
        onChange={(event) => setPlayoffBestOf(event.target.value)}
      >
        {[1, 3, 5, 7].map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>

      <button type="submit">{confirmed ? 'Save' : 'Save and confirm settings'}</button>
      {locked && <p>Settings are locked once play has started; only the name can change.</p>}

      <ConfirmModal
        open={reviewing}
        title="Confirm settings"
        message={
          <>
            Teams, pools, and brackets are built on these settings:
            {settings.map(([label, id, value]) => (
              <span key={id}>
                <br />
                {label}: {value}
              </span>
            ))}
            <br />
            Playoff best-of: {playoffBestOf}
          </>
        }
        confirmLabel="Confirm"
        cancelLabel="Keep editing"
        onConfirm={handleConfirm}
        onCancel={() => setReviewing(false)}
      />
    </form>
  )
}

// The organizer's tools, off the board: a side drawer on a laptop, full
// screen on a phone. A native <details>, so it opens without script and
// every control stays in the page for assistive tech and tests.
function ManageDrawer({ startOpen, children }) {
  const ref = useRef(null)
  // Only the first render decides; after that the organizer opens and closes it.
  const [initiallyOpen] = useState(startOpen)

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && ref.current?.open) ref.current.open = false
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function close() {
    ref.current.open = false
  }

  return (
    <details
      ref={ref}
      className="manage"
      open={initiallyOpen}
      // A click on the dimmed backdrop lands on the <details> itself.
      onClick={(event) => event.target === event.currentTarget && close()}
    >
      <summary className="manage-toggle">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 6h9M16 6h1M3 14h1M8 14h9" strokeLinecap="round" />
          <circle cx="14" cy="6" r="2" />
          <circle cx="6" cy="14" r="2" />
        </svg>
        Manage
      </summary>
      <div className="manage-panel" role="region" aria-label="Manage tournament">
        <div className="manage-panel-head">
          <h3>Manage</h3>
          <button type="button" className="icon-button" onClick={close} aria-label="Close manage">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </details>
  )
}

// Who won each tier, once every tier has a champion. The rest of the
// placings live on each bracket's page.
function Results({ tournamentId }) {
  const [results, setResults] = useState([])
  const notifyFailure = useNotifyFailure()

  useEffect(() => {
    getTournamentResults(tournamentId)
      .then(setResults)
      .catch((error) => notifyFailure(error, "Couldn't load the results"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  return (
    <section aria-labelledby="results-heading" className="board-section">
      <h3 id="results-heading">Results</h3>
      <ul className="results-list">
        {results.map((tier) => (
          <li key={tier.playoff_bracket_id}>
            <h4>Bracket {tier.tier}</h4>
            <p>
              <span className="result-label">Champion: </span>
              <strong>{tier.champion.name}</strong>
            </p>
            <p className="section-note">Runner-up: {tier.runner_up.name}</p>
            <Link to={`/brackets/${tier.playoff_bracket_id}`}>Full placings</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState(null)
  const [teams, setTeams] = useState([])
  // null until the pools load.
  const [poolCount, setPoolCount] = useState(null)
  const hasPools = poolCount > 0
  const [showRosters, setShowRosters] = useState(false)
  const [playersByTeam, setPlayersByTeam] = useState({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const notify = useNotify()
  const { user } = useAuth()

  const status = useLoad(
    () => Promise.all([getTournament(tournamentId), listTeams(tournamentId)]),
    tournamentId,
    {
      onData: ([loaded, loadedTeams]) => {
        setTournament(loaded)
        setTeams(loadedTeams)
      },
      failureMessage: "Couldn't load the tournament",
    },
  )

  async function handleToggleRosters(event) {
    const next = event.target.checked
    setShowRosters(next)
    if (next) {
      // Rosters already fetched stay cached for the life of the page, so
      // toggling again only asks the backend about teams it hasn't seen.
      const uncached = teams.filter((team) => !(team.id in playersByTeam))
      const entries = await Promise.all(
        uncached.map((team) => listPlayers(team.id).then((players) => [team.id, players])),
      )
      setPlayersByTeam((cached) => ({ ...cached, ...Object.fromEntries(entries) }))
    }
  }

  async function handleDeleteTournament() {
    setShowDeleteConfirm(false)
    try {
      await deleteTournament(tournamentId)
      notify('Tournament deleted')
      navigate('/')
    } catch {
      notify('Failed to delete tournament', { type: 'error' })
    }
  }

  if (status === 'not-found') return <NotFound thing="Tournament" />
  if (status !== 'ready') return <Loading label="Loading tournament" rows={6} />

  const inPlayoffs = ['playoffs', 'complete'].includes(tournament.stage)

  const standings = (
    <section className="board-section" aria-labelledby="standings-heading">
      <div className="section-head">
        <h3 id="standings-heading">Standings</h3>
        <p className="section-note">Updates as scores come in</p>
      </div>
      <PoolsPanel
        tournamentId={tournamentId}
        teams={teams}
        onTeamsChanged={setTeams}
        onPoolsChanged={(pools) => setPoolCount(pools.length)}
        renderPool={(pool) => (
          <PoolStandings poolId={pool.id} advancing={tournament.advance_per_pool} />
        )}
      />
    </section>
  )

  const playoffs = (
    <section className="board-section" aria-labelledby="playoffs-heading">
      <h3 id="playoffs-heading">Playoffs</h3>
      <PlayoffsPanel
        tournamentId={tournamentId}
        teams={teams}
        hasPools={hasPools}
        bestOf={tournament.playoff_best_of ?? 1}
        onChanged={() => getTournament(tournamentId).then(setTournament)}
      />
    </section>
  )

  return (
    <>
      <header className="board-head">
        <div>
          <h2 className="board-title">{tournament.name}</h2>
          <div className="board-meta">
            {tournament.stage && (
              <span className="stage-chip">Stage: {stageLabel(tournament.stage)}</span>
            )}
            <Link to={`/tournaments/${tournamentId}/courts`}>Courts (scorekeeper view)</Link>
          </div>
        </div>
        {user && (
          <ManageDrawer startOpen={!tournament.settings_confirmed}>
            <section aria-labelledby="settings-heading">
              <h4 id="settings-heading">Settings</h4>
              <ConfigForm tournamentId={tournamentId} tournament={tournament} onSaved={setTournament} />
            </section>
            {tournament.settings_confirmed && (
              <section aria-labelledby="add-team-heading">
                <h4 id="add-team-heading">Add a team</h4>
                <TeamForm
                  tournamentId={tournamentId}
                  onCreated={(team) =>
                    setTeams((current) => [...current, { ...team, player_count: 0 }])
                  }
                />
              </section>
            )}
            <section className="danger-zone">
              <button type="button" onClick={() => setShowDeleteConfirm(true)}>
                Delete tournament
              </button>
            </section>
          </ManageDrawer>
        )}
      </header>

      {tournament.stage === 'complete' && <Results tournamentId={tournamentId} />}

      {!tournament.settings_confirmed ? (
        <p className="setup-note">
          {user
            ? 'Confirm the tournament settings to add teams, pools, and brackets.'
            : 'This tournament is still being set up.'}
        </p>
      ) : (
        <>
          {inPlayoffs ? playoffs : standings}
          {/* A tournament that went straight to a bracket has no standings to show. */}
          {inPlayoffs ? poolCount !== 0 && standings : playoffs}

          <section className="board-section" aria-labelledby="teams-heading">
            <div className="section-head">
              <h3 id="teams-heading">Teams</h3>
              <label htmlFor="show-rosters">
                <input
                  id="show-rosters"
                  type="checkbox"
                  checked={showRosters}
                  onChange={handleToggleRosters}
                />
                Show players
              </label>
            </div>
            <ul className="team-list">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link to={`/teams/${team.id}`}>{team.name}</Link> ({team.player_count}{' '}
                  {team.player_count === 1 ? 'player' : 'players'})
                  {showRosters && (
                    <ul>
                      {(playersByTeam[team.id] ?? []).map((player) => (
                        <li key={player.id}>{player.name}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete tournament"
        message={`Delete "${tournament.name}"? This also removes its teams, players, and bracket. This can't be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteTournament}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  )
}
