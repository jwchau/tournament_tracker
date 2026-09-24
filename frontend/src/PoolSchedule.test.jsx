import { fireEvent, render, screen, waitFor, within } from './testUtils'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PoolSchedule from './PoolSchedule'

afterEach(() => {
  vi.restoreAllMocks()
})

const pool = { id: 1, name: 'Pool A', courts: [1] }

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

test('lists each slot with its court, teams, score, and who is idle', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(<PoolSchedule pool={pool} teams={teams} />)

  const firstSlot = (await screen.findByText('Slot 1')).closest('li')
  expect(within(firstSlot).getByText('Court 1: Spikers vs Diggers — 21–15')).toBeInTheDocument()
  expect(within(firstSlot).getByText('Observing: Blockers')).toBeInTheDocument()
  expect(screen.queryByText(/Elsewhere/)).not.toBeInTheDocument()
  // Score entry for the two unfinished matches, reusing the existing form.
  expect(screen.getAllByRole('button', { name: /submit score/i })).toHaveLength(2)
})

test('splits idle teams evenly between observing and resting', async () => {
  const bigPool = [10, 11, 12, 13, 14].map((id) => ({ id, name: `T${id}`, pool_id: 1 }))
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([poolMatch(1, 1, 10, 11)])

  render(<PoolSchedule pool={pool} teams={bigPool} />)

  expect(await screen.findByText('Observing: T12, T13')).toBeInTheDocument()
  expect(screen.getByText('Resting: T14')).toBeInTheDocument()
})

test('generates the schedule using the tournament setting for games per pairing', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([])
  const generate = vi.spyOn(api, 'generatePoolSchedule').mockResolvedValue(schedule)

  render(<PoolSchedule pool={pool} teams={teams} />)

  fireEvent.click(await screen.findByRole('button', { name: /generate schedule/i }))

  await waitFor(() => expect(generate).toHaveBeenCalledWith(1))
  expect(await screen.findByText('Slot 3')).toBeInTheDocument()
  expect(screen.queryByLabelText(/games per pairing/i)).not.toBeInTheDocument()
})

test('shows why generating the schedule was refused', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([])
  vi.spyOn(api, 'generatePoolSchedule').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'a pool needs at least 2 teams' }),
  })

  render(<PoolSchedule pool={pool} teams={teams} />)
  fireEvent.click(await screen.findByRole('button', { name: /generate schedule/i }))

  expect(await screen.findByText('a pool needs at least 2 teams')).toBeInTheDocument()
})

test('does not offer to generate a schedule once the pool has one', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(<PoolSchedule pool={pool} teams={teams} />)

  await screen.findByText('Slot 1')
  expect(screen.queryByRole('button', { name: /generate schedule/i })).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/games per pairing/i)).not.toBeInTheDocument()
})
