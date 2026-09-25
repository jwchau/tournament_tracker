import { useContext, useState } from 'react'

import { SwapSidesContext } from './swapSides'

function Plus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function Minus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The numeral as a split flip card. When the score changes, from a tap, a
 * typed value or another device, the old top half folds down and the new
 * bottom half drops into place.
 */
function FlipNumeral({ value, children }) {
  const [shown, setShown] = useState(value)
  const [previous, setPrevious] = useState(null)
  const [turn, setTurn] = useState(0)

  if (value !== shown) {
    setPrevious(shown)
    setShown(value)
    setTurn(turn + 1)
  }

  return (
    <span className="flip-card" data-digits={String(value).length > 1 ? 'two' : 'one'}>
      <span className="flip-face" aria-hidden="true">
        <span className="flip-half flip-top">{value}</span>
        <span className="flip-half flip-bottom">{previous ?? value}</span>
        {previous !== null && (
          <>
            <span key={`fold-${turn}`} className="flip-half flip-top flip-fold">
              {previous}
            </span>
            <span key={`drop-${turn}`} className="flip-half flip-bottom flip-drop">
              {value}
            </span>
          </>
        )}
      </span>
      {children}
    </span>
  )
}

function Column({ id, name, score, label, readOnly, onChange, onStep }) {
  if (readOnly) {
    return (
      <div className="flip-column" role="group" aria-label={`${name}, ${score}`}>
        <span className="flip-team">{name}</span>
        <FlipNumeral value={score} />
      </div>
    )
  }

  return (
    <div className="flip-column">
      <label className="flip-team" htmlFor={id}>
        {name}
      </label>
      <FlipNumeral value={score}>
        {/* The card shows the numeral; this input takes a typed score. */}
        <input
          id={id}
          className="flip-input"
          type="number"
          inputMode="numeric"
          min="0"
          aria-label={label}
          value={score}
          onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
        />
      </FlipNumeral>
      <button
        type="button"
        className="flip-plus"
        aria-label={`Point to ${name}`}
        onClick={() => onStep(1)}
      >
        <Plus />1
      </button>
      <button
        type="button"
        className="flip-minus"
        aria-label={`Take a point from ${name}`}
        disabled={score <= 0}
        onClick={() => onStep(-1)}
      >
        <Minus />1
      </button>
    </div>
  )
}

/**
 * The court's scoreboard: each team's score as a large flip-card numeral,
 * with +1 and −1 under it. A score can also be typed. Read-only for
 * spectators. scores is { team1, team2 }; labelPrefix names a series game
 * ("Game 2 ").
 */
export default function FlipBoard({
  idPrefix,
  team1Name,
  team2Name,
  scores,
  onChange,
  labelPrefix = '',
  readOnly = false,
}) {
  function set(side, value) {
    onChange({ ...scores, [side]: Math.max(0, value) })
  }

  const swapped = useContext(SwapSidesContext)
  const columns = [
    ['team1', team1Name],
    ['team2', team2Name],
  ]
  if (swapped) columns.reverse()

  return (
    <div className="flip-board">
      {columns.map(([side, name]) => (
        <Column
          key={side}
          id={`${idPrefix}-${side}`}
          name={name}
          score={scores[side]}
          label={`${labelPrefix}${name} score`}
          readOnly={readOnly}
          onChange={(value) => set(side, value)}
          onStep={(delta) => set(side, scores[side] + delta)}
        />
      ))}
    </div>
  )
}
