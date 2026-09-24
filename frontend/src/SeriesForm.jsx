import { useEffect, useState } from 'react'

import { addGame, editGame, getMatch, listGames } from './api'

// Two score inputs for one game, labelled "Game N <team> score".
export function GameScoreInputs({
  idPrefix,
  number,
  team1Name,
  team2Name,
  scores,
  onChange,
}) {
  const team1Id = `${idPrefix}-game-${number}-team1`
  const team2Id = `${idPrefix}-game-${number}-team2`
  return (
    <span className="game-scores">
      <span className="score-field">
        <label htmlFor={team1Id}>
          Game {number} {team1Name} score
        </label>
        <input
          id={team1Id}
          type="number"
          required
          value={scores.team1}
          onChange={(event) => onChange({ ...scores, team1: event.target.value })}
        />
      </span>
      <span className="score-field">
        <label htmlFor={team2Id}>
          Game {number} {team2Name} score
        </label>
        <input
          id={team2Id}
          type="number"
          required
          value={scores.team2}
          onChange={(event) => onChange({ ...scores, team2: event.target.value })}
        />
      </span>
    </span>
  )
}

const EMPTY = { team1: '', team2: '' }

/**
 * Scoring for a best-of playoff series: one game at a time. The series
 * completes (and its winner advances) once a team wins a majority; until then
 * any recorded game can be fixed. A decided series changes only through a
 * correction.
 */
export default function SeriesForm({
  match,
  bestOf,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  onScored,
}) {
  const [currentMatch, setCurrentMatch] = useState(match)
  const [seenVersion, setSeenVersion] = useState(match.version)
  const [games, setGames] = useState([])
  const [next, setNext] = useState(EMPTY)
  const [fixing, setFixing] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  if (match.version > seenVersion) {
    setSeenVersion(match.version)
    setCurrentMatch(match)
  }

  useEffect(() => {
    listGames(match.id)
      .then(setGames)
      .catch(() => {})
  }, [match.id, currentMatch.version])

  async function save(write) {
    try {
      await write()
      const updated = await getMatch(currentMatch.id)
      setCurrentMatch(updated)
      setSeenVersion((current) => Math.max(current, updated.version))
      setConflict(false)
      setSubmitError(false)
      onScored?.(updated)
      return true
    } catch (error) {
      if (error?.status === 409) {
        setConflict(true)
      } else {
        setSubmitError(true)
      }
      return false
    }
  }

  async function handleRecord(event) {
    event.preventDefault()
    const saved = await save(() =>
      addGame(currentMatch.id, {
        team1Score: Number(next.team1),
        team2Score: Number(next.team2),
        version: currentMatch.version,
      }),
    )
    if (saved) setNext(EMPTY)
  }

  async function handleFix(event) {
    event.preventDefault()
    const saved = await save(() =>
      editGame(currentMatch.id, fixing.number, {
        team1Score: Number(fixing.team1),
        team2Score: Number(fixing.team2),
        version: currentMatch.version,
      }),
    )
    if (saved) setFixing(null)
  }

  async function handleRefetch() {
    const latest = await getMatch(currentMatch.id)
    setCurrentMatch(latest)
    setSeenVersion((current) => Math.max(current, latest.version))
    setConflict(false)
  }

  const nextNumber = games.length + 1

  return (
    <section>
      <p>
        {team1Name} vs {team2Name} · best of {bestOf} · {currentMatch.team1_score ?? 0}–
        {currentMatch.team2_score ?? 0}
      </p>
      <ol>
        {games.map((game) =>
          fixing?.number === game.number ? (
            <li key={game.number}>
              <form onSubmit={handleFix}>
                <GameScoreInputs
                  idPrefix={`series-${currentMatch.id}`}
                  number={game.number}
                  team1Name={team1Name}
                  team2Name={team2Name}
                  scores={fixing}
                  onChange={(scores) => setFixing({ ...fixing, ...scores })}
                />
                <button type="submit">Save game {game.number}</button>
                <button type="button" onClick={() => setFixing(null)}>
                  Cancel
                </button>
              </form>
            </li>
          ) : (
            <li key={game.number}>
              Game {game.number}: {game.team1_score}–{game.team2_score}{' '}
              <button
                type="button"
                onClick={() =>
                  setFixing({
                    number: game.number,
                    team1: String(game.team1_score),
                    team2: String(game.team2_score),
                  })
                }
              >
                Fix game {game.number}
              </button>
            </li>
          ),
        )}
      </ol>
      {nextNumber <= bestOf && (
        <form onSubmit={handleRecord}>
          <GameScoreInputs
            idPrefix={`series-${currentMatch.id}`}
            number={nextNumber}
            team1Name={team1Name}
            team2Name={team2Name}
            scores={next}
            onChange={setNext}
          />
          <button type="submit">Record game {nextNumber}</button>
        </form>
      )}
      {conflict && (
        <p>
          Version conflict: this series was updated elsewhere.{' '}
          <button type="button" onClick={handleRefetch}>
            Refetch latest
          </button>
        </p>
      )}
      {submitError && <p>Couldn't save that game. Check the scores (no ties) and try again.</p>}
    </section>
  )
}
