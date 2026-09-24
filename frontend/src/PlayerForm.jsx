import { useState } from 'react'

import { createPlayer } from './api'
import { useNotify } from './NotificationContext'
import { usePending } from './usePending'

export default function PlayerForm({ teamId, onCreated }) {
  const [name, setName] = useState('')
  const notify = useNotify()

  // A double tap would add the player twice.
  const [add, adding] = usePending(async () => {
    const player = await createPlayer(teamId, { name })
    notify(`Player "${player.name}" added`)
    setName('')
    onCreated?.(player)
  })

  function handleSubmit(event) {
    event.preventDefault()
    add()
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={`player-name-${teamId}`}>Player name</label>
      <input
        id={`player-name-${teamId}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={adding}>
        {adding ? 'Adding…' : 'Add player'}
      </button>
    </form>
  )
}
