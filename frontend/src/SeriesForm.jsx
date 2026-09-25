import { useEffect, useState } from 'react'

import { addGame, editGame, getMatch, listGames, saveGameInPlay } from './api'
import FlipBoard from './FlipBoard'
import SaveStatus from './SaveStatus'
import { sameScores, useRunningScore } from './useRunningScore'
import { usePending } from './usePending'

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

function gameInPlay(match) {
  return { team1: match.game_team1_score ?? 0, team2: match.game_team2_score ?? 0 }
}

/**
 * The game in play on the court's scoreboard: each point is saved as the
 * game's running score, so spectators follow it, and Record game ends it.
 * A newer game score from another device replaces this one's only while
 * nothing here is waiting to be saved.
 */
function GameBoard({ match, number, team1Name, team2Name, recording, onSaved, onRecord, onRefetch }) {
  const [seenVersion, setSeenVersion] = useState(match.version)
  const running = useRunningScore({
    initial: gameInPlay(match),
    version: match.version,
    send: (scores, version) =>
      saveGameInPlay(match.id, { team1Score: scores.team1, team2Score: scores.team2, version }),
    onSaved,
  })
  const { scores, state } = running

  if (match.version > seenVersion) {
    setSeenVersion(match.version)
    if (running.synced && !sameScores(gameInPlay(match), scores)) running.adopt(gameInPlay(match))
  }

  async function handleRecord(event) {
    event.preventDefault()
    if (await onRecord(scores)) running.adopt({ team1: 0, team2: 0 })
  }

  return (
    <form onSubmit={handleRecord} className="series-next">
      <FlipBoard
        idPrefix={`series-${match.id}-game-${number}`}
        team1Name={team1Name}
        team2Name={team2Name}
        labelPrefix={`Game ${number} `}
        scores={scores}
        onChange={running.change}
      />
      <SaveStatus
        state={state}
        onRetry={running.retry}
        onRefetch={async () => running.adopt(gameInPlay(await onRefetch()))}
      />
      <button
        type="submit"
        className="btn-primary finish-match"
        disabled={recording || state === 'saving' || state === 'conflict' || scores.team1 === scores.team2}
      >
        {recording ? 'Saving…' : `Record game ${number}`}
      </button>
    </form>
  )
}

/**
 * Scoring for a best-of playoff series: one game at a time. The series
 * completes (and its winner advances) once a team wins a majority; until then
 * any recorded game can be fixed. A decided series changes only through a
 * correction.
 * With board, the next game is kept on the court's scoreboard, point by point,
 * and recorded when it ends.
 */
export default function SeriesForm({
  match,
  bestOf,
  team1Name = 'Team 1',
  team2Name = 'Team 2',
  onScored,
  board = false,
}) {
  const [currentMatch, setCurrentMatch] = useState(match)
  const [seenVersion, setSeenVersion] = useState(match.version)
  const [games, setGames] = useState([])
  const [next, setNext] = useState(EMPTY)

  // A save of the game in play returns the match with its new version.
  function takeMatch(updated) {
    setCurrentMatch(updated)
    setSeenVersion((current) => Math.max(current, updated.version))
  }
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

  // One write at a time; a second tap while one is saving is ignored.
  const [save, saving] = usePending(async (write) => {
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
  })

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

  function recordFromBoard(scores) {
    return save(() =>
      addGame(currentMatch.id, {
        team1Score: scores.team1,
        team2Score: scores.team2,
        version: currentMatch.version,
      }),
    )
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
    return latest
  }

  const nextNumber = games.length + 1

  const nextGame =
    nextNumber <= bestOf &&
    (board ? (
      <GameBoard
        key={nextNumber}
        match={currentMatch}
        number={nextNumber}
        team1Name={team1Name}
        team2Name={team2Name}
        recording={saving}
        onSaved={takeMatch}
        onRecord={recordFromBoard}
        onRefetch={handleRefetch}
      />
    ) : (
      <form onSubmit={handleRecord}>
        <GameScoreInputs
          idPrefix={`series-${currentMatch.id}`}
          number={nextNumber}
          team1Name={team1Name}
          team2Name={team2Name}
          scores={next}
          onChange={setNext}
        />
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : `Record game ${nextNumber}`}
        </button>
      </form>
    ))

  return (
    <section className={board ? 'series series-board' : 'series'}>
      <p className="series-tally">
        {team1Name} vs {team2Name} · best of {bestOf} · {currentMatch.team1_score ?? 0}–
        {currentMatch.team2_score ?? 0}
      </p>
      {board && nextGame}
      <ol className="series-games">
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
                <button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : `Save game ${game.number}`}
                </button>
                <button type="button" onClick={() => setFixing(null)}>
                  Cancel
                </button>
              </form>
            </li>
          ) : (
            <li key={game.number}>
              {board ? (
                <span className="game-line">
                  Game {game.number}:{' '}
                  <span className={game.team1_score > game.team2_score ? 'game-won' : undefined}>
                    {game.team1_score}
                  </span>
                  –
                  <span className={game.team2_score > game.team1_score ? 'game-won' : undefined}>
                    {game.team2_score}
                  </span>
                </span>
              ) : (
                <>
                  Game {game.number}: {game.team1_score}–{game.team2_score}
                </>
              )}{' '}
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
      {!board && nextGame}
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
