import { act, fireEvent, render, screen, within } from './testUtils'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import CourtPage from './CourtPage'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderAt(path, options) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tournaments/:tournamentId/courts/:court" element={<CourtPage />} />
        <Route path="/tournaments/:tournamentId/courts" element={<h2>All courts</h2>} />
      </Routes>
    </MemoryRouter>,
    options,
  )
}

function courtMatch(id, team1Name, team2Name, fields = {}) {
  return {
    id,
    bracket: 'pool',
    round: id,
    position: 1,
    pool_id: 7,
    playoff_bracket_id: null,
    team1_id: id * 10,
    team2_id: id * 10 + 1,
    team1_name: team1Name,
    team2_name: team2Name,
    team1_score: null,
    team2_score: null,
    status: 'ready',
    court: 2,
    scheduled_time: null,
    best_of: 1,
    version: 1,
    ...fields,
  }
}

const first = courtMatch(1, 'Spikers', 'Diggers')
const second = courtMatch(2, 'Blockers', 'Setters')
const third = courtMatch(3, 'Servers', 'Liberos')

function courts(courtTwo) {
  return [
    { court: 1, use: 'pool', label: 'Pool A', current: null, up_next: [] },
    { court: 2, use: 'pool', label: 'Pool A', ...courtTwo },
  ]
}

const playing = courts({ current: first, up_next: [second, third] })
const movedOn = courts({ current: second, up_next: [third] })

test("shows the court's current match with its score form and the matches after it", async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)

  renderAt('/tournaments/3/courts/2')

  expect(await screen.findByRole('heading', { name: 'Court 2' })).toBeInTheDocument()
  expect(screen.getByText('Pool A')).toBeInTheDocument()
  const now = screen.getByRole('region', { name: 'Now playing' })
  expect(within(now).getByLabelText('Spikers score')).toBeInTheDocument()
  expect(within(now).getByRole('button', { name: /submit score/i })).toBeInTheDocument()
  const next = screen.getByRole('region', { name: 'Up next' })
  expect(within(next).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Blockers vs Setters',
    'Servers vs Liberos',
  ])
  expect(screen.getByRole('link', { name: /all courts/i })).toHaveAttribute(
    'href',
    '/tournaments/3/courts',
  )
})

test('a best-of match is scored game by game', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(
    courts({ current: { ...first, bracket: 'winners', best_of: 3 }, up_next: [] }),
  )
  vi.spyOn(api, 'listGames').mockResolvedValue([])

  renderAt('/tournaments/3/courts/2')

  expect(await screen.findByRole('button', { name: 'Record game 1' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /submit score/i })).not.toBeInTheDocument()
})

test('completing the match brings on the next one', async () => {
  const listCourts = vi.spyOn(api, 'listCourts').mockResolvedValue(playing)
  vi.spyOn(api, 'submitScore').mockImplementation(async () => {
    listCourts.mockResolvedValue(movedOn)
    return { ...first, team1_score: 21, team2_score: 15, status: 'complete', version: 2 }
  })

  renderAt('/tournaments/3/courts/2')

  fireEvent.change(await screen.findByLabelText('Spikers score'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Diggers score'), { target: { value: '15' } })
  fireEvent.click(screen.getByLabelText(/complete match/i))
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  expect(await screen.findByLabelText('Blockers score')).toHaveValue(null)
  expect(screen.queryByLabelText('Spikers score')).not.toBeInTheDocument()
})

test('a match finished on another device is replaced after the next poll', async () => {
  vi.useFakeTimers()
  const listCourts = vi.spyOn(api, 'listCourts').mockResolvedValue(playing)

  renderAt('/tournaments/3/courts/2')
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(screen.getByLabelText('Spikers score')).toBeInTheDocument()

  listCourts.mockResolvedValue(movedOn)
  await act(() => vi.advanceTimersByTimeAsync(10000))

  expect(screen.getByLabelText('Blockers score')).toBeInTheDocument()
  expect(screen.queryByLabelText('Spikers score')).not.toBeInTheDocument()
})

test('a version conflict offers to refetch the match', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)
  vi.spyOn(api, 'submitScore').mockRejectedValue({ status: 409 })

  renderAt('/tournaments/3/courts/2')

  fireEvent.change(await screen.findByLabelText('Spikers score'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Diggers score'), { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  expect(await screen.findByRole('button', { name: /refetch latest/i })).toBeInTheDocument()
})

test('an empty court says so', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)

  renderAt('/tournaments/3/courts/1')

  expect(await screen.findByText(/nothing left to play on this court/i)).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument()
})

test('a playoff court explains its queue is shared by the bracket', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue([
    { court: 1, use: 'playoff', label: 'Bracket 1', current: first, up_next: [second] },
  ])

  renderAt('/tournaments/3/courts/1')

  expect(await screen.findByText(/next free bracket 1 court/i)).toBeInTheDocument()
})

test('a court the tournament does not have is not found', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)

  renderAt('/tournaments/3/courts/9')

  expect(await screen.findByRole('heading', { name: 'Court not found' })).toBeInTheDocument()
})

test('signed out, the court shows its match without a score form', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)

  renderAt('/tournaments/1/courts/2', { user: null })

  const nowPlaying = await screen.findByRole('region', { name: 'Now playing' })
  expect(nowPlaying).toHaveTextContent('Spikers vs Diggers')
  expect(screen.queryByLabelText('Spikers score')).not.toBeInTheDocument()
  expect(within(nowPlaying).getByRole('link', { name: /sign in/i })).toHaveAttribute(
    'href',
    '/login?next=%2Ftournaments%2F1%2Fcourts%2F2',
  )
})

test('a court lent to a bracket without courts says so, without changing where its queue goes', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue([
    {
      court: 1,
      use: 'playoff',
      label: 'Bracket 1',
      now_playing: 'Bracket 2',
      current: first,
      up_next: [second],
    },
  ])

  renderAt('/tournaments/3/courts/1')

  expect(await screen.findByText('Bracket 1 · now playing Bracket 2')).toBeInTheDocument()
  expect(screen.getByText(/next free Bracket 1 court/)).toBeInTheDocument()
})

test('a tournament that does not exist is not found', async () => {
  vi.spyOn(api, 'listCourts').mockRejectedValue({ status: 404 })

  renderAt('/tournaments/999/courts/1')

  expect(await screen.findByRole('heading', { name: 'Tournament not found' })).toBeInTheDocument()
})
