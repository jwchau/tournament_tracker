import { useState } from 'react'

import { createTournament } from './api'
import { useNotify } from './NotificationContext'

export default function TournamentForm({ onCreated }) {
  const [name, setName] = useState('')
  const notify = useNotify()

  async function handleSubmit(event) {
    event.preventDefault()
    const tournament = await createTournament({ name })
    notify(`Tournament "${tournament.name}" created`)
    setName('')
    onCreated?.(tournament)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="tournament-name">Tournament name</label>
      <input
        id="tournament-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit">Create</button>
    </form>
  )
}
