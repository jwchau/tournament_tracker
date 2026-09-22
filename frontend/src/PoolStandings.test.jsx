import { render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PoolStandings from './PoolStandings'

afterEach(() => {
  vi.restoreAllMocks()
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
