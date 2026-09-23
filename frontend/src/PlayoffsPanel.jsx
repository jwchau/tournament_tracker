import { useEffect, useState } from 'react'

import { advanceToPlayoffs, getPlayoffReadiness, listPlayoffBrackets } from './api'
import BracketDiagram from './BracketDiagram'
import { useNotify } from './NotificationContext'

export default function PlayoffsPanel({ tournamentId, teams, courtCount }) {
  const [brackets, setBrackets] = useState(null)
  const [blocker, setBlocker] = useState('Checking pool play…')
  const [format, setFormat] = useState('single')
  const notify = useNotify()

  useEffect(() => {
    listPlayoffBrackets(tournamentId)
      .then(setBrackets)
      .catch(() => {})
    getPlayoffReadiness(tournamentId)
      .then(({ reason }) => setBlocker(reason))
      .catch(() => {})
  }, [tournamentId])

  async function handleAdvance() {
    try {
      setBrackets(await advanceToPlayoffs(tournamentId, { format }))
      notify('Advanced to playoffs')
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to advance to playoffs', { type: 'error' })
    }
  }

  if (brackets === null) return null

  if (brackets.length > 0) {
    return brackets.map((bracket) => (
      <section key={bracket.id}>
        <h4>Bracket {bracket.tier}</h4>
        <BracketDiagram
          tournamentId={tournamentId}
          playoffBracketId={bracket.id}
          teams={teams}
          courtCount={courtCount}
        />
      </section>
    ))
  }

  return (
    <>
      {blocker && <p>{blocker}</p>}
      <label htmlFor="playoff-format">Playoff format</label>
      <select
        id="playoff-format"
        value={format}
        onChange={(event) => setFormat(event.target.value)}
      >
        <option value="single">Single elimination</option>
        <option value="double">Double elimination</option>
      </select>
      <button type="button" disabled={blocker !== null} onClick={handleAdvance}>
        Advance to playoffs
      </button>
    </>
  )
}
