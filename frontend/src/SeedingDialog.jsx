import { useEffect, useRef, useState } from 'react'

function ordinal(place) {
  const teen = place % 100 >= 11 && place % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th')
  return `${place}${suffix}`
}

function finish(entry) {
  if (!entry.pool) return null
  return entry.pool_rank ? `${entry.pool} · ${ordinal(entry.pool_rank)}` : entry.pool
}

function sameOrder(a, b) {
  return a.every((tier, index) => tier.length === b[index].length && tier.every((id, i) => id === b[index][i]))
}

const chevron = (up) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={up ? 'M5 12l5-5 5 5' : 'M5 8l5 5 5-5'} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * The last look before playoff brackets are built: each bracket's seed order as
 * the standings gave it, which the organizer can confirm as is or change by
 * moving teams up and down inside their bracket. The format is chosen here too.
 * Confirming hands back the format and, only if the order changed, the seeding.
 */
export default function SeedingDialog({
  seeding,
  initialFormat = 'single',
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const original = seeding.tiers.map((tier) => tier.teams.map((team) => team.team_id))
  const entries = Object.fromEntries(
    seeding.tiers.flatMap((tier) => tier.teams.map((team) => [team.team_id, team])),
  )
  const [order, setOrder] = useState(original)
  const [format, setFormat] = useState(initialFormat)
  // The move button to keep focus on after a team changes place.
  const focusOn = useRef(null)
  const listRef = useRef(null)
  const changed = !sameOrder(order, original)

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  // A team that reaches the top or bottom has no further move that way, so
  // focus falls to the opposite button instead of being lost.
  useEffect(() => {
    if (!focusOn.current) return
    const [teamId, direction] = focusOn.current
    focusOn.current = null
    const button = (way) => listRef.current?.querySelector(`[data-move="${teamId}-${way}"]`)
    const preferred = button(direction)
    const target = preferred && !preferred.disabled ? preferred : button(direction === 'up' ? 'down' : 'up')
    target?.focus()
  }, [order])

  function move(tierIndex, from, delta) {
    const team = order[tierIndex][from]
    setOrder((current) =>
      current.map((ids, index) => {
        if (index !== tierIndex) return ids
        const next = [...ids]
        next.splice(from, 1)
        next.splice(from + delta, 0, team)
        return next
      }),
    )
    focusOn.current = [team, delta < 0 ? 'up' : 'down']
  }

  return (
    <div className="modal-overlay">
      <div className="modal seeding-modal" role="dialog" aria-modal="true" aria-label="Confirm playoff seeding">
        <h3>Confirm playoff seeding</h3>
        <p className="section-note">
          Teams start each bracket in this order, best seed first. Move a team up or down to change
          it. Brackets can be reset until the first playoff score.
        </p>

        <span className="field">
          <label htmlFor="playoff-format">Playoff format</label>
          <select id="playoff-format" value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="single">Single elimination</option>
            <option value="double">Double elimination</option>
          </select>
        </span>

        <div className="seeding-tiers" ref={listRef}>
          {order.map((ids, tierIndex) => (
            <section key={seeding.tiers[tierIndex].tier} aria-labelledby={`seeding-tier-${tierIndex}`}>
              <h4 id={`seeding-tier-${tierIndex}`}>Bracket {seeding.tiers[tierIndex].tier}</h4>
              <ol className="seed-list">
                {ids.map((teamId, index) => {
                  const entry = entries[teamId]
                  return (
                    <li key={teamId}>
                      <span className="seed-number">{index + 1}</span>
                      <span className="seed-team">
                        <span className="seed-name">{entry.name}</span>
                        {finish(entry) && <span className="seed-finish">{finish(entry)}</span>}
                      </span>
                      <button
                        type="button"
                        className="seed-move"
                        data-move={`${teamId}-up`}
                        aria-label={`Move ${entry.name} up`}
                        disabled={index === 0}
                        onClick={() => move(tierIndex, index, -1)}
                      >
                        {chevron(true)}
                      </button>
                      <button
                        type="button"
                        className="seed-move"
                        data-move={`${teamId}-down`}
                        aria-label={`Move ${entry.name} down`}
                        disabled={index === ids.length - 1}
                        onClick={() => move(tierIndex, index, 1)}
                      >
                        {chevron(false)}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>

        <div className="modal-actions">
          {changed && (
            <button type="button" className="seeding-reset" onClick={() => setOrder(original)}>
              Reset to standings order
            </button>
          )}
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onConfirm({ format, seeding: changed ? order : undefined })}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
