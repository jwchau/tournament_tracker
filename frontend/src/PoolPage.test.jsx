import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PoolPage from './PoolPage'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAt(poolId) {
  return render(
    <MemoryRouter initialEntries={[`/pools/${poolId}`]}>
      <Routes>
        <Route path="/pools/:poolId" element={<PoolPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('shows the pool with its courts, schedule, standings, and a link back', async () => {
  vi.spyOn(api, 'getPool').mockResolvedValue({
    id: 7,
    tournament_id: 3,
    name: 'Pool A',
    courts: [1, 2],
  })
  const listTeams = vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, name: 'Spikers', pool_id: 7 },
    { id: 11, name: 'Diggers', pool_id: 7 },
  ])
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([
    {
      id: 1,
      pool_id: 7,
      round: 1,
      position: 1,
      court: 1,
      team1_id: 10,
      team2_id: 11,
      team1_score: null,
      team2_score: null,
      status: 'ready',
      version: 1,
    },
  ])
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue([])

  renderAt(7)

  expect(await screen.findByRole('heading', { name: 'Pool A' })).toBeInTheDocument()
  expect(screen.getByText('Courts 1, 2')).toBeInTheDocument()
  expect(await screen.findByText('Court 1: Spikers vs Diggers')).toBeInTheDocument()
  expect(screen.getByRole('table', { name: /standings/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /back to tournament/i })).toHaveAttribute(
    'href',
    '/tournaments/3',
  )
  expect(listTeams).toHaveBeenCalledWith(3)
})

test('says so when the pool does not exist', async () => {
  vi.spyOn(api, 'getPool').mockRejectedValue({ status: 404 })

  renderAt(999)

  expect(await screen.findByText(/pool not found/i)).toBeInTheDocument()
})
