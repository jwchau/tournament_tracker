import { useState } from 'react'

import { getMatch, submitScore } from './api'
import { usePending } from './usePending'

export default function ScoreEntryForm({
  match,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  onScored,
}) {
  const [currentMatch, setCurrentMatch] = useState(match)
  const [seenVersion, setSeenVersion] = useState(match.version)
  const [team1Score, setTeam1Score] = useState('')
  const [team2Score, setTeam2Score] = useState('')
  const [complete, setComplete] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const team1Id = `score-${match.id}-team1`
  const team2Id = `score-${match.id}-team2`
  const completeId = `score-${match.id}-complete`

  if (match.version > seenVersion) {
    setSeenVersion(match.version)
    setCurrentMatch(match)
  }

  function applyMatch(next) {
    setCurrentMatch(next)
    setSeenVersion((current) => Math.max(current, next.version))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (team1Score === '' || team2Score === '') {
      return
    }
    submit()
  }

  const [submit, submitting] = usePending(async () => {
    try {
      const updated = await submitScore(currentMatch.id, {
        team1Score: Number(team1Score),
        team2Score: Number(team2Score),
        version: currentMatch.version,
        complete,
      })
      applyMatch(updated)
      setConflict(false)
      setSubmitError(false)
      onScored?.(updated)
    } catch (error) {
      if (error?.status === 409) {
        setConflict(true)
      } else {
        setSubmitError(true)
      }
    }
  })

  async function handleRefetch() {
    const latest = await getMatch(currentMatch.id)
    applyMatch(latest)
    setConflict(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>
        {team1Name} vs {team2Name}
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
      <label htmlFor={completeId}>
        <input
          id={completeId}
          type="checkbox"
          checked={complete}
          onChange={(event) => setComplete(event.target.checked)}
        />
        Complete match
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit score'}
      </button>
      {conflict && (
        <p>
          Version conflict: this match was updated elsewhere.{' '}
          <button type="button" onClick={handleRefetch}>
            Refetch latest
          </button>
        </p>
      )}
      {submitError && <p>Couldn't submit score. Please check the score and try again.</p>}
    </form>
  )
}
