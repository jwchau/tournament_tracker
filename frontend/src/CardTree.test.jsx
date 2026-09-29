import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import { matchLabels, roundsOf } from './bracketModel'
import CardTree from './CardTree'

afterEach(() => {
  vi.restoreAllMocks()
})

function match(id, round, position, fields = {}) {
  return {
    id,
    bracket: 'winners',
    round,
    position,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    winner_id: null,
    winner_next_match_id: round === 1 ? 3 : null,
    winner_next_slot: position,
    version: 1,
    ...fields,
  }
}

// A four-team bracket: the first semi on a court (a taller card), the second waiting.
const matches = [
  match(1, 1, 1, { team1_id: 10, team2_id: 20, status: 'ready', court: 1, ref_team_id: 30 }),
  match(2, 1, 2, { team1_id: 30, team2_id: 40, status: 'ready' }),
  match(3, 2, 1),
]

function renderTree() {
  const rounds = roundsOf(matches)
  const teamsById = { 10: { name: 'Aces' }, 20: { name: 'Blocks' }, 30: { name: 'Digs' }, 40: { name: 'Sets' } }
  return render(
    <MemoryRouter>
      <CardTree
        matches={matches}
        rounds={rounds}
        labels={matchLabels(rounds)}
        cardProps={() => ({ teamsById, bestOf: 1, tournamentId: 3, signedIn: true, onSelect: () => {} })}
      />
    </MemoryRouter>,
  )
}

// Cards as rendered: the one on a court (with its ref line and court link) is taller.
function stubCardHeights(heightOf) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function height() {
    return this.classList.contains('round-card') ? heightOf(this) : 0
  })
}

const top = (card) => parseFloat(card.style.top)

test('rows are spaced by the tallest card, so a taller card never runs into the next', () => {
  stubCardHeights((card) => (card.dataset.live === '' ? 180 : 132))

  const { container } = renderTree()

  const [first, second] = container.querySelectorAll('.card-tree > .round-card')
  // The tallest card sets the slot: 180 plus the 32px gap between rows.
  expect(top(second) - top(first)).toBeGreaterThanOrEqual(180 + 32)
})

test('each card sits centred in its slot, and the lines meet the cards at their middles', () => {
  stubCardHeights((card) => (card.dataset.live === '' ? 180 : 132))

  const { container } = renderTree()

  const [first, second] = container.querySelectorAll('.card-tree > .round-card')
  // The shorter card is pushed down by half the difference, so both centres line up with their slot.
  const middle = (card, height) => top(card) + height / 2
  const lines = [...container.querySelectorAll('.bracket-line')].map((line) =>
    Number(line.getAttribute('d').split(' ')[1]),
  )
  expect(lines).toEqual([middle(first, 180), middle(second, 132)])
})

test('before the cards are measured, rows use the usual card height', () => {
  const { container } = renderTree()

  const [first, second] = container.querySelectorAll('.card-tree > .round-card')
  expect(top(second) - top(first)).toBe(132 + 32)
})
