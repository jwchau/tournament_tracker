import { useState } from 'react'

import { createTeam } from './api'
import { useNotify } from './NotificationContext'
import { usePending } from './usePending'

// `disabledReason`, when given, turns the form off and says why underneath.
export default function TeamForm({ tournamentId, onCreated, disabledReason = null }) {
  const [name, setName] = useState('')
  const notify = useNotify()

  // A double tap would add the team twice.
  const [add, adding] = usePending(async () => {
    try {
      const team = await createTeam(tournamentId, { name })
      notify(`Team "${team.name}" added`)
      setName('')
      onCreated?.(team)
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(typeof body?.detail === 'string' ? body.detail : "Couldn't add the team", {
        type: 'error',
      })
    }
  })

  function handleSubmit(event) {
    event.preventDefault()
    if (!disabledReason) add()
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="team-name">Team name</label>
      <input
        id="team-name"
        value={name}
        disabled={Boolean(disabledReason)}
        aria-describedby={disabledReason ? 'team-name-note' : undefined}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={adding || Boolean(disabledReason)}>
        {adding ? 'Adding…' : 'Add team'}
      </button>
      {disabledReason && (
        <small id="team-name-note" className="field-note">
          {disabledReason}
        </small>
      )}
    </form>
  )
}
