import { useState } from 'react'

import { getMatch, submitScore } from './api'
import ConfirmModal from './ConfirmModal'
import FlipBoard from './FlipBoard'
import SaveStatus from './SaveStatus'
import { useRunningScore } from './useRunningScore'

function scoresOf(match) {
  return { team1: match.team1_score ?? 0, team2: match.team2_score ?? 0 }
}

/**
 * A single-game match scored rally by rally: every point is saved as the
 * running score (so spectators see it), and Finish match records the result
 * and moves the court on. A newer score from another device replaces this
 * one's only while nothing here is waiting to be saved.
 */
export default function LiveScore({ match, team1Name, team2Name, onScored }) {
  const [version, setVersion] = useState(match.version)
  const [confirming, setConfirming] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState(null)
  const running = useRunningScore({
    initial: scoresOf(match),
    version,
    send: (scores, sentVersion) =>
      submitScore(match.id, {
        team1Score: scores.team1,
        team2Score: scores.team2,
        version: sentVersion,
        complete: false,
      }),
    onSaved: (updated) => setVersion(updated.version),
  })
  const { scores, state } = running

  if (match.version > version && running.synced) {
    setVersion(match.version)
    running.adopt(scoresOf(match))
  }

  async function handleRefetch() {
    const current = await getMatch(match.id)
    setVersion(current.version)
    running.adopt(scoresOf(current))
  }

  async function handleFinish() {
    setConfirming(false)
    setFinishing(true)
    setFinishError(null)
    try {
      const updated = await submitScore(match.id, {
        team1Score: scores.team1,
        team2Score: scores.team2,
        version,
        complete: true,
      })
      onScored?.(updated)
    } catch (error) {
      if (error?.status === 409) {
        setFinishError('Someone else updated this match. Refetch it before finishing.')
      } else {
        const body = await error?.json?.().catch(() => null)
        setFinishError(body?.detail ?? "Couldn't finish the match. Check your connection and try again.")
      }
    } finally {
      setFinishing(false)
    }
  }

  const tied = scores.team1 === scores.team2
  const busy = state === 'saving' || finishing

  return (
    <div className="live-score">
      <FlipBoard
        idPrefix={`live-${match.id}`}
        team1Name={team1Name}
        team2Name={team2Name}
        scores={scores}
        onChange={running.change}
      />
      <SaveStatus state={state} onRetry={running.retry} onRefetch={handleRefetch} />
      {tied && <p className="finish-note">A match can’t finish tied.</p>}
      {finishError && <p className="finish-note">{finishError}</p>}
      <button
        type="button"
        className="btn-primary finish-match"
        disabled={tied || busy || state === 'conflict'}
        onClick={() => setConfirming(true)}
      >
        {finishing ? 'Finishing…' : 'Finish match'}
      </button>
      <ConfirmModal
        open={confirming}
        title="Finish match"
        message={`Final score: ${team1Name} ${scores.team1}, ${team2Name} ${scores.team2}. The court moves on to its next match.`}
        confirmLabel="Finish"
        cancelLabel="Keep playing"
        onConfirm={handleFinish}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
