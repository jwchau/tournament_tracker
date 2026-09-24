import { fireEvent, render as rtlRender, screen, waitFor } from './testUtils'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PoolsPanel from './PoolsPanel'

afterEach(() => {
  vi.restoreAllMocks()
})

function render(ui) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>)
}

const pools = [
  { id: 1, tournament_id: 5, name: 'Pool A', courts: [1, 2] },
  { id: 2, tournament_id: 5, name: 'Pool B', courts: [3] },
]

const teams = [
  { id: 10, name: 'Spikers', seed: 1, pool_id: 1, player_count: 2 },
  { id: 11, name: 'Diggers', seed: 2, pool_id: null, player_count: 2 },
]

test('lists pools with their courts', async () => {
  vi.spyOn(api, 'listPools').mockResolvedValue(pools)

  render(<PoolsPanel tournamentId={5} teams={teams} />)

  expect(await screen.findByText('Pool A — courts 1, 2')).toBeInTheDocument()
  expect(screen.getByText('Pool B — court 3')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Pool A' })).toHaveAttribute('href', '/pools/1')
})

test('warns when a pool has no court', async () => {
  vi.spyOn(api, 'listPools').mockResolvedValue([{ ...pools[1], courts: [] }])

  render(<PoolsPanel tournamentId={5} teams={teams} />)

  expect(await screen.findByText('Pool B — no court (add courts in settings)')).toBeInTheDocument()
})

test('adds a pool and reloads the list', async () => {
  const listPools = vi.spyOn(api, 'listPools').mockResolvedValue([])
  const createPool = vi.spyOn(api, 'createPool').mockResolvedValue(pools[0])

  render(<PoolsPanel tournamentId={5} teams={teams} />)

  fireEvent.change(screen.getByLabelText(/new pool name/i), { target: { value: 'Pool A' } })
  fireEvent.click(screen.getByRole('button', { name: /add pool/i }))

  await waitFor(() => expect(createPool).toHaveBeenCalledWith(5, { name: 'Pool A' }))
  await waitFor(() => expect(listPools).toHaveBeenCalledTimes(2))
})

test('auto-assign snake-seeds teams and reports the new assignments', async () => {
  vi.spyOn(api, 'listPools').mockResolvedValue(pools)
  const assigned = teams.map((team) => ({ ...team, pool_id: 1 }))
  const autoAssign = vi.spyOn(api, 'autoAssignPools').mockResolvedValue(assigned)
  const onTeamsChanged = vi.fn()

  render(<PoolsPanel tournamentId={5} teams={teams} onTeamsChanged={onTeamsChanged} />)
  fireEvent.click(await screen.findByRole('button', { name: /auto-assign/i }))

  await waitFor(() => expect(autoAssign).toHaveBeenCalledWith(5))
  expect(onTeamsChanged).toHaveBeenCalledWith(assigned)
})

test('auto-assign works with no pools yet and shows the pools it created', async () => {
  const listPools = vi.spyOn(api, 'listPools').mockResolvedValueOnce([]).mockResolvedValue(pools)
  vi.spyOn(api, 'autoAssignPools').mockResolvedValue(teams)
  const onPoolsChanged = vi.fn()

  render(<PoolsPanel tournamentId={5} teams={teams} onPoolsChanged={onPoolsChanged} />)
  fireEvent.click(await screen.findByRole('button', { name: /auto-assign/i }))

  expect(await screen.findByText('Pool A — courts 1, 2')).toBeInTheDocument()
  expect(listPools).toHaveBeenCalledTimes(2)
  expect(onPoolsChanged).toHaveBeenLastCalledWith(pools)
})

test('moves a team to another pool by hand', async () => {
  vi.spyOn(api, 'listPools').mockResolvedValue(pools)
  const updateTeam = vi
    .spyOn(api, 'updateTeam')
    .mockResolvedValue({ ...teams[1], pool_id: 2 })
  const onTeamsChanged = vi.fn()

  render(<PoolsPanel tournamentId={5} teams={teams} onTeamsChanged={onTeamsChanged} />)

  const select = await screen.findByLabelText('Pool for Diggers')
  expect(select).toHaveValue('')
  fireEvent.change(select, { target: { value: '2' } })

  await waitFor(() => expect(updateTeam).toHaveBeenCalledWith(11, { poolId: 2 }))
  expect(onTeamsChanged).toHaveBeenCalledWith([teams[0], { ...teams[1], pool_id: 2 }])
})
