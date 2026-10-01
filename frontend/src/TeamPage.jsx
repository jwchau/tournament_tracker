import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ConfirmModal from './ConfirmModal'
import { deletePlayer, deleteTeam, getTeam, listPlayers, updateTeam } from './api'
import { hasRole, useAuth } from './auth'
import Loading from './Loading'
import NotFound from './NotFound'
import { useNotify } from './NotificationContext'
import PlayerForm from './PlayerForm'
import { useLoad } from './useLoad'

async function reasonFor(error, fallback) {
  const body = await error?.json?.().catch(() => null)
  return body?.detail ?? fallback
}

export default function TeamPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const [team, setTeam] = useState(null)
  const [name, setName] = useState('')
  const [seed, setSeed] = useState('')
  const [players, setPlayers] = useState([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const notify = useNotify()
  const { user } = useAuth()

  function show(fetched) {
    setTeam(fetched)
    setName(fetched.name)
    setSeed(fetched.seed ?? '')
  }

  const status = useLoad(() => getTeam(teamId), teamId, {
    onData: show,
    failureMessage: "Couldn't load the team",
  })

  useEffect(() => {
    // A missing team is already reported by the load above.
    listPlayers(teamId)
      .then(setPlayers)
      .catch(() => {})
  }, [teamId])

  async function handleSave(event) {
    event.preventDefault()
    const updates = { name }
    // Only a changed seed is sent: seeds lock once play starts, names don't.
    const newSeed = seed === '' ? null : Number(seed)
    if (newSeed !== (team.seed ?? null)) updates.seed = newSeed
    try {
      show(await updateTeam(teamId, updates))
      notify('Team updated')
    } catch (error) {
      notify(await reasonFor(error, 'Failed to update team'), { type: 'error' })
    }
  }

  async function handleDelete() {
    setConfirmingDelete(false)
    try {
      await deleteTeam(teamId)
      notify(`${team.name} deleted`)
      navigate(`/tournaments/${team.tournament_id}`)
    } catch (error) {
      notify(await reasonFor(error, 'Failed to delete team'), { type: 'error' })
    }
  }

  async function handleRemovePlayer(playerId) {
    try {
      await deletePlayer(teamId, playerId)
    } catch (error) {
      notify(await reasonFor(error, 'Failed to remove player'), { type: 'error' })
      return
    }
    setPlayers((current) => current.filter((player) => player.id !== playerId))
  }

  if (status === 'not-found') return <NotFound thing="Team" />
  if (status !== 'ready') return <Loading label="Loading team" />

  const count = `${players.length} ${players.length === 1 ? 'player' : 'players'}`

  return (
    <div className="team-page">
      <header className="court-strip">
        <div className="court-strip-title">
          <h2>{team.name}</h2>
          <p className="court-strip-label">
            {team.seed == null ? 'No seed' : `Seed ${team.seed}`} · {count}
          </p>
        </div>
        <Link to={`/tournaments/${team.tournament_id}`} className="court-strip-link">
          Back to tournament
        </Link>
      </header>

      <div className="team-sheet">
        {hasRole(user, 'organizer') && (
          <section className="board-section" aria-labelledby="team-details-heading">
            <h3 id="team-details-heading">Details</h3>
            <form onSubmit={handleSave} className="team-panel team-details">
              <span className="field team-name-field">
                <label htmlFor="team-page-name">Team name</label>
                <input
                  id="team-page-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </span>
              <span className="field team-seed-field">
                <label htmlFor="team-page-seed">Seed</label>
                <input
                  id="team-page-seed"
                  type="number"
                  min="1"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </span>
              <button type="submit">Save</button>
            </form>
          </section>
        )}

        <section className="board-section" aria-labelledby="roster-heading">
          <h3 id="roster-heading">Roster</h3>
          <div className="team-panel">
            {players.length === 0 && <p className="section-note">No players yet.</p>}
            <ul className="roster-list">
              {players.map((player) => (
                <li key={player.id}>
                  <span className="roster-name">{player.name}</span>
                  {hasRole(user, 'organizer') && (
                    <button
                      type="button"
                      aria-label={`Remove ${player.name}`}
                      onClick={() => handleRemovePlayer(player.id)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {hasRole(user, 'organizer') && (
              <PlayerForm
                teamId={teamId}
                onCreated={(player) => setPlayers((current) => [...current, player])}
              />
            )}
          </div>
        </section>
      </div>

      {hasRole(user, 'organizer') && (
        <section className="danger-zone">
          <button type="button" onClick={() => setConfirmingDelete(true)}>
            Delete team
          </button>
        </section>
      )}

      <ConfirmModal
        open={confirmingDelete}
        title="Delete team"
        message={`Delete "${team.name}" and its players? A team can't be deleted once its pool has a schedule or brackets exist.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  )
}
