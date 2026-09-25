import { fireEvent, render, screen, waitFor, within } from './testUtils'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PoolSchedule from './PoolSchedule'

const inRouter = (ui) => <MemoryRouter>{ui}</MemoryRouter>

afterEach(() => {
  vi.restoreAllMocks()
})

const pool = { id: 1, tournament_id: 3, name: 'Pool A', courts: [1] }

const teams = [
  { id: 10, name: 'Spikers', pool_id: 1 },
  { id: 11, name: 'Diggers', pool_id: 1 },
  { id: 12, name: 'Blockers', pool_id: 1 },
  { id: 13, name: 'Elsewhere', pool_id: 2 },
]

function poolMatch(id, round, team1, team2, fields = {}) {
  return {
    id,
    bracket: 'pool',
    pool_id: 1,
    round,
    position: 1,
    court: 1,
    team1_id: team1,
    team2_id: team2,
    team1_score: null,
    team2_score: null,
    status: 'ready',
    winner_id: null,
    version: 1,
    ...fields,
  }
}

const schedule = [
  poolMatch(1, 1, 10, 11, { team1_score: 21, team2_score: 15, status: 'complete', winner_id: 10 }),
  poolMatch(2, 2, 10, 12),
  poolMatch(3, 3, 11, 12),
]

// The slot list's row for a pairing.
function matchRow(teamsText) {
  return screen.getByText(teamsText).closest('li')
}

test('lists each slot with its court, teams, score, and who is idle', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const firstSlot = (await screen.findByRole('heading', { name: /^Slot 1/ })).closest('li')
  const played = within(firstSlot).getByText('Spikers vs Diggers').closest('li')
  expect(played).toHaveTextContent('Court 1')
  expect(played).toHaveTextContent('21–15')
  expect(within(firstSlot).getByText('Observing: Blockers')).toBeInTheDocument()
  expect(screen.queryByText(/Elsewhere/)).not.toBeInTheDocument()
})

test('scoring happens on the court: unfinished matches link to its scoreboard', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  await screen.findByRole('heading', { name: /^Slot 1/ })
  expect(
    within(matchRow('Spikers vs Blockers')).getByRole('link', { name: 'Score on Court 1' }),
  ).toHaveAttribute('href', '/tournaments/3/courts/1')
  expect(
    within(matchRow('Spikers vs Diggers')).queryByRole('link', { name: /court/i }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /submit score/i })).not.toBeInTheDocument()
})

test('the slot being played now is marked', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  expect(await screen.findByRole('heading', { name: 'Slot 2 Now' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Slot 1' })).toBeInTheDocument()
})

test('the results grid shows every pairing from each team’s side', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const cell = (rowTeam, columnIndex) =>
    within(grid).getByRole('rowheader', { name: new RegExp(rowTeam) }).closest('tr').cells[
      columnIndex
    ]
  // Columns follow the rows: 1 Spikers, 2 Diggers, 3 Blockers.
  expect(cell('Spikers', 2)).toHaveTextContent('21–15')
  expect(cell('Diggers', 1)).toHaveTextContent('15–21')
  expect(cell('Spikers', 3)).toHaveTextContent('Slot 2 · Court 1')
  // Each pairing links to its match in the slot list.
  expect(within(cell('Spikers', 3)).getByRole('link')).toHaveAttribute('href', '#pool-match-2')
  expect(matchRow('Spikers vs Blockers')).toHaveAttribute('id', 'pool-match-2')
})

test('the grid labels teams by letter, so its heads are never read as ranks', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const heads = within(grid).getAllByRole('columnheader').slice(1)
  expect(heads.map((head) => head.textContent)).toEqual(['A', 'B', 'C'])
  expect(within(heads[0]).getByTitle('Spikers')).toBeInTheDocument()
  expect(within(grid).getByRole('rowheader', { name: /Diggers/ })).toHaveTextContent('B')
})

