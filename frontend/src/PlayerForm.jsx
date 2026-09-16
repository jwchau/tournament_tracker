import { useState } from 'react'

import { createPlayer } from './api'

export default function PlayerForm({ teamId, onCreated }) {
  const [name, setName] = useState('')
  const [created, setCreated] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    const player = await createPlayer(teamId, { name })
    setCreated(player)
    onCreated?.(player)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={`player-name-${teamId}`}>Player name</label>
      <input
        id={`player-name-${teamId}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit">Add player</button>
      {created && <p>{created.name}</p>}
    </form>
  )
}
