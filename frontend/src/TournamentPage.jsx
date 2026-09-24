import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ConfirmModal from './ConfirmModal'
import {
  confirmSettings,
  deleteTournament,
  getTournament,
  listPlayers,
  listTeams,
  updateTournament,
} from './api'
import { useNotify } from './NotificationContext'
import PlayoffsPanel from './PlayoffsPanel'
import PoolsPanel from './PoolsPanel'
import PoolStandings from './PoolStandings'
import TeamForm from './TeamForm'

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
        disabled={locked || tournament.stage === 'playoffs'}
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

export default function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState(null)
  const [teams, setTeams] = useState([])
  const [hasPools, setHasPools] = useState(false)
  const [showRosters, setShowRosters] = useState(false)
  const [playersByTeam, setPlayersByTeam] = useState({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const notify = useNotify()

  useEffect(() => {
    getTournament(tournamentId).then(setTournament)
    listTeams(tournamentId).then(setTeams)
  }, [tournamentId])

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

  if (!tournament) return null

  return (
    <>
      <h2>{tournament.name}</h2>
      <p>
        <Link to={`/tournaments/${tournamentId}/courts`}>Courts (scorekeeper view)</Link>
      </p>

      <section>
        <h3>Settings</h3>
        <ConfigForm tournamentId={tournamentId} tournament={tournament} onSaved={setTournament} />
      </section>

      {!tournament.settings_confirmed ? (
        <p>Confirm the tournament settings to add teams, pools, and brackets.</p>
      ) : (
        <>
          <section>
            <h3>Teams</h3>
            <label htmlFor="show-rosters">
              <input
                id="show-rosters"
                type="checkbox"
                checked={showRosters}
                onChange={handleToggleRosters}
              />
              Show players
            </label>
            <ul>
              {teams.map((team) => (
                <li key={team.id}>
                  <Link to={`/teams/${team.id}`}>{team.name}</Link> ({team.player_count} players)
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
            <TeamForm
              tournamentId={tournamentId}
              onCreated={(team) => setTeams((current) => [...current, { ...team, player_count: 0 }])}
            />
          </section>

          <section>
            <h3>Pools</h3>
            <PoolsPanel
              tournamentId={tournamentId}
              teams={teams}
              onTeamsChanged={setTeams}
              onPoolsChanged={(pools) => setHasPools(pools.length > 0)}
              renderPool={(pool) => <PoolStandings poolId={pool.id} />}
            />
          </section>

          <section>
            <h3>Playoffs</h3>
            <PlayoffsPanel
              tournamentId={tournamentId}
              teams={teams}
              hasPools={hasPools}
              bestOf={tournament.playoff_best_of ?? 1}
              onChanged={() => getTournament(tournamentId).then(setTournament)}
            />
          </section>
        </>
      )}

      <section>
        <button type="button" onClick={() => setShowDeleteConfirm(true)}>
          Delete tournament
        </button>
      </section>

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