test('choosing a pairing marks it in the grid and the schedule', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const entries = within(grid).getAllByRole('link', { name: /21–15|15–21/ })
  fireEvent.click(entries[0])

  // Both sides of the pairing in the grid, and its row in the schedule.
  for (const entry of entries) expect(entry).toHaveAttribute('aria-current', 'true')
  expect(matchRow('Spikers vs Diggers')).toHaveAttribute('aria-current', 'true')
  expect(matchRow('Spikers vs Blockers')).not.toHaveAttribute('aria-current')

  // And from the schedule back to the grid.
  fireEvent.click(within(matchRow('Spikers vs Blockers')).getByRole('link', { name: 'Spikers vs Blockers' }))
  expect(matchRow('Spikers vs Blockers')).toHaveAttribute('aria-current', 'true')
  expect(entries[0]).not.toHaveAttribute('aria-current')
})

test('splits idle teams evenly between observing and resting', async () => {
  const bigPool = [10, 11, 12, 13, 14].map((id) => ({ id, name: `T${id}`, pool_id: 1 }))
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([poolMatch(1, 1, 10, 11)])

  render(inRouter(<PoolSchedule pool={pool} teams={bigPool} />))

  expect(await screen.findByText('Observing: T12, T13')).toBeInTheDocument()
  expect(screen.getByText('Resting: T14')).toBeInTheDocument()
})

test('generates the schedule using the tournament setting for games per pairing', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([])
  const generate = vi.spyOn(api, 'generatePoolSchedule').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  fireEvent.click(await screen.findByRole('button', { name: /generate schedule/i }))

  await waitFor(() => expect(generate).toHaveBeenCalledWith(1))
  expect(await screen.findByRole('heading', { name: /^Slot 3/ })).toBeInTheDocument()
  expect(screen.queryByLabelText(/games per pairing/i)).not.toBeInTheDocument()
})

test('shows why generating the schedule was refused', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([])
  vi.spyOn(api, 'generatePoolSchedule').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'a pool needs at least 2 teams' }),
  })

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))
  fireEvent.click(await screen.findByRole('button', { name: /generate schedule/i }))

  expect(await screen.findByText('a pool needs at least 2 teams')).toBeInTheDocument()
})

test('does not offer to generate a schedule once the pool has one', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  await screen.findByRole('heading', { name: /^Slot 1/ })
  expect(screen.queryByRole('button', { name: /generate schedule/i })).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/games per pairing/i)).not.toBeInTheDocument()
})

test('shows a loading placeholder, not an empty schedule or the generate button, until the matches arrive', () => {
  vi.spyOn(api, 'getPoolMatches').mockReturnValue(new Promise(() => {}))

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  expect(screen.getByRole('status', { name: 'Loading schedule' })).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /generate schedule/i })).not.toBeInTheDocument()
})

test('a finished match offers a correction; unfinished ones do not', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  expect(
    await screen.findByRole('button', { name: 'Correct Spikers vs Diggers' }),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^correct /i })).toHaveLength(1)
})

test('signed out, finished matches cannot be corrected', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />), { user: null })

  await screen.findByText('Spikers vs Diggers')
  expect(screen.queryByRole('button', { name: /^correct /i })).not.toBeInTheDocument()
})

test('a correction shows the new score and tells the page the matches changed', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: [] })
  const corrected = { ...schedule[0], team1_score: 15, team2_score: 21, winner_id: 11, version: 2 }
  vi.spyOn(api, 'correctScore').mockResolvedValue({ match: corrected, reset_matches: [] })
  const onMatchesChange = vi.fn()

  render(inRouter(<PoolSchedule pool={pool} teams={teams} onMatchesChange={onMatchesChange} />))

  fireEvent.click(await screen.findByRole('button', { name: 'Correct Spikers vs Diggers' }))
  const dialog = screen.getByRole('dialog', { name: 'Correct Spikers vs Diggers' })
  fireEvent.change(within(dialog).getByLabelText('Spikers score'), { target: { value: '15' } })
  fireEvent.change(within(dialog).getByLabelText('Diggers score'), { target: { value: '21' } })
  fireEvent.click(within(dialog).getByRole('button', { name: /review correction/i }))
  fireEvent.click(await screen.findByRole('button', { name: /apply correction/i }))

  await waitFor(() => expect(matchRow('Spikers vs Diggers')).toHaveTextContent('15–21'))
  expect(onMatchesChange).toHaveBeenLastCalledWith(expect.arrayContaining([corrected]))
})
