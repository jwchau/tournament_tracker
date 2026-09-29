import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PoolStandings from './PoolStandings'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const standings = [
  { team_id: 11, name: 'Diggers', played: 2, wins: 1, losses: 1, points: 3, points_for: 40, point_diff: 14, rank: 1 },
  { team_id: 12, name: 'Blockers', played: 2, wins: 1, losses: 1, points: 3, points_for: 31, point_diff: -5, rank: 2 },
  { team_id: 10, name: 'Spikers', played: 2, wins: 1, losses: 1, points: 3, points_for: 29, point_diff: 0, rank: 3 },
]

test('renders the standings table in rank order with signed differentials', async () => {
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue(standings)

  render(<PoolStandings poolId={1} />)

  const table = await screen.findByRole('table', { name: /standings/i })
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent)
  expect(headers).toEqual(['#', 'Team', 'P', 'W', 'L', 'Pts', 'Diff', 'PF'])

  const rows = within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    )
  expect(rows).toEqual([
    ['1', 'Diggers', '2', '1', '1', '3', '+14', '40'],
    ['2', 'Blockers', '2', '1', '1', '3', '-5', '31'],
    ['3', 'Spikers', '2', '1', '1', '3', '0', '29'],
  ])
})

test('a refresh button fetches the standings now and is disabled for 3 seconds', async () => {
  vi.useFakeTimers()
  const getPoolStandings = vi.spyOn(api, 'getPoolStandings').mockResolvedValue(standings)

  render(<PoolStandings poolId={1} />)
  await act(() => vi.advanceTimersByTimeAsync(0))
  const button = screen.getByRole('button', { name: 'Refresh standings' })

  await act(async () => fireEvent.click(button))
  expect(getPoolStandings).toHaveBeenCalledTimes(2)
  expect(button).toBeDisabled()

  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(button).toBeEnabled()
})

test('marks the places that advance and says how many go through', async () => {
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue(standings)

  render(<PoolStandings poolId={1} advancing={2} />)

  const table = await screen.findByRole('table', { name: /standings/i })
  const bodyRows = within(table).getAllByRole('row').slice(1)
  expect(bodyRows.map((row) => row.classList.contains('advancing'))).toEqual([true, true, false])
  expect(screen.getByText('Top 2 advance to the playoffs')).toBeInTheDocument()
})

test('shows a loading placeholder, not an empty table, until the standings arrive', () => {
  vi.spyOn(api, 'getPoolStandings').mockReturnValue(new Promise(() => {}))

  render(<PoolStandings poolId={1} />)

  expect(screen.getByRole('status', { name: 'Loading standings' })).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

const sevenTeams = Array.from({ length: 7 }, (_, index) => ({
  team_id: 20 + index,
  name: `Team ${index + 1}`,
  played: 6,
  wins: 6 - index,
  losses: index,
  points: 3 * (6 - index),
  points_for: 100 - index,
  point_diff: 20 - index,
  rank: index + 1,
}))

test('an automatic setting marks the top places, the pool split evenly over the brackets', async () => {
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue(sevenTeams)

  render(<PoolStandings poolId={1} advancing={null} bracketCount={2} />)

  const table = await screen.findByRole('table', { name: /standings/i })
  const marked = within(table)
    .getAllByRole('row')
    .slice(1)
    .filter((row) => row.className === 'advancing')
  expect(marked).toHaveLength(3)
  expect(screen.getByText('Top 3 advance to the playoffs')).toBeInTheDocument()
})

test('an automatic setting marks at least one place, even for a small pool', async () => {
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue(standings)

  render(<PoolStandings poolId={1} advancing={null} bracketCount={5} />)

  expect(await screen.findByText('Top 1 advance to the playoffs')).toBeInTheDocument()
})

test('a number of places wins over the automatic split, and 0 marks nothing', async () => {
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue(sevenTeams)

  const { rerender } = render(<PoolStandings poolId={1} advancing={2} bracketCount={2} />)
  expect(await screen.findByText('Top 2 advance to the playoffs')).toBeInTheDocument()

  rerender(<PoolStandings poolId={1} advancing={0} bracketCount={2} />)
  expect(screen.queryByText(/advance to the playoffs/)).not.toBeInTheDocument()
})
