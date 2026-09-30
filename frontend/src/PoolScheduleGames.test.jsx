import { render, screen, within } from './testUtils'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PoolSchedule from './PoolSchedule'

afterEach(() => {
  vi.restoreAllMocks()
})

const pool = { id: 1, tournament_id: 3, name: 'Pool A', courts: [1] }

const teams = [
  { id: 10, name: 'Spikers', pool_id: 1 },
  { id: 11, name: 'Diggers', pool_id: 1 },
  { id: 12, name: 'Blockers', pool_id: 1 },
]

function poolMatch(id, slot, team1, team2, fields = {}) {
  return {
    id,
    bracket: 'pool',
    pool_id: 1,
    round: slot,
    position: 1,
    court: 1,
    team1_id: team1,
    team2_id: team2,
    team1_score: null,
    team2_score: null,
    status: 'ready',
    winner_id: null,
    ref_team_id: null,
    ref_set_at: null,
    version: 1,
    ...fields,
  }
}

// Two games per pairing: Spikers v Diggers fills slots 1 and 2, Spikers v Blockers slots 3 and 4.
const twoGames = [
  poolMatch(1, 1, 10, 11, {
    team1_score: 21,
    team2_score: 15,
    status: 'complete',
    winner_id: 10,
    ref_team_id: 12,
  }),
  poolMatch(2, 2, 10, 11, { ref_team_id: 12 }),
  poolMatch(3, 3, 10, 12, { ref_team_id: 11 }),
  poolMatch(4, 4, 10, 12, { ref_team_id: 11 }),
]

const inRouter = (ui) => <MemoryRouter>{ui}</MemoryRouter>

test('a round holds a pairing’s games together, each labelled with its game number', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(twoGames)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} gamesPerPairing={2} />), { user: null })

  const headings = await screen.findAllByRole('heading', { level: 4 })
  expect(headings.map((heading) => heading.textContent)).toEqual(['Round 1 Now', 'Round 2'])
  const first = headings[0].closest('li')
  const rows = within(first).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('Spikers vs DiggersGame 1')
  expect(rows[0]).toHaveTextContent('21–15')
  expect(rows[1]).toHaveTextContent('Spikers vs DiggersGame 2')
  expect(rows[1]).toHaveAttribute('data-continues')
  expect(rows[0]).not.toHaveAttribute('data-continues')
})

test('one game per pairing shows no game labels', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([twoGames[0], poolMatch(5, 2, 10, 12)])

  render(inRouter(<PoolSchedule pool={pool} teams={teams} gamesPerPairing={1} />), { user: null })

  await screen.findByRole('heading', { name: /^Round 2/ })
  expect(screen.queryByText(/^Game \d/)).not.toBeInTheDocument()
})

test('the grid has one column per round, a playing cell showing every game’s score', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([
    twoGames[0],
    { ...twoGames[1], team1_score: 18, team2_score: 21, status: 'complete', winner_id: 11 },
    twoGames[2],
    twoGames[3],
  ])

  render(inRouter(<PoolSchedule pool={pool} teams={teams} gamesPerPairing={2} />), { user: null })

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const heads = within(grid).getAllByRole('columnheader').slice(1)
  expect(heads.map((head) => head.textContent)).toEqual(['Round 1', 'Round 2 (now)'])
  const spikers = within(grid).getByRole('rowheader', { name: 'Spikers' }).closest('tr')
  expect(spikers.cells[1]).toHaveTextContent('Ct 1 · vs Diggers21–1518–21')
  expect(within(spikers.cells[1]).getAllByRole('link')).toHaveLength(1)
  expect(spikers.cells[2]).toHaveTextContent(/^Ct 1 · vs Blockers$/)
})

test('a grid cell and the schedule rows of its games point at each other', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(twoGames)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} gamesPerPairing={2} />), { user: null })

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const spikers = within(grid).getByRole('rowheader', { name: 'Spikers' }).closest('tr')
  const cellLink = within(spikers.cells[1]).getByRole('link')
  expect(cellLink).toHaveAttribute('href', '#pool-match-1')
  const links = screen.getAllByRole('link', { name: 'Spikers vs Diggers' })
  expect(links).toHaveLength(2)
  for (const link of links) expect(link).toHaveAttribute('href', `#${cellLink.id}`)
})
