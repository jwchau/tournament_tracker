import { useState } from 'react'

import { createTeam } from './api'
import { useNotify } from './NotificationContext'
import { usePending } from './usePending'

export default function TeamForm({ tournamentId, onCreated }) {
  const [name, setName] = useState('')
  const notify = useNotify()

  // A double tap would add the team twice.
  const [add, adding] = usePending(async () => {
    const team = await createTeam(tournamentId, { name })
    notify(`Team "${team.name}" added`)
    setName('')
    onCreated?.(team)
  })

  function handleSubmit(event) {
    event.preventDefault()
    add()
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="team-name">Team name</label>
      <input
        id="team-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={adding}>
        {adding ? 'Adding…' : 'Add team'}
      </button>
    </form>
  )
}
