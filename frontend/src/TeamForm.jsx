import { useState } from 'react'

import { createTeam } from './api'

export default function TeamForm({ tournamentId, onCreated }) {
  const [name, setName] = useState('')
  const [created, setCreated] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    const team = await createTeam(tournamentId, { name })
    setCreated(team)
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
      {created && <p>{created.name}</p>}
    </form>
  )
}
