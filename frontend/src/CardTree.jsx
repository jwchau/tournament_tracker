import { layoutBracket } from './bracketModel'
import { BracketCard } from './MatchCard'

// Cards at arm's length on a laptop: wide enough for two names and their
// score chips, tall enough for two team rows and the court line.
const GEOMETRY = { matchWidth: 248, roundGap: 56, rowUnit: 164 }
const CARD_HEIGHT = 132
const HEAD_HEIGHT = 36

/**
 * The bracket as a tree of match cards on a wider screen: the same cards as
 * the phone's round pages, placed where the bracket puts them, joined by
 * lines, with each round's name over its column.
 */
export default function CardTree({ matches, rounds, labels, cardProps }) {
  const byId = Object.fromEntries(matches.map((match) => [match.id, match]))
  const { positions, labels: sectionLabels, isDouble, columnWidth, width, height } = layoutBracket(
    matches,
    GEOMETRY,
  )
  // Single elimination names each column; double elimination labels its sections.
  const heads = isDouble
    ? sectionLabels.map((label) => ({ key: label.text, name: label.text, x: label.x }))
    : rounds.map((round) => ({
        key: round.key,
        name: round.name,
        x: (round.matches[0].round - 1) * columnWidth,
      }))
  const top = isDouble ? 0 : HEAD_HEIGHT
  const at = (match) => ({ x: positions[match.id].x, y: positions[match.id].y + top })

  return (
    <div className="card-tree" style={{ width, height: height + top }}>
      {heads.map((head) => (
        <span
          key={head.key}
          className="card-tree-head"
          style={{
            left: head.x,
            top: isDouble ? sectionLabels.find((l) => l.text === head.name).y - 12 : 0,
            width: GEOMETRY.matchWidth,
          }}
        >
          {head.name}
        </span>
      ))}
      <svg className="card-tree-lines" width={width} height={height + top} aria-hidden="true">
        {matches
          .filter((match) => match.winner_next_match_id && byId[match.winner_next_match_id])
          .map((match) => {
            const from = at(match)
            const to = at(byId[match.winner_next_match_id])
            const x1 = from.x + GEOMETRY.matchWidth
            const y1 = from.y + CARD_HEIGHT / 2
            const y2 = to.y + CARD_HEIGHT / 2
            const mid = x1 + GEOMETRY.roundGap / 2
            return (
              <path
                key={match.id}
                className="bracket-line"
                fill="none"
                d={`M${x1} ${y1} H${mid} V${y2} H${to.x}`}
              />
            )
          })}
      </svg>
      {matches.map((match) => (
        <BracketCard
          key={match.id}
          as="div"
          match={match}
          label={labels[match.id]}
          style={{
            position: 'absolute',
            left: at(match).x,
            top: at(match).y,
            width: GEOMETRY.matchWidth,
          }}
          {...cardProps(match)}
        />
      ))}
    </div>
  )
}
