import { useEffect, useState } from 'react'

import { getBracketDispatch, getPlayoffBracketMatches, holdMatch } from './api'
import { createCircuitBreaker } from './circuitBreaker'
import CorrectionForm from './CorrectionForm'
import { matchName } from './matchName'
import ScheduleForm from './ScheduleForm'
import ScoreEntryForm from './ScoreEntryForm'
import SeriesForm from './SeriesForm'
import { withTimeout } from './withTimeout'

const MATCH_WIDTH = 140
const LINE_HEIGHT = 17
const MATCH_HEIGHT = LINE_HEIGHT * 3 + 5
const ROUND_GAP = 60
// Leaves room under each box for its "Correct" button.
const ROW_UNIT = 90
const ACTIONS_GAP = 4
const POLL_INTERVAL_MS = 4000
const REQUEST_TIMEOUT_MS = 5000
const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 30000
const MAX_LABEL_LENGTH = 18
// Names are cut shorter when a score sits at the right edge of the box.
const MAX_SCORED_LABEL_LENGTH = 15
const SCORE_INSET = 6

function teamName(teamsById, teamId) {
  return teamsById[teamId]?.name ?? `Team ${teamId}`
}

function slotLabel(teamsById, teamId, status) {
  if (teamId != null) return teamName(teamsById, teamId)
  return status === 'complete' ? 'BYE' : 'TBD'
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Match id -> place in line for a court (1 = next), from the bracket's
// dispatch queue. A bracket's line can include overflow brackets' matches
// (brackets without courts of their own), which count toward the place.
function queuePositions(dispatch) {
  return Object.fromEntries((dispatch?.queue ?? []).map((id, index) => [id, index + 1]))
}

// "Court 2 · Sat 10:30", "Waiting for a court · #2" while queued (or
// "Waiting (any court)" in an overflow bracket), or "On hold". Times are
// venue-local with no timezone: parsing an ISO string without an offset
// yields that same wall-clock time everywhere.
function scheduleLabel(match, queuePosition, overflow) {
  const parts = []
  if (match.on_hold) parts.push('On hold')
  // A finished match has left its court, which may now hold another match.
  if (match.court != null && match.status !== 'complete') parts.push(`Court ${match.court}`)
  if (queuePosition != null) {
    parts.push(`${overflow ? 'Waiting (any court)' : 'Waiting for a court'} · #${queuePosition}`)
  }
  if (match.scheduled_time) {
    const time = new Date(match.scheduled_time)
    const clock = match.scheduled_time.slice(11, 16)
    parts.push(`${WEEKDAYS[time.getDay()]} ${clock}`)
  }
  return parts.join(' · ')
}

function truncate(label, maxLength = MAX_LABEL_LENGTH) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label
}

// What to show at the right of a team's row: a series' games won once it's
// under way, or a single game's final score. Byes and unfinished games show
// nothing.
function slotScore(match, index, bestOf) {
  const teamId = [match.team1_id, match.team2_id][index]
  const score = [match.team1_score, match.team2_score][index]
  if (teamId == null || score == null) return null
  if (bestOf > 1) return score
  const bothTeams = match.team1_id != null && match.team2_id != null
  return match.status === 'complete' && bothTeams ? score : null
}

function matchY(round, position) {
  const spacing = ROW_UNIT * 2 ** (round - 1)
  return spacing * (position - 1) + spacing / 2
}

const COLUMN_WIDTH = MATCH_WIDTH + ROUND_GAP
const SECTION_LABEL_HEIGHT = 24
const SECTION_GAP = 30

function sectionOf(match) {
  return match.bracket ?? 'winners'
}

/**
 * Where each match box goes. A single-elimination bracket is just the
 * winners section. Double elimination stacks the losers bracket under the
 * winners bracket (its rounds come in pairs of equal size, so each pair
 * shares a spacing), with the grand final to the right of both, level with
 * the winners final.
 */
