import { useLayoutEffect, useRef, useState } from 'react'

import { layoutBracket } from './bracketModel'
import { BracketCard } from './MatchCard'

// Cards at arm's length on a laptop: wide enough for two names and their
// score chips.
const MATCH_WIDTH = 248
const ROUND_GAP = 56
// A card's height depends on what it shows (a court and ref line, the court
// link, a series), so rows are spaced by the tallest card as rendered, with
// this much air between them. CARD_HEIGHT is the usual height, used until the
// cards are measured.
const CARD_HEIGHT = 132
const ROW_GAP = 32
const HEAD_HEIGHT = 36

/**
 * The bracket as a tree of match cards on a wider screen: the same cards as
 * the phone's round pages, placed where the bracket puts them, joined by
 * lines, with each round's name over its column.
 */
export default function CardTree({ matches, rounds, labels, cardProps }) {
  const treeRef = useRef(null)
  // Each card's rendered height, by match id: measured before paint whenever
  // the matches change, and again whenever a card changes size (a font
  // loading, a name wrapping).
  const [heights, setHeights] = useState({})
  useLayoutEffect(() => {
    const tree = treeRef.current
    if (!tree) return undefined
    const cards = () => [...tree.querySelectorAll(':scope > .round-card')]
    function measure() {
      const measured = {}
      cards().forEach((card, index) => {
        if (matches[index]) measured[matches[index].id] = card.offsetHeight
      })
      setHeights((current) => (JSON.stringify(current) === JSON.stringify(measured) ? current : measured))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    cards().forEach((card) => observer.observe(card))
    return () => observer.disconnect()
  }, [matches])
  const tallest = Math.max(0, ...Object.values(heights)) || CARD_HEIGHT

  const geometry = { matchWidth: MATCH_WIDTH, roundGap: ROUND_GAP, rowUnit: tallest + ROW_GAP }
  const byId = Object.fromEntries(matches.map((match) => [match.id, match]))
  const { positions, labels: sectionLabels, isDouble, columnWidth, width, height } = layoutBracket(
    matches,
    geometry,
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
  // Every card is centred in a slot as tall as the tallest, so the lines
  // between rounds meet each card at its middle.
  const at = (match) => ({ x: positions[match.id].x, y: positions[match.id].y + top })
  const middle = (match) => at(match).y + tallest / 2
  const cardTop = (match) => at(match).y + (tallest - (heights[match.id] || tallest)) / 2

  return (
    <div className="card-tree" ref={treeRef} style={{ width, height: height + top }}>
      {heads.map((head) => (
        <span
          key={head.key}
          className="card-tree-head"
          style={{
            left: head.x,
            top: isDouble ? sectionLabels.find((l) => l.text === head.name).y - 12 : 0,
            width: MATCH_WIDTH,
          }}
        >
          {head.name}
        </span>
      ))}
      <svg className="card-tree-lines" width={width} height={height + top} aria-hidden="true">
        {matches
          .filter((match) => match.winner_next_match_id && byId[match.winner_next_match_id])
          .map((match) => {
            const next = byId[match.winner_next_match_id]
            const x1 = at(match).x + MATCH_WIDTH
            const y1 = middle(match)
            const y2 = middle(next)
            const mid = x1 + ROUND_GAP / 2
            return (
              <path
                key={match.id}
                className="bracket-line"
                fill="none"
                d={`M${x1} ${y1} H${mid} V${y2} H${at(next).x}`}
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
            top: cardTop(match),
            width: MATCH_WIDTH,
          }}
          {...cardProps(match)}
        />
      ))}
    </div>
  )
}
