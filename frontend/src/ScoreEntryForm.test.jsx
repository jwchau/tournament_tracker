import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import ScoreEntryForm from './ScoreEntryForm'

afterEach(() => {
  vi.restoreAllMocks()
})

const match = { id: 7, team1_id: 1, team2_id: 2, version: 3, status: 'ready' }

test('shows a retry affordance when submitting a score hits a 409 conflict', async () => {
  vi.spyOn(api, 'submitScore').mockRejectedValue({ status: 409 })
  vi.spyOn(api, 'getMatch').mockResolvedValue({ ...match, version: 4 })

  render(<ScoreEntryForm match={match} />)

  fireEvent.change(screen.getByLabelText(/team 1 score/i), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText(/team 2 score/i), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  expect(await screen.findByText(/version conflict/i)).toBeInTheDocument()
  const retryButton = screen.getByRole('button', { name: /refetch/i })

  fireEvent.click(retryButton)

  await waitFor(() => expect(api.getMatch).toHaveBeenCalledWith(7))
  expect(screen.queryByText(/version conflict/i)).not.toBeInTheDocument()
})

test('shows an error message when submitting a score fails for a non-conflict reason', async () => {
  vi.spyOn(api, 'submitScore').mockRejectedValue({ status: 400 })

  render(<ScoreEntryForm match={match} />)

  fireEvent.change(screen.getByLabelText(/team 1 score/i), { target: { value: '15' } })
  fireEvent.change(screen.getByLabelText(/team 2 score/i), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  expect(await screen.findByText(/couldn.t submit/i)).toBeInTheDocument()
})

test('picks up a newer match version when the match prop changes externally', async () => {
  vi.spyOn(api, 'submitScore').mockResolvedValue({ ...match, version: 5, status: 'complete' })

  const { rerender } = render(<ScoreEntryForm match={match} />)

  expect(screen.getByText('Version: 3')).toBeInTheDocument()

  rerender(<ScoreEntryForm match={{ ...match, version: 4 }} />)

  expect(await screen.findByText('Version: 4')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/team 1 score/i), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText(/team 2 score/i), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  await waitFor(() =>
    expect(api.submitScore).toHaveBeenCalledWith(7, expect.objectContaining({ version: 4 })),
  )
})

test('does not submit while a score field is left blank', async () => {
  vi.spyOn(api, 'submitScore').mockResolvedValue({ ...match, version: 4 })

  render(<ScoreEntryForm match={match} />)

  fireEvent.change(screen.getByLabelText(/team 1 score/i), { target: { value: '21' } })
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  expect(api.submitScore).not.toHaveBeenCalled()
})
