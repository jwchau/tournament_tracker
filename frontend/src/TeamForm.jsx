import { useState } from 'react'

import { createTeam } from './api'
import { useNotify } from './NotificationContext'

export default function TeamForm({ tournamentId, onCreated }) {
  const [name, setName] = useState('')
  const notify = useNotify()

  async function handleSubmit(event) {
    event.preventDefault()
    const team = await createTeam(tournamentId, { name })
    notify(`Team "${team.name}" added`)
    setName('')
    onCreated?.(team)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="team-name">Team name</label>
      <input
        id="team-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit">Add team</button>
    </form>
  )
}
