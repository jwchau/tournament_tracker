import { useEffect } from 'react'

import {
  findChampionId,
  layoutBracket,
  queuePositions,
  scheduleLabel,
  sectionOf,
  slotLabel,
  slotScore,
  teamName,
} from './bracketModel'
import Loading from './Loading'
import { COOLDOWN_MS, useBracketMatches } from './useBracketMatches'

// Sized to read at arm's length on a phone in daylight: 16px names, 14px
// court and time.
const MATCH_WIDTH = 176
const LINE_HEIGHT = 22
const MATCH_HEIGHT = LINE_HEIGHT * 3 + 8
// Keeps labels off the box's rounded left edge.
const TEXT_INSET = 8
const ROUND_GAP = 60
const ROW_UNIT = 100
const MAX_LABEL_LENGTH = 18
// Names are cut shorter when a score sits at the right edge of the box.
const MAX_SCORED_LABEL_LENGTH = 15
const SCORE_INSET = 8

function truncate(label, maxLength = MAX_LABEL_LENGTH) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label
}

const GEOMETRY = { matchWidth: MATCH_WIDTH, roundGap: ROUND_GAP, rowUnit: ROW_UNIT }

function matchTestId(match) {
  const section = sectionOf(match)
  const prefix = section === 'winners' ? 'match' : `match-${section}`
  return `${prefix}-${match.round}-${match.position}`
}

// A note shown while the bracket can't be reached.
export function ConnectionNote() {
  return (
    <p role="status" className="finish-note">
      Connection lost — retrying automatically (checks again every {COOLDOWN_MS / 1000}s).
    </p>
  )
}

export function OverflowNote() {
  return (
    <p className="pool-courts">
      This bracket has no courts of its own: its matches take any court that frees up, in turn
      with the other brackets.
    </p>
  )
}

// The bracket's winner, said as a sentence: no label above it.
export function ChampionBanner({ name }) {
  return (
    <section aria-label="Champion" className="champion">
      <p className="champion-name">{name} win the bracket</p>
    </section>
  )
}

/** The bracket drawn as a read-only tree of boxes. */
function BracketTree({ matches, dispatch, teams = [], bestOf = 1 }) {
  const byId = Object.fromEntries(matches.map((match) => [match.id, match]))
  const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]))
  const { positions, labels, width, height } = layoutBracket(matches, GEOMETRY)
  const queued = queuePositions(dispatch)
  const overflow = dispatch?.overflow ?? false

  return (
    <div className="bracket-canvas" style={{ width, height }}>
      <svg className="bracket-svg" role="img" aria-label="Bracket" width={width} height={height}>
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
                className="bracket-line"
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
            <rect className="bracket-box" width={MATCH_WIDTH} height={MATCH_HEIGHT} rx={12} />
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
                  <text x={TEXT_INSET} y={y}>
                    {shown !== label && <title>{label}</title>}
                    {shown}
                  </text>
                  {score != null && (
                    <text
                      className={won ? 'bracket-score-won' : undefined}
                      x={MATCH_WIDTH - SCORE_INSET}
                      y={y}
                      textAnchor="end"
                    >
                      {score}
                    </text>
                  )}
                </g>
              )
            })}
            <text className="bracket-meta" x={TEXT_INSET} y={LINE_HEIGHT * 3}>
              {scheduleLabel(match, queued[match.id], overflow)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/**
 * A bracket, polled, drawn as a read-only tree with its champion once
 * decided. The bracket page uses BracketBoard instead, which opens matches.
 */
export default function BracketDiagram({ playoffBracketId, teams = [], bestOf = 1, onChampionChange }) {
  const { matches, loaded, dispatch, connectionLost } = useBracketMatches(playoffBracketId)
  const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]))
  const championId = findChampionId(matches)

  // Deciding (or un-deciding, by a correction) the champion can change the
  // tournament's stage, which the page around this diagram may show.
  useEffect(() => {
    onChampionChange?.(championId)
  }, [championId, onChampionChange])

  if (!loaded) {
    return (
      <>
        {connectionLost && <ConnectionNote />}
        <Loading label="Loading matches" rows={6} />
      </>
    )
  }

  return (
    <>
      {connectionLost && <ConnectionNote />}
      {dispatch?.overflow && <OverflowNote />}
      {championId != null && <ChampionBanner name={teamName(teamsById, championId)} />}
      <BracketTree matches={matches} dispatch={dispatch} teams={teams} bestOf={bestOf} />
    </>
  )
}
