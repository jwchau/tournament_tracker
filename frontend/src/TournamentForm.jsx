import { useState } from 'react'

import { createTournament } from './api'
import { useNotify } from './NotificationContext'
import { usePending } from './usePending'

/**
 * Name a new tournament: Create, or Cancel when the caller offers it. The
 * name field takes focus, since opening the form means typing next.
 */
export default function TournamentForm({ onCreated, onCancel }) {
  const [name, setName] = useState('')
  const notify = useNotify()

  // A double tap would create the tournament twice.
  const [create, creating] = usePending(async () => {
    const tournament = await createTournament({ name: name.trim() })
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
        autoComplete="off"
        required
        autoFocus
      />
      <button type="submit" disabled={creating || !name.trim()}>
        {creating ? 'Creating…' : 'Create'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={creating}>
          Cancel
        </button>
      )}
    </form>
  )
}
