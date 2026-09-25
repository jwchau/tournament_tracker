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

test("shows the court's current match with its scoreboard and the matches after it", async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)

  renderAt('/tournaments/3/courts/2')

  expect(await screen.findByRole('heading', { name: 'Court 2' })).toBeInTheDocument()
  expect(screen.getByText('Pool A')).toBeInTheDocument()
  const now = screen.getByRole('region', { name: 'Now playing' })
  expect(within(now).getByLabelText('Spikers score')).toHaveValue(0)
  expect(within(now).getByLabelText('Diggers score')).toHaveValue(0)
  expect(within(now).getByRole('button', { name: 'Point to Spikers' })).toBeInTheDocument()
  expect(within(now).getByRole('button', { name: 'Finish match' })).toBeInTheDocument()
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
  expect(screen.getByLabelText('Game 1 Spikers score')).toHaveValue(0)
  fireEvent.click(screen.getByRole('button', { name: 'Point to Diggers' }))
  expect(screen.getByLabelText('Game 1 Diggers score')).toHaveValue(1)
  expect(screen.queryByRole('button', { name: 'Finish match' })).not.toBeInTheDocument()
})

const seriesMatch = { ...first, bracket: 'winners', best_of: 3 }

test("a series game's points are saved as its running score", async () => {
  vi.useFakeTimers()
  vi.spyOn(api, 'listCourts').mockResolvedValue(courts({ current: seriesMatch, up_next: [] }))
  let recorded = []
  vi.spyOn(api, 'listGames').mockImplementation(async () => recorded)
  const saveGameInPlay = vi
    .spyOn(api, 'saveGameInPlay')
    .mockImplementation(async (id, { team1Score, team2Score, version }) => ({
      ...seriesMatch,
      game_team1_score: team1Score,
      game_team2_score: team2Score,
      status: 'in_progress',
      version: version + 1,
    }))
  const addGame = vi.spyOn(api, 'addGame').mockImplementation(async () => {
    recorded = [{ number: 1, team1_score: 2, team2_score: 0 }]
    return recorded[0]
  })
  vi.spyOn(api, 'getMatch').mockResolvedValue({ ...seriesMatch, team1_score: 1, version: 3 })

  renderAt('/tournaments/3/courts/2')
  await act(() => vi.advanceTimersByTimeAsync(0))

  fireEvent.click(screen.getByRole('button', { name: 'Point to Spikers' }))
  fireEvent.click(screen.getByRole('button', { name: 'Point to Spikers' }))
  await act(() => vi.advanceTimersByTimeAsync(1000))

  expect(saveGameInPlay).toHaveBeenCalledTimes(1)
  expect(saveGameInPlay).toHaveBeenCalledWith(1, { team1Score: 2, team2Score: 0, version: 1 })
  expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Saved')

  // Recording the game uses the version the last save returned, then starts the next game at 0–0.
  fireEvent.click(screen.getByRole('button', { name: 'Record game 1' }))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(addGame).toHaveBeenCalledWith(1, { team1Score: 2, team2Score: 0, version: 2 })
  expect(screen.getByLabelText('Game 2 Spikers score')).toHaveValue(0)
})

test('a series already under way shows the game in play', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(
    courts({
      current: {
        ...seriesMatch,
        team1_score: 1,
        team2_score: 0,
        game_team1_score: 11,
        game_team2_score: 13,
        status: 'in_progress',
      },
      up_next: [],
    }),
  )
  vi.spyOn(api, 'listGames').mockResolvedValue([{ number: 1, team1_score: 21, team2_score: 15 }])

  renderAt('/tournaments/3/courts/2')

  expect(await screen.findByLabelText('Game 2 Spikers score')).toHaveValue(11)
  expect(screen.getByLabelText('Game 2 Diggers score')).toHaveValue(13)
})

