import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { deletePlayer, getTeam, listPlayers, updateTeam } from './api'
import { useAuth } from './auth'
import { useNotify } from './NotificationContext'
import PlayerForm from './PlayerForm'

export default function TeamPage() {
  const { teamId } = useParams()
  const [team, setTeam] = useState(null)
  const [name, setName] = useState('')
  const [players, setPlayers] = useState([])
  const notify = useNotify()
  const { user } = useAuth()

  useEffect(() => {
    getTeam(teamId).then((fetched) => {
      setTeam(fetched)
      setName(fetched.name)
    })
    listPlayers(teamId).then(setPlayers)
  }, [teamId])

  async function handleSaveName(event) {
    event.preventDefault()
    const updated = await updateTeam(teamId, { name })
    setTeam(updated)
    setName(updated.name)
    notify('Team name updated')
  }

  async function handleRemovePlayer(playerId) {
    await deletePlayer(teamId, playerId)
    setPlayers((current) => current.filter((player) => player.id !== playerId))
  }

  if (!team) return null

  return (
    <>
      {user ? (
        <>
          <h2>Team</h2>
          <form onSubmit={handleSaveName}>
            <label htmlFor="team-page-name">Team name</label>
            <input
              id="team-page-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
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
    </>
  )
}
