import { useState } from 'react'

import ConfirmModal from './ConfirmModal'
import { correctScore, previewCorrection } from './api'
import { matchName } from './matchName'

function previewMessage(resetMatches) {
  if (resetMatches.length === 0) {
    return 'The winner does not change, so no other matches will be reset.'
  }
  const noun = resetMatches.length === 1 ? 'match' : 'matches'
  const names = resetMatches.map(matchName).join(', ')
  return `This will reset ${resetMatches.length} ${noun} (scores cleared, teams updated): ${names}.`
}

export default function CorrectionForm({
  match,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  onCorrected,
}) {
  const [open, setOpen] = useState(false)
  const [team1Score, setTeam1Score] = useState(String(match.team1_score ?? ''))
  const [team2Score, setTeam2Score] = useState(String(match.team2_score ?? ''))
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)

  const scores = { team1Score: Number(team1Score), team2Score: Number(team2Score) }

  async function handleReview(event) {
    event.preventDefault()
    setError(null)
    try {
      const result = await previewCorrection(match.id, scores)
      setPreview(result.reset_matches)
    } catch {
      setError("Couldn't preview this correction. Check the score and try again.")
    }
  }

  async function handleConfirm() {
    setPreview(null)
    try {
      const result = await correctScore(match.id, { ...scores, version: match.version })
      setOpen(false)
      onCorrected?.(result)
    } catch (failure) {
      setError(
        failure?.status === 409
          ? 'This match was updated elsewhere. Wait for the bracket to refresh, then try again.'
          : "Couldn't apply this correction. Please try again.",
      )
    }
  }

  const title = `Correct ${team1Name} vs ${team2Name}`
  const button = (
    <button type="button" aria-label={title} onClick={() => setOpen(true)}>
      Correct
    </button>
  )
  if (!open) return button

  const team1Id = `correct-${match.id}-team1`
  const team2Id = `correct-${match.id}-team2`

  return (
    <>
      {button}
      <div className="modal-overlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
    <form onSubmit={handleReview}>
      <p>
        Correcting {team1Name} vs {team2Name}
      </p>
      <label htmlFor={team1Id}>{team1Name} score</label>
      <input
        id={team1Id}
        type="number"
        required
        value={team1Score}
        onChange={(event) => setTeam1Score(event.target.value)}
      />
      <label htmlFor={team2Id}>{team2Name} score</label>
      <input
        id={team2Id}
        type="number"
        required
        value={team2Score}
        onChange={(event) => setTeam2Score(event.target.value)}
      />
      <button type="submit">Review correction</button>
      <button type="button" onClick={() => setOpen(false)}>
        Close
      </button>
      {error && <p>{error}</p>}
      <ConfirmModal
        open={preview !== null}
        title="Confirm score correction"
        message={preview ? previewMessage(preview) : ''}
        confirmLabel="Apply correction"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setPreview(null)}
      />
    </form>
        </div>
      </div>
    </>
  )
}
