import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  advanceToPlayoffs,
  generateBracket,
  getPlayoffReadiness,
  listPlayoffBrackets,
  resetPlayoffBrackets,
} from './api'
import { useAuth } from './auth'
import BracketDiagram from './BracketDiagram'
import ConfirmModal from './ConfirmModal'
import Loading from './Loading'
import { useNotify } from './NotificationContext'
import { useNotifyFailure } from './useNotifyFailure'
import { usePending } from './usePending'

// A tournament with pools advances from pool play into tiered brackets; one
// without pools generates a single bracket of every team. Either happens once,
// and can be undone until the first playoff score.
// onChanged is told whenever brackets are created or reset, since that changes
// which tournament settings are locked.
export default function PlayoffsPanel({ tournamentId, teams, hasPools, bestOf = 1, onChanged }) {
  const [brackets, setBrackets] = useState(null)
  const [blocker, setBlocker] = useState('Checking pool play…')
  const [format, setFormat] = useState('single')
  const [confirmingReset, setConfirmingReset] = useState(false)
  const notify = useNotify()
  const notifyFailure = useNotifyFailure()
  const { user } = useAuth()

  useEffect(() => {
    listPlayoffBrackets(tournamentId)
      .then(setBrackets)
      .catch((error) => notifyFailure(error, "Couldn't load the playoff brackets"))
    getPlayoffReadiness(tournamentId)
      .then(({ reason }) => setBlocker(reason))
      .catch(() => setBlocker("Couldn't check whether pool play is finished. Reload to try again."))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  const [handleAdvance, advancing] = usePending(async () => {
    try {
      setBrackets(await advanceToPlayoffs(tournamentId, { format }))
      onChanged?.()
      notify('Advanced to playoffs')
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to advance to playoffs', { type: 'error' })
    }
  })

  async function handleGenerate() {
    try {
      await generateBracket(tournamentId, { format })
      setBrackets(await listPlayoffBrackets(tournamentId))
      onChanged?.()
      notify('Bracket generated')
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to generate bracket', { type: 'error' })
    }
  }

  async function handleReset() {
    setConfirmingReset(false)
    try {
      await resetPlayoffBrackets(tournamentId)
      setBrackets([])
      onChanged?.()
      setBlocker((await getPlayoffReadiness(tournamentId)).reason)
      notify('Brackets reset')
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to reset brackets', { type: 'error' })
    }
  }

  if (brackets === null) return <Loading label="Loading playoffs" />

  if (brackets.length > 0) {
    const resettable = brackets.every((bracket) => !bracket.has_scores)
    return (
      <>
        {brackets.map((bracket) => (
          <section key={bracket.id}>
            <h4>Bracket {bracket.tier}</h4>
            <Link to={`/brackets/${bracket.id}`}>Open Bracket {bracket.tier}</Link>
            <BracketDiagram playoffBracketId={bracket.id} teams={teams} bestOf={bestOf} readOnly />
          </section>
        ))}
        {user && resettable && (
          <button type="button" onClick={() => setConfirmingReset(true)}>
            Reset brackets
          </button>
        )}
        <ConfirmModal
          open={confirmingReset}
          title="Reset brackets"
          message="Delete every playoff bracket so they can be generated again? This is only possible until the first playoff score."
          confirmLabel="Reset"
          cancelLabel="Cancel"
          onConfirm={handleReset}
          onCancel={() => setConfirmingReset(false)}
        />
      </>
    )
  }

  if (!user) return hasPools && blocker ? <p>{blocker}</p> : null

  return (
    <>
      {hasPools && blocker && <p>{blocker}</p>}
      <label htmlFor="playoff-format">Playoff format</label>
      <select
        id="playoff-format"
        value={format}
        onChange={(event) => setFormat(event.target.value)}
      >
        <option value="single">Single elimination</option>
        <option value="double">Double elimination</option>
      </select>
      {hasPools ? (
        <button type="button" disabled={blocker !== null || advancing} onClick={handleAdvance}>
          {advancing ? 'Advancing…' : 'Advance to playoffs'}
        </button>
      ) : (
        <button type="button" onClick={handleGenerate}>
          Generate bracket
        </button>
      )}
    </>
  )
}
