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

  rerender(<ScoreEntryForm match={{ ...match, version: 4 }} />)

  fireEvent.change(screen.getByLabelText(/team 1 score/i), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText(/team 2 score/i), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  await waitFor(() =>
    expect(api.submitScore).toHaveBeenCalledWith(7, expect.objectContaining({ version: 4 })),
  )
})

test('labels score fields with team names and does not display the version', () => {
  render(<ScoreEntryForm match={match} team1Name="Spikers" team2Name="Diggers" />)

  expect(screen.getByText('Spikers vs Diggers')).toBeInTheDocument()
  expect(screen.getByLabelText('Spikers score')).toBeInTheDocument()
  expect(screen.getByLabelText('Diggers score')).toBeInTheDocument()
  expect(screen.queryByText(/version/i)).not.toBeInTheDocument()
})

test('does not submit while a score field is left blank', async () => {
  vi.spyOn(api, 'submitScore').mockResolvedValue({ ...match, version: 4 })

  render(<ScoreEntryForm match={match} />)

  fireEvent.change(screen.getByLabelText(/team 1 score/i), { target: { value: '21' } })
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  expect(api.submitScore).not.toHaveBeenCalled()
})

test('each form labels its own inputs when several are on the page', () => {
  render(
    <>
      <ScoreEntryForm match={match} team1Name="Spikers" team2Name="Diggers" />
      <ScoreEntryForm match={{ ...match, id: 8 }} team1Name="Blockers" team2Name="Setters" />
    </>,
  )

  fireEvent.change(screen.getByLabelText('Blockers score'), { target: { value: '21' } })

  expect(screen.getByLabelText('Blockers score')).toHaveValue(21)
  expect(screen.getByLabelText('Spikers score')).toHaveValue(null)
  expect(screen.getAllByLabelText(/complete match/i)).toHaveLength(2)
})
