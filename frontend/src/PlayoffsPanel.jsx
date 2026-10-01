import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  advanceToPlayoffs,
  generateBracket,
  getPlayoffReadiness,
  getPlayoffSeeding,
  listPlayoffBrackets,
  resetPlayoffBrackets,
} from './api'
import { hasRole, useAuth } from './auth'
import BracketDiagram from './BracketDiagram'
import ConfirmModal from './ConfirmModal'
import Loading from './Loading'
import { useNotify } from './NotificationContext'
import SeedingDialog from './SeedingDialog'
import { useNotifyFailure } from './useNotifyFailure'
import { usePending } from './usePending'

// A tournament with pools advances from pool play into tiered brackets; one
// without pools generates a single bracket of every team. Either happens once,
// and can be undone until the first playoff score. Both first open the seeding
// dialog, where the organizer confirms or changes each bracket's seed order
// and picks the format.
// onChanged is told whenever brackets are created or reset, since that changes
// which tournament settings are locked.
export default function PlayoffsPanel({ tournamentId, teams, hasPools, bestOf = 1, onChanged }) {
  const [brackets, setBrackets] = useState(null)
  const [blocker, setBlocker] = useState('Checking pool play…')
  // The seeding dialog's data while it's open.
  const [seeding, setSeeding] = useState(null)
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

  // Reads the seed order the standings give right now; the dialog is where it
  // can be changed.
  const [handleReviewSeeding, reviewing] = usePending(async () => {
    try {
      const loaded = await getPlayoffSeeding(tournamentId)
      if (loaded.ready) setSeeding(loaded)
      else notify(loaded.reason, { type: 'error' })
    } catch (error) {
      notifyFailure(error, "Couldn't load the seeding")
    }
  })

  const [handleAdvance, advancing] = usePending(async ({ format, seeding: order }) => {
    try {
      setBrackets(await advanceToPlayoffs(tournamentId, { format, seeding: order }))
      onChanged?.()
      notify('Advanced to playoffs')
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to advance to playoffs', { type: 'error' })
    }
    setSeeding(null)
  })

  const [handleGenerate, generating] = usePending(async ({ format, seeding: order }) => {
    try {
      await generateBracket(tournamentId, { format, seeding: order })
      setBrackets(await listPlayoffBrackets(tournamentId))
      onChanged?.()
      notify('Bracket generated')
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to generate bracket', { type: 'error' })
    }
    setSeeding(null)
  })

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
        <ul className="pool-grid">
          {brackets.map((bracket) => (
            <li key={bracket.id} className="pool-card">
              <div className="pool-card-head">
                <h4>Bracket {bracket.tier}</h4>
                <Link to={`/brackets/${bracket.id}`}>Open Bracket {bracket.tier}</Link>
              </div>
              <BracketDiagram
                playoffBracketId={bracket.id}
                tournamentId={tournamentId}
                teams={teams}
                bestOf={bestOf}
              />
            </li>
          ))}
        </ul>
        {hasRole(user, 'organizer') && resettable && (
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

  if (!hasRole(user, 'organizer')) {
    return (
      <p className="setup-note">
        {hasPools && blocker ? blocker : 'The playoffs haven’t started yet.'}
      </p>
    )
  }

  return (
    <>
      {hasPools && blocker && <p className="setup-note">{blocker}</p>}
      <div className="playoff-controls">
        <button
          type="button"
          className="btn-primary"
          disabled={(hasPools && blocker !== null) || reviewing}
          onClick={handleReviewSeeding}
        >
          {hasPools ? 'Advance to playoffs' : 'Generate bracket'}
        </button>
      </div>
      {seeding && (
        <SeedingDialog
          seeding={seeding}
          confirmLabel={hasPools ? 'Confirm and advance' : 'Confirm and generate'}
          busy={advancing || generating}
          onConfirm={hasPools ? handleAdvance : handleGenerate}
          onCancel={() => setSeeding(null)}
        />
      )}
    </>
  )
}
