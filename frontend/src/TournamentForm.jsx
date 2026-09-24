import { useState } from 'react'

import { createTournament } from './api'
import { useNotify } from './NotificationContext'
import { usePending } from './usePending'

export default function TournamentForm({ onCreated }) {
  const [name, setName] = useState('')
  const notify = useNotify()

  // A double tap would create the tournament twice.
  const [create, creating] = usePending(async () => {
    const tournament = await createTournament({ name })
    notify(`Tournament "${tournament.name}" created`)
    setName('')
    onCreated?.(tournament)
  })

  function handleSubmit(event) {
    event.preventDefault()
    create()
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="tournament-name">Tournament name</label>
      <input
        id="tournament-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={creating}>
        {creating ? 'Creating…' : 'Create'}
      </button>
    </form>
  )
}
