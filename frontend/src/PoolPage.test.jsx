import { act, fireEvent, render, screen } from './testUtils'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { NotificationProvider } from './NotificationContext'
import PoolPage from './PoolPage'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderAt(poolId) {
  return render(
    <MemoryRouter initialEntries={[`/pools/${poolId}`]}>
      <NotificationProvider>
        <Routes>
          <Route path="/pools/:poolId" element={<PoolPage />} />
          <Route path="/tournaments/:tournamentId" element={<h2>Tournament page</h2>} />
        </Routes>
      </NotificationProvider>
    </MemoryRouter>,
  )
}

function mockPoolA() {
  vi.spyOn(api, 'getPool').mockResolvedValue({ id: 7, tournament_id: 3, name: 'Pool A', courts: [1] })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([])
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue([])
}

test('deleting the pool asks first, then returns to the tournament', async () => {
  mockPoolA()
  const deletePool = vi.spyOn(api, 'deletePool').mockResolvedValue(undefined)

  renderAt(7)

  fireEvent.click(await screen.findByRole('button', { name: /delete pool/i }))
  expect(screen.getByRole('dialog', { name: /delete pool/i })).toHaveTextContent(/Pool A/)
  expect(deletePool).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

  expect(await screen.findByText('Tournament page')).toBeInTheDocument()
  expect(deletePool).toHaveBeenCalledWith(7)
})

test('a pool that cannot be deleted says why and stays open', async () => {
  mockPoolA()
  vi.spyOn(api, 'deletePool').mockRejectedValue({
    json: () => Promise.resolve({ detail: "this pool has scored matches and can't be deleted" }),
  })

  renderAt(7)

  fireEvent.click(await screen.findByRole('button', { name: /delete pool/i }))
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/scored matches/)
  expect(screen.getByRole('heading', { name: 'Pool A' })).toBeInTheDocument()
})

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
  // Standings mount once the first matches arrive, so wait for them too.
  expect(await screen.findByRole('table', { name: /standings/i })).toBeInTheDocument()
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

test('standings are refetched only when the polled matches change', async () => {
  vi.useFakeTimers()
  const unplayed = {
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
  }
  const scored = { ...unplayed, team1_score: 21, team2_score: 15, status: 'complete', version: 2 }
  vi.spyOn(api, 'getPool').mockResolvedValue({ id: 7, tournament_id: 3, name: 'Pool A', courts: [1] })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  const getPoolMatches = vi.spyOn(api, 'getPoolMatches').mockResolvedValue([unplayed])
  const getPoolStandings = vi.spyOn(api, 'getPoolStandings').mockResolvedValue([])
  const settle = () => act(() => vi.advanceTimersByTimeAsync(0))

  renderAt(7)
  await settle()
  await settle()
  expect(getPoolStandings).toHaveBeenCalledTimes(1)

  // Two polls with nothing new: matches are fetched, standings are not.
  await act(() => vi.advanceTimersByTimeAsync(20000))
  expect(getPoolMatches).toHaveBeenCalledTimes(3)
  expect(getPoolStandings).toHaveBeenCalledTimes(1)

  // A score came in elsewhere: the next poll sees it and standings follow.
  getPoolMatches.mockResolvedValue([scored])
  await act(() => vi.advanceTimersByTimeAsync(10000))
  await settle()
  expect(getPoolStandings).toHaveBeenCalledTimes(2)
})

test('signed out, the pool shows standings and schedule but no controls', async () => {
  vi.spyOn(api, 'getPool').mockResolvedValue({ id: 7, tournament_id: 3, name: 'Pool A', courts: [1] })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, name: 'Spikers', pool_id: 7 },
    { id: 11, name: 'Diggers', pool_id: 7 },
  ])
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([
    {
      id: 1, bracket: 'pool', pool_id: 7, round: 1, position: 1, court: 1, team1_id: 10,
      team2_id: 11, team1_score: null, team2_score: null, status: 'ready', version: 1,
    },
  ])
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue([])

  render(
    <MemoryRouter initialEntries={['/pools/7']}>
      <NotificationProvider>
        <Routes>
          <Route path="/pools/:poolId" element={<PoolPage />} />
        </Routes>
      </NotificationProvider>
    </MemoryRouter>,
    { user: null },
  )

  expect(await screen.findByText('Court 1: Spikers vs Diggers')).toBeInTheDocument()
  // The standings load separately from the schedule, so wait for their button.
  await screen.findByRole('button', { name: 'Refresh standings' })
  // Only refreshing, which changes nothing on the server.
  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Refresh standings',
  ])
})

test('signed out, an unscheduled pool has no generate button', async () => {
  mockPoolA()

  render(
    <MemoryRouter initialEntries={['/pools/7']}>
      <NotificationProvider>
        <Routes>
          <Route path="/pools/:poolId" element={<PoolPage />} />
        </Routes>
      </NotificationProvider>
    </MemoryRouter>,
    { user: null },
  )

  expect(await screen.findByRole('heading', { name: 'Pool A' })).toBeInTheDocument()
  // Let the schedule load: signed in, the generate button would show now.
  await act(async () => {})
  expect(screen.queryByRole('button', { name: /generate schedule/i })).not.toBeInTheDocument()
})