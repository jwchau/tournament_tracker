import { useState } from 'react'

import ConfirmModal from './ConfirmModal'
import { correctScore, listGames, previewCorrection } from './api'
import { matchName } from './matchName'
import { GameScoreInputs } from './SeriesForm'

function previewMessage(resetMatches) {
  if (resetMatches.length === 0) {
    return 'The winner does not change, so no other matches will be reset.'
  }
  const noun = resetMatches.length === 1 ? 'match' : 'matches'
  const names = resetMatches.map(matchName).join(', ')
  return `This will reset ${resetMatches.length} ${noun} (scores cleared, teams updated): ${names}.`
}

/**
 * Re-scores a completed match. A single game takes one corrected score; a
 * best-of series takes every corrected game (loaded from what was recorded,
 * with games addable or removable). Either way the reset cascade is previewed
 * before anything is applied.
 */
export default function CorrectionForm({
  match,
  bestOf = 1,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  onCorrected,
}) {
  const [open, setOpen] = useState(false)
  const [team1Score, setTeam1Score] = useState(String(match.team1_score ?? ''))
  const [team2Score, setTeam2Score] = useState(String(match.team2_score ?? ''))
  const [games, setGames] = useState([])
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const isSeries = bestOf > 1

  const correction = isSeries
    ? {
        games: games.map((game) => ({
          team1Score: Number(game.team1),
          team2Score: Number(game.team2),
        })),
      }
    : { team1Score: Number(team1Score), team2Score: Number(team2Score) }

  async function handleOpen() {
    setOpen(true)
    if (isSeries) {
      const recorded = await listGames(match.id).catch(() => [])
      setGames(
        recorded.map((game) => ({ team1: String(game.team1_score), team2: String(game.team2_score) })),
      )
    }
  }

  async function handleReview(event) {
    event.preventDefault()
    setError(null)
    try {
      const result = await previewCorrection(match.id, correction)
      setPreview(result.reset_matches)
    } catch (failure) {
      const body = await failure?.json?.().catch(() => null)
      setError(body?.detail ?? "Couldn't preview this correction. Check the score and try again.")
    }
  }

  async function handleConfirm() {
    setPreview(null)
    try {
      const result = await correctScore(match.id, { ...correction, version: match.version })
      setOpen(false)
      onCorrected?.(result)
    } catch (failure) {
      setError(
        failure?.status === 409
          ? 'This match was updated elsewhere. Wait for the page to refresh, then try again.'
          : "Couldn't apply this correction. Please try again.",
      )
    }
  }

  const title = `Correct ${team1Name} vs ${team2Name}`
  const button = (
    <button type="button" aria-label={title} onClick={handleOpen}>
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
              {isSeries && ` (best of ${bestOf})`}
            </p>
            {isSeries ? (
              <>
                {games.map((game, index) => (
                  <div key={index}>
                    <GameScoreInputs
                      idPrefix={`correct-${match.id}`}
                      number={index + 1}
                      team1Name={team1Name}
                      team2Name={team2Name}
                      scores={game}
                      onChange={(scores) =>
                        setGames((current) =>
                          current.map((existing, i) => (i === index ? scores : existing)),
                        )
                      }
                    />
                  </div>
                ))}
                {games.length < bestOf && (
                  <button
                    type="button"
                    onClick={() => setGames((current) => [...current, { team1: '', team2: '' }])}
                  >
                    Add game
                  </button>
                )}
                {games.length > 1 && (
                  <button type="button" onClick={() => setGames((current) => current.slice(0, -1))}>
                    Remove last game
                  </button>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
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
