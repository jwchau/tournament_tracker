import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ConfirmModal from './ConfirmModal'
import {
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

function ConfigForm({ tournamentId, tournament, onSaved }) {
  const [name, setName] = useState(tournament.name)
  const [advancePerPool, setAdvancePerPool] = useState(tournament.advance_per_pool)
  const [playoffBracketCount, setPlayoffBracketCount] = useState(
    tournament.playoff_bracket_count,
  )
  const [courtCount, setCourtCount] = useState(tournament.court_count)
  const [gamesPerPairing, setGamesPerPairing] = useState(tournament.games_per_pairing ?? 1)
  const [targetPoolSize, setTargetPoolSize] = useState(tournament.target_pool_size ?? 4)
  const notify = useNotify()

  async function handleSubmit(event) {
    event.preventDefault()
    const updated = await updateTournament(tournamentId, {
      name,
      advance_per_pool: Number(advancePerPool),
      playoff_bracket_count: Number(playoffBracketCount),
      court_count: Number(courtCount),
      games_per_pairing: Number(gamesPerPairing),
      target_pool_size: Number(targetPoolSize),
    })
    notify('Tournament settings saved')
    onSaved(updated)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="tournament-name">Tournament name</label>
      <input
        id="tournament-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <label htmlFor="advance-per-pool">Advance per pool</label>
      <input
        id="advance-per-pool"
        type="number"
        value={advancePerPool}
        onChange={(event) => setAdvancePerPool(event.target.value)}
      />

      <label htmlFor="playoff-bracket-count">Playoff bracket count</label>
      <input
        id="playoff-bracket-count"
        type="number"
        value={playoffBracketCount}
        onChange={(event) => setPlayoffBracketCount(event.target.value)}
      />

      <label htmlFor="court-count">Court count</label>
      <input
        id="court-count"
        type="number"
        value={courtCount}
        onChange={(event) => setCourtCount(event.target.value)}
      />

      <label htmlFor="games-per-pairing">Games per pairing</label>
      <input
        id="games-per-pairing"
        type="number"
        min="1"
        value={gamesPerPairing}
        onChange={(event) => setGamesPerPairing(event.target.value)}
      />

      <label htmlFor="target-pool-size">Target pool size</label>
      <input
        id="target-pool-size"
        type="number"
        min="2"
        value={targetPoolSize}
        onChange={(event) => setTargetPoolSize(event.target.value)}
      />

      <button type="submit">Save</button>
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

      <section>
        <h3>Settings</h3>
        <ConfigForm tournamentId={tournamentId} tournament={tournament} onSaved={setTournament} />
      </section>

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
        <PlayoffsPanel tournamentId={tournamentId} teams={teams} hasPools={hasPools} />
      </section>

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
