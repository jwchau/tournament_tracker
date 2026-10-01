import { useEffect, useRef, useState } from 'react'

import { createPlayer } from './api'
import { useNotify } from './NotificationContext'
import { usePending } from './usePending'

/**
 * Adds players to a team without leaving the page it is listed on: a small
 * button that opens a name box. Enter adds the player and the box stays open
 * and focused for the next one, so a whole roster goes in one after another;
 * Escape or Done closes it. onAdded gets each new player.
 */
export default function InlineAddPlayer({ team, onAdded }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef(null)
  const notify = useNotify()

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // A double Enter would add the player twice.
  const [add, adding] = usePending(async () => {
    try {
      const player = await createPlayer(team.id, { name: name.trim() })
      setName('')
      onAdded?.(player)
      inputRef.current?.focus()
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(typeof body?.detail === 'string' ? body.detail : "Couldn't add the player", {
        type: 'error',
      })
    }
  })

  function close() {
    setOpen(false)
    setName('')
  }

  if (!open) {
    return (
      <button
        type="button"
        className="inline-add-open"
        aria-label={`Add players to ${team.name}`}
        onClick={() => setOpen(true)}
      >
        + Player
      </button>
    )
  }

  return (
    <form
      className="inline-add-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) add()
      }}
    >
      <label className="visually-hidden" htmlFor={`inline-player-${team.id}`}>
        Player name for {team.name}
      </label>
      <input
        id={`inline-player-${team.id}`}
        ref={inputRef}
        value={name}
        placeholder="Player name"
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
      />
      <button type="submit" aria-label={`Add player to ${team.name}`} disabled={adding}>
        Add
      </button>
      <button type="button" aria-label={`Done adding players to ${team.name}`} onClick={close}>
        Done
      </button>
    </form>
  )
}
