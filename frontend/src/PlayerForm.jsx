import { useState } from 'react'

import { createPlayer } from './api'
import { useNotify } from './NotificationContext'

export default function PlayerForm({ teamId, onCreated }) {
  const [name, setName] = useState('')
  const notify = useNotify()

  async function handleSubmit(event) {
    event.preventDefault()
    const player = await createPlayer(teamId, { name })
    notify(`Player "${player.name}" added`)
    setName('')
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
    </form>
  )
}
