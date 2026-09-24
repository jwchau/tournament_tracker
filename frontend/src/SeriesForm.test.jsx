import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import SeriesForm from './SeriesForm'

afterEach(() => {
  vi.restoreAllMocks()
})

const series = {
  id: 7,
  team1_id: 10,
  team2_id: 20,
  team1_score: 1,
  team2_score: 0,
  status: 'in_progress',
  version: 4,
}

function renderForm(props = {}) {
  return render(
    <SeriesForm match={series} bestOf={3} team1Name="Aces" team2Name="Blockers" {...props} />,
  )
}

test('lists the games so far and records the next one', async () => {
  vi.spyOn(api, 'listGames')
    .mockResolvedValueOnce([{ number: 1, team1_score: 21, team2_score: 15 }])
    .mockResolvedValue([
      { number: 1, team1_score: 21, team2_score: 15 },
      { number: 2, team1_score: 18, team2_score: 21 },
    ])
  const addGame = vi.spyOn(api, 'addGame').mockResolvedValue({ number: 2 })
  const updated = { ...series, team2_score: 1, version: 5 }
  vi.spyOn(api, 'getMatch').mockResolvedValue(updated)
  const onScored = vi.fn()

  renderForm({ onScored })

  expect(await screen.findByText('Aces vs Blockers · best of 3 · 1–0')).toBeInTheDocument()
  expect(screen.getByText('Game 1: 21–15')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Game 2 Aces score'), { target: { value: '18' } })
  fireEvent.change(screen.getByLabelText('Game 2 Blockers score'), { target: { value: '21' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record game 2' }))

  await waitFor(() =>
    expect(addGame).toHaveBeenCalledWith(7, { team1Score: 18, team2Score: 21, version: 4 }),
  )
  expect(await screen.findByText('Game 2: 18–21')).toBeInTheDocument()
  expect(onScored).toHaveBeenCalledWith(updated)
})

test('a game being recorded cannot be sent twice', async () => {
  vi.spyOn(api, 'listGames').mockResolvedValue([{ number: 1, team1_score: 21, team2_score: 15 }])
  let finish
  const addGame = vi
    .spyOn(api, 'addGame')
    .mockReturnValue(new Promise((resolve) => (finish = resolve)))
  vi.spyOn(api, 'getMatch').mockResolvedValue({ ...series, team2_score: 1, version: 5 })

  renderForm()

  fireEvent.change(await screen.findByLabelText('Game 2 Aces score'), { target: { value: '18' } })
  fireEvent.change(screen.getByLabelText('Game 2 Blockers score'), { target: { value: '21' } })
  const form = screen.getByRole('button', { name: 'Record game 2' }).closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)

  expect(addGame).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()

  finish({ number: 2 })

  expect(await screen.findByText(/best of 3 · 1–1/)).toBeInTheDocument()
})

test('a recorded game can be fixed while the series is unfinished', async () => {
  vi.spyOn(api, 'listGames').mockResolvedValue([{ number: 1, team1_score: 21, team2_score: 15 }])
  const editGame = vi.spyOn(api, 'editGame').mockResolvedValue({ number: 1 })
  vi.spyOn(api, 'getMatch').mockResolvedValue({ ...series, version: 5 })

  renderForm()

  const game = await screen.findByText('Game 1: 21–15')
  fireEvent.click(within(game.closest('li')).getByRole('button', { name: 'Fix game 1' }))
  fireEvent.change(screen.getByLabelText('Game 1 Aces score'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Game 1 Blockers score'), { target: { value: '19' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save game 1' }))

  await waitFor(() =>
    expect(editGame).toHaveBeenCalledWith(7, 1, { team1Score: 21, team2Score: 19, version: 4 }),
  )
})

test('a version conflict offers to refetch instead of overwriting', async () => {
  vi.spyOn(api, 'listGames').mockResolvedValue([])
  vi.spyOn(api, 'addGame').mockRejectedValue({ status: 409 })

  renderForm({ match: { ...series, team1_score: 0 } })

  fireEvent.change(await screen.findByLabelText('Game 1 Aces score'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Game 1 Blockers score'), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record game 1' }))

  expect(await screen.findByText(/updated elsewhere/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /refetch latest/i })).toBeInTheDocument()
})
