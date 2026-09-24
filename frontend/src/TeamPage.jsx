import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import ConfirmModal from './ConfirmModal'
import { deletePlayer, deleteTeam, getTeam, listPlayers, updateTeam } from './api'
import { useAuth } from './auth'
import { isNotFound } from './failure'
import NotFound from './NotFound'
import { useNotify } from './NotificationContext'
import { useNotifyFailure } from './useNotifyFailure'
import PlayerForm from './PlayerForm'

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
  const [notFound, setNotFound] = useState(false)
  const notify = useNotify()
  const notifyFailure = useNotifyFailure()
  const { user } = useAuth()

  function show(fetched) {
    setTeam(fetched)
    setName(fetched.name)
    setSeed(fetched.seed ?? '')
  }

  useEffect(() => {
    setNotFound(false)
    getTeam(teamId)
      .then(show)
      .catch((error) =>
        isNotFound(error) ? setNotFound(true) : notifyFailure(error, "Couldn't load the team"),
      )
    // A missing team is already reported above.
    listPlayers(teamId)
      .then(setPlayers)
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (notFound) return <NotFound thing="Team" />
  if (!team) return null

  return (
    <>
      {user ? (
        <>
          <h2>Team</h2>
          <form onSubmit={handleSave}>
            <label htmlFor="team-page-name">Team name</label>
            <input
              id="team-page-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label htmlFor="team-page-seed">Seed</label>
            <input
              id="team-page-seed"
              type="number"
              min="1"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
            />
            <button type="submit">Save</button>
          </form>
        </>
      ) : (
        <h2>{team.name}</h2>
      )}

      <section>
        <h3>Roster</h3>
        <ul>
          {players.map((player) => (
            <li key={player.id}>
              {player.name}{' '}
              {user && (
                <button type="button" onClick={() => handleRemovePlayer(player.id)}>
                  Remove {player.name}
                </button>
              )}
            </li>
          ))}
        </ul>
        {user && (
          <PlayerForm
            teamId={teamId}
            onCreated={(player) => setPlayers((current) => [...current, player])}
          />
        )}
      </section>

      {user && (
        <section>
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
    </>
  )
}