function layoutBracket(matches) {
  const positions = {}
  const labels = []
  const inSection = (section) => matches.filter((match) => sectionOf(match) === section)
  const winners = inSection('winners')
  const losers = inSection('losers')
  const grandFinals = inSection('grand_final')
  const isDouble = losers.length > 0 || grandFinals.length > 0
  const top = isDouble ? SECTION_LABEL_HEIGHT : 0

  for (const match of winners) {
    positions[match.id] = {
      x: (match.round - 1) * COLUMN_WIDTH,
      y: top + matchY(match.round, match.position),
    }
  }
  const winnersRounds = Math.max(0, ...winners.map((match) => match.round))
  const winnersBottom = top + Math.max(0, ...winners.map((m) => matchY(m.round, m.position)))

  if (isDouble) {
    labels.push({ text: 'Winners bracket', x: 0, y: SECTION_LABEL_HEIGHT / 2 })

    const losersTop = winnersBottom + ROW_UNIT + SECTION_GAP
    if (losers.length) labels.push({ text: 'Losers bracket', x: 0, y: losersTop })
    for (const match of losers) {
      positions[match.id] = {
        x: (match.round - 1) * COLUMN_WIDTH,
        y: losersTop + SECTION_LABEL_HEIGHT / 2 + matchY(Math.ceil(match.round / 2), match.position),
      }
    }

    const losersRounds = Math.max(0, ...losers.map((match) => match.round))
    const grandFinalX = Math.max(winnersRounds, losersRounds) * COLUMN_WIDTH
    labels.push({ text: 'Grand final', x: grandFinalX, y: SECTION_LABEL_HEIGHT / 2 })
    for (const match of grandFinals) {
      positions[match.id] = {
        x: grandFinalX + (match.round - 1) * COLUMN_WIDTH,
        y: top + matchY(winnersRounds, 1),
      }
    }
  }

  const placed = Object.values(positions)
  return {
    positions,
    labels,
    width: placed.length ? Math.max(...placed.map((p) => p.x)) + COLUMN_WIDTH : 0,
    height: placed.length ? Math.max(...placed.map((p) => p.y)) + ROW_UNIT : 0,
  }
}

/**
 * Single elimination: whoever wins the final. Double elimination: the
 * winners champion (slot 1) winning grand final 1, or else whoever wins the
 * reset match — the losers champion winning game one decides nothing yet.
 */
function findChampionId(matches) {
  const grandFinals = matches
    .filter((match) => sectionOf(match) === 'grand_final')
    .sort((a, b) => a.round - b.round)
  if (grandFinals.length === 0) {
    const final = matches.find(
      (match) => sectionOf(match) === 'winners' && match.winner_next_match_id == null,
    )
    return final?.status === 'complete' ? final.winner_id : null
  }
  const [gameOne, reset] = grandFinals
  if (reset) return reset.status === 'complete' ? reset.winner_id : null
  return gameOne.status === 'complete' && gameOne.winner_id === gameOne.team1_id
    ? gameOne.winner_id
    : null
}

function matchTestId(match) {
  const section = sectionOf(match)
  const prefix = section === 'winners' ? 'match' : `match-${section}`
  return `${prefix}-${match.round}-${match.position}`
}

