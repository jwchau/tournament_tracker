import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import BracketDiagram from './BracketDiagram'
import ConfirmModal from './ConfirmModal'
import {
  deleteTournament,
  generateBracket,
  getTournament,
  listPlayers,
  listTeams,
  updateTournament,
} from './api'
import { useNotify } from './NotificationContext'
import PoolSchedule from './PoolSchedule'
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
  const notify = useNotify()

  async function handleSubmit(event) {
    event.preventDefault()
    const updated = await updateTournament(tournamentId, {
      name,
      advance_per_pool: Number(advancePerPool),
      playoff_bracket_count: Number(playoffBracketCount),
      court_count: Number(courtCount),
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

      <button type="submit">Save</button>
    </form>
  )
}

export default function TournamentPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState(null)
  const [teams, setTeams] = useState([])
  const [bracketGenerated, setBracketGenerated] = useState(false)
  const [bracketFormat, setBracketFormat] = useState('single')
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
      const entries = await Promise.all(
        teams.map((team) => listPlayers(team.id).then((players) => [team.id, players])),
      )
      setPlayersByTeam(Object.fromEntries(entries))
    }
  }

  async function handleGenerateBracket() {
    try {
      await generateBracket(tournamentId, { format: bracketFormat })
      setBracketGenerated(true)
      notify('Bracket generated')
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to generate bracket', { type: 'error' })
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
          renderPool={(pool) => (
            <>
              <PoolSchedule pool={pool} teams={teams} />
              <PoolStandings poolId={pool.id} />
            </>
          )}
        />
      </section>

      <section>
        <h3>Bracket</h3>
        <label htmlFor="bracket-format">Format</label>
        <select
          id="bracket-format"
          value={bracketFormat}
          onChange={(event) => setBracketFormat(event.target.value)}
        >
          <option value="single">Single elimination</option>
          <option value="double">Double elimination</option>
        </select>
        <button type="button" onClick={handleGenerateBracket}>
          Generate bracket
        </button>
        {bracketGenerated && <BracketDiagram
            tournamentId={tournamentId}
            teams={teams}
            courtCount={tournament.court_count}
          />}
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