test('signed out, a series shows the game in play and the games won', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(
    courts({
      current: {
        ...seriesMatch,
        team1_score: 1,
        team2_score: 0,
        game_team1_score: 11,
        game_team2_score: 13,
      },
      up_next: [],
    }),
  )

  renderAt('/tournaments/1/courts/2', { user: null })

  const nowPlaying = await screen.findByRole('region', { name: 'Now playing' })
  expect(within(nowPlaying).getByRole('group', { name: 'Spikers, 11' })).toBeInTheDocument()
  expect(within(nowPlaying).getByRole('group', { name: 'Diggers, 13' })).toBeInTheDocument()
  expect(nowPlaying).toHaveTextContent('Best of 3 · games 1–0')
})

test('each point is saved as the running score', async () => {
  vi.useFakeTimers()
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)
  const submitScore = vi
    .spyOn(api, 'submitScore')
    .mockImplementation(async (id, { team1Score, team2Score, version }) => ({
      ...first,
      team1_score: team1Score,
      team2_score: team2Score,
      status: 'in_progress',
      version: version + 1,
    }))

  renderAt('/tournaments/3/courts/2')
  await act(() => vi.advanceTimersByTimeAsync(0))

  fireEvent.click(screen.getByRole('button', { name: 'Point to Spikers' }))
  fireEvent.click(screen.getByRole('button', { name: 'Point to Spikers' }))
  fireEvent.click(screen.getByRole('button', { name: 'Point to Diggers' }))
  fireEvent.click(screen.getByRole('button', { name: 'Take a point from Spikers' }))
  expect(screen.getByLabelText('Spikers score')).toHaveValue(1)
  expect(screen.getByLabelText('Diggers score')).toHaveValue(1)

  await act(() => vi.advanceTimersByTimeAsync(1000))

  // Quick taps are sent together, as one running score.
  expect(submitScore).toHaveBeenCalledTimes(1)
  expect(submitScore).toHaveBeenCalledWith(1, {
    team1Score: 1,
    team2Score: 1,
    version: 1,
    complete: false,
  })
  expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Saved')

  // The next point is sent with the version the last save returned.
  fireEvent.click(screen.getByRole('button', { name: 'Point to Diggers' }))
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(submitScore).toHaveBeenLastCalledWith(1, {
    team1Score: 1,
    team2Score: 2,
    version: 2,
    complete: false,
  })
})

test('swapping sides puts the second team on the left, and the court remembers it', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)
  const pointButtons = () =>
    screen.getAllByRole('button', { name: /^Point to / }).map((button) => button.getAttribute('aria-label'))

  const { unmount } = renderAt('/tournaments/3/courts/2')
  const swap = await screen.findByRole('button', { name: 'Swap sides' })
  expect(swap).toHaveAttribute('aria-pressed', 'false')
  expect(pointButtons()).toEqual(['Point to Spikers', 'Point to Diggers'])

  fireEvent.click(swap)
  expect(swap).toHaveAttribute('aria-pressed', 'true')
  expect(pointButtons()).toEqual(['Point to Diggers', 'Point to Spikers'])

  // Scores stay with their teams.
  fireEvent.click(screen.getByRole('button', { name: 'Point to Diggers' }))
  expect(screen.getByLabelText('Diggers score')).toHaveValue(1)
  expect(screen.getByLabelText('Spikers score')).toHaveValue(0)

  unmount()
  renderAt('/tournaments/3/courts/2')
  expect(await screen.findByRole('button', { name: 'Swap sides' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(pointButtons()).toEqual(['Point to Diggers', 'Point to Spikers'])
  localStorage.clear()
})

test('a score never goes below zero', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)

  renderAt('/tournaments/3/courts/2')

  expect(await screen.findByRole('button', { name: 'Take a point from Spikers' })).toBeDisabled()
})

test('a match already under way shows its running score', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(
    courts({
      current: { ...first, team1_score: 14, team2_score: 9, status: 'in_progress', version: 5 },
      up_next: [],
    }),
  )

  renderAt('/tournaments/3/courts/2')

  expect(await screen.findByLabelText('Spikers score')).toHaveValue(14)
  expect(screen.getByLabelText('Diggers score')).toHaveValue(9)
})