export default function BracketDiagram({
  playoffBracketId,
  teams = [],
  courtCount = 1,
  readOnly = false,
  bestOf = 1,
  onChampionChange,
}) {
  const [matches, setMatches] = useState([])
  const [dispatch, setDispatch] = useState(null)
  const [holdError, setHoldError] = useState(null)
  const [connectionLost, setConnectionLost] = useState(false)

  useEffect(() => {
    let cancelled = false
    const breaker = createCircuitBreaker({
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
    })

    function refresh() {
      breaker
        .execute(() => withTimeout(getPlayoffBracketMatches(playoffBracketId), REQUEST_TIMEOUT_MS))
        .then((data) => {
          if (!cancelled) setMatches(data)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setConnectionLost(breaker.getState() === 'open')
        })
      // Queue places only; the bracket still works without them.
      getBracketDispatch(playoffBracketId)
        .then((data) => {
          if (!cancelled) setDispatch(data)
        })
        .catch(() => {})
    }

    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [playoffBracketId])

  function replaceMatch(updated) {
    setMatches((current) =>
      current.map((match) => (match.id === updated.id ? updated : match)),
    )
  }

  // Holding or releasing moves other matches on and off courts, so reload both.
  async function handleHold(match, onHold) {
    try {
      replaceMatch(await holdMatch(match.id, { onHold, version: match.version }))
      setHoldError(null)
    } catch (failure) {
      const body = await failure?.json?.().catch(() => null)
      setHoldError(body?.detail ?? "Couldn't change the hold. Please refresh and try again.")
    }
    getPlayoffBracketMatches(playoffBracketId)
      .then(setMatches)
      .catch(() => {})
    getBracketDispatch(playoffBracketId)
      .then(setDispatch)
      .catch(() => {})
  }

  function handleCorrected({ match: corrected, reset_matches: resetMatches }) {
    const updatedById = Object.fromEntries(
      [corrected, ...resetMatches].map((match) => [match.id, match]),
    )
    setMatches((current) => current.map((match) => updatedById[match.id] ?? match))
    // A correction can delete or create the grand final reset match, which
    // the response can't express as an update, so reload the whole bracket.
    getPlayoffBracketMatches(playoffBracketId)
      .then(setMatches)
      .catch(() => {})
  }

  const byId = Object.fromEntries(matches.map((match) => [match.id, match]))
  const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]))
  const championId = findChampionId(matches)
  const champion = championId != null ? teamName(teamsById, championId) : null

  // Deciding (or un-deciding, by a correction) the champion can change the
  // tournament's stage, which the page around this diagram may show.
  useEffect(() => {
    onChampionChange?.(championId)
  }, [championId, onChampionChange])
  // Only matches with both teams known get controls: a TBD slot, a team still
  // waiting on its opponent, or a bye has nothing to score or schedule yet.
  const bothTeams = (readOnly ? [] : matches).filter(
    (match) => match.team1_id != null && match.team2_id != null,
  )
  const playable = bothTeams.filter((match) => match.status !== 'complete')
  const correctable = bothTeams.filter((match) => match.status === 'complete')
  const { positions, labels, width, height } = layoutBracket(matches)
  const queued = queuePositions(dispatch)
  const overflow = dispatch?.overflow ?? false
  // Only a match nobody has started can be held; a held one is released before it's scored.
  const holdable = playable.filter(
    (match) => !match.on_hold && match.team1_score == null && match.team2_score == null,
  )
  const held = playable.filter((match) => match.on_hold)
  const scoreable = playable.filter((match) => !match.on_hold)

  return (
    <>
      {connectionLost && (
        <p role="status">
          Connection lost — retrying automatically (checks again every {COOLDOWN_MS / 1000}s).
        </p>
      )}
      {overflow && (
        <p>
          This bracket has no courts of its own: its matches take any court that frees up, in
          turn with the other brackets.
        </p>
      )}
      {champion && (
        <section aria-label="Champion">
          <h4>Champion</h4>
          <p>🏆 {champion}</p>
        </section>
      )}
      <div className="bracket-canvas" style={{ width, height }}>
      <svg
        role="img"
        aria-label="Bracket"
        width={width}
        height={height}
      >
        {labels.map((label) => (
          <text key={label.text} x={label.x} y={label.y} fontWeight="bold">
            {label.text}
          </text>
        ))}
        {matches
          .filter((match) => match.winner_next_match_id)
          .map((match) => {
            const next = byId[match.winner_next_match_id]
            if (!next) return null
            const from = positions[match.id]
            const to = positions[next.id]
            return (
              <line
                key={match.id}
                data-testid={`line-${match.id}`}
                x1={from.x + MATCH_WIDTH}
                y1={from.y + MATCH_HEIGHT / 2}
                x2={to.x}
                y2={to.y + MATCH_HEIGHT / 2}
                stroke="black"
              />
            )
          })}
        {matches.map((match) => (
          <g
            key={match.id}
            data-testid={matchTestId(match)}
            data-x={positions[match.id].x}
            data-y={positions[match.id].y}
            transform={`translate(${positions[match.id].x}, ${positions[match.id].y})`}
          >
            <rect width={MATCH_WIDTH} height={MATCH_HEIGHT} fill="white" stroke="black" />
            {[match.team1_id, match.team2_id].map((teamId, index) => {
              const label = slotLabel(teamsById, teamId, match.status)
              const score = slotScore(match, index, bestOf)
              const shown = truncate(label, score == null ? MAX_LABEL_LENGTH : MAX_SCORED_LABEL_LENGTH)
              const won =
                match.status === 'complete' && teamId != null && teamId === match.winner_id
              const y = LINE_HEIGHT * (index + 1)
              return (
                <g
                  key={index}
                  data-testid={`team${index + 1}-${matchTestId(match)}`}
                  fontWeight={won ? 'bold' : undefined}
                >
                  <text y={y}>
                    {shown !== label && <title>{label}</title>}
                    {shown}
                  </text>
                  {score != null && (
                    <text x={MATCH_WIDTH - SCORE_INSET} y={y} textAnchor="end">
                      {score}
                    </text>
                  )}
                </g>
              )
            })}
            <text y={LINE_HEIGHT * 3} fontSize="11">
              {scheduleLabel(match, queued[match.id], overflow)}
            </text>
          </g>
        ))}
      </svg>
      {correctable.map((match) => (
        <div
          key={`${match.id}-${match.version}`}
          className="bracket-match-actions"
          data-testid={`${matchTestId(match)}-actions`}
          style={{
            left: `${positions[match.id].x}px`,
            top: `${positions[match.id].y + MATCH_HEIGHT + ACTIONS_GAP}px`,
          }}
        >
          <CorrectionForm
            match={match}
            bestOf={bestOf}
            team1Name={teamName(teamsById, match.team1_id)}
            team2Name={teamName(teamsById, match.team2_id)}
            onCorrected={handleCorrected}
          />
        </div>
      ))}
      </div>
      {playable.map((match) => (
        <ScheduleForm
          key={`${match.id}-${match.court}-${match.scheduled_time}`}
          match={match}
          title={`${matchName(match)}: ${slotLabel(teamsById, match.team1_id, match.status)} vs ${slotLabel(teamsById, match.team2_id, match.status)}`}
          courtCount={courtCount}
          onSaved={replaceMatch}
        />
      ))}
      {(holdable.length > 0 || held.length > 0) && (
        <section aria-label="Holds">
          {holdError && <p>{holdError}</p>}
          {holdable.map((match) => (
            <button key={match.id} type="button" onClick={() => handleHold(match, true)}>
              Hold {matchName(match)}
            </button>
          ))}
          {held.map((match) => (
            <button key={match.id} type="button" onClick={() => handleHold(match, false)}>
              Release {matchName(match)}
            </button>
          ))}
        </section>
      )}
      {scoreable.map((match) =>
        bestOf > 1 ? (
          <SeriesForm
            key={match.id}
            match={match}
            bestOf={bestOf}
            team1Name={teamName(teamsById, match.team1_id)}
            team2Name={teamName(teamsById, match.team2_id)}
            onScored={replaceMatch}
          />
        ) : (
          <ScoreEntryForm
            key={match.id}
            match={match}
            team1Name={teamName(teamsById, match.team1_id)}
            team2Name={teamName(teamsById, match.team2_id)}
            onScored={replaceMatch}
          />
        ),
      )}
    </>
  )
}