test('finishing the match asks first, then brings on the next one', async () => {
  const listCourts = vi.spyOn(api, 'listCourts').mockResolvedValue(playing)
  const submitScore = vi.spyOn(api, 'submitScore').mockImplementation(async () => {
    listCourts.mockResolvedValue(movedOn)
    return { ...first, team1_score: 21, team2_score: 15, status: 'complete', version: 2 }
  })

  renderAt('/tournaments/3/courts/2')

  fireEvent.change(await screen.findByLabelText('Spikers score'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Diggers score'), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Finish match' }))

  const dialog = screen.getByRole('dialog', { name: 'Finish match' })
  expect(dialog).toHaveTextContent('Spikers 21, Diggers 15')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Finish' }))

  expect(await screen.findByLabelText('Blockers score')).toHaveValue(0)
  expect(submitScore).toHaveBeenCalledWith(1, {
    team1Score: 21,
    team2Score: 15,
    version: 1,
    complete: true,
  })
  expect(screen.queryByLabelText('Spikers score')).not.toBeInTheDocument()
})

test('a tied match cannot be finished', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)

  renderAt('/tournaments/3/courts/2')

  expect(await screen.findByRole('button', { name: 'Finish match' })).toBeDisabled()
})

test('a failed save says so and can be tried again', async () => {
  vi.useFakeTimers()
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)
  const submitScore = vi
    .spyOn(api, 'submitScore')
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce({ ...first, team1_score: 1, team2_score: 0, version: 2 })

  renderAt('/tournaments/3/courts/2')
  await act(() => vi.advanceTimersByTimeAsync(0))

  fireEvent.click(screen.getByRole('button', { name: 'Point to Spikers' }))
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent(/couldn.t save/i)

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(submitScore).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Saved')
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

test('shows a loading placeholder until the first poll, and later polls keep the match on screen', async () => {
  vi.useFakeTimers()
  let resolveFirst
  const listCourts = vi
    .spyOn(api, 'listCourts')
    .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))

  renderAt('/tournaments/3/courts/2')
  expect(screen.getByRole('status', { name: 'Loading court' })).toBeInTheDocument()

  resolveFirst(playing)
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(screen.getByLabelText('Spikers score')).toBeInTheDocument()

  // The next poll is slow, then fails: the match stays, with no placeholder.
  let rejectSecond
  listCourts.mockReturnValueOnce(new Promise((_, reject) => (rejectSecond = reject)))
  await act(() => vi.advanceTimersByTimeAsync(10000))
  expect(screen.getByLabelText('Spikers score')).toBeInTheDocument()
  expect(screen.queryByRole('status', { name: 'Loading court' })).not.toBeInTheDocument()

  rejectSecond(new TypeError('Failed to fetch'))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(screen.getByLabelText('Spikers score')).toBeInTheDocument()
})

test('a version conflict offers to load the other score', async () => {
  vi.useFakeTimers()
  vi.spyOn(api, 'listCourts').mockResolvedValue(playing)
  vi.spyOn(api, 'submitScore').mockRejectedValue({ status: 409 })
  vi.spyOn(api, 'getMatch').mockResolvedValue({
    ...first,
    team1_score: 12,
    team2_score: 8,
    status: 'in_progress',
    version: 4,
  })

  renderAt('/tournaments/3/courts/2')
  await act(() => vi.advanceTimersByTimeAsync(0))

  fireEvent.click(screen.getByRole('button', { name: 'Point to Spikers' }))
  await act(() => vi.advanceTimersByTimeAsync(1000))

  fireEvent.click(screen.getByRole('button', { name: /refetch latest/i }))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(screen.getByLabelText('Spikers score')).toHaveValue(12)
  expect(screen.getByLabelText('Diggers score')).toHaveValue(8)
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

test('signed out, the court shows its match and score without controls', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue(
    courts({ current: { ...first, team1_score: 7, team2_score: 5 }, up_next: [] }),
  )

  renderAt('/tournaments/1/courts/2', { user: null })

  const nowPlaying = await screen.findByRole('region', { name: 'Now playing' })
  expect(nowPlaying).toHaveTextContent('Spikers vs Diggers')
  expect(within(nowPlaying).getByRole('group', { name: 'Spikers, 7' })).toBeInTheDocument()
  expect(within(nowPlaying).getByRole('group', { name: 'Diggers, 5' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Spikers score')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Point to Spikers' })).not.toBeInTheDocument()
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
