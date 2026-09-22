import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import CorrectionForm from './CorrectionForm'

afterEach(() => {
  vi.restoreAllMocks()
})

const match = {
  id: 7,
  team1_id: 1,
  team2_id: 2,
  team1_score: 21,
  team2_score: 10,
  winner_id: 1,
  version: 3,
  status: 'complete',
}

const resetMatches = [
  { id: 9, round: 2, position: 1 },
  { id: 11, round: 3, position: 1 },
]

function enterCorrection(team1Score, team2Score) {
  fireEvent.click(screen.getByRole('button', { name: /correct/i }))
  fireEvent.change(screen.getByLabelText('Spikers score'), { target: { value: team1Score } })
  fireEvent.change(screen.getByLabelText('Diggers score'), { target: { value: team2Score } })
  fireEvent.click(screen.getByRole('button', { name: /review correction/i }))
}

test('previews how many matches a correction will reset before committing it', async () => {
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: resetMatches })
  const correctScore = vi
    .spyOn(api, 'correctScore')
    .mockResolvedValue({ match: { ...match, winner_id: 2 }, reset_matches: resetMatches })
  const onCorrected = vi.fn()

  render(
    <CorrectionForm
      match={match}
      team1Name="Spikers"
      team2Name="Diggers"
      onCorrected={onCorrected}
    />,
  )
  enterCorrection('10', '21')

  const dialog = await screen.findByRole('dialog')
  expect(api.previewCorrection).toHaveBeenCalledWith(7, { team1Score: 10, team2Score: 21 })
  expect(within(dialog).getByText(/this will reset 2 matches/i)).toBeInTheDocument()
  expect(within(dialog).getByText(/round 2 match 1/i)).toBeInTheDocument()
  expect(within(dialog).getByText(/round 3 match 1/i)).toBeInTheDocument()
  expect(correctScore).not.toHaveBeenCalled()

  fireEvent.click(within(dialog).getByRole('button', { name: /apply correction/i }))

  await waitFor(() =>
    expect(correctScore).toHaveBeenCalledWith(7, { team1Score: 10, team2Score: 21, version: 3 }),
  )
  expect(onCorrected).toHaveBeenCalledWith({
    match: { ...match, winner_id: 2 },
    reset_matches: resetMatches,
  })
})

test('says nothing else is reset when the winner does not change', async () => {
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: [] })

  render(<CorrectionForm match={match} team1Name="Spikers" team2Name="Diggers" />)
  enterCorrection('25', '23')

  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/no other matches will be reset/i)).toBeInTheDocument()
})

test('cancelling the confirmation does not submit the correction', async () => {
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: resetMatches })
  const correctScore = vi.spyOn(api, 'correctScore')

  render(<CorrectionForm match={match} team1Name="Spikers" team2Name="Diggers" />)
  enterCorrection('10', '21')

  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /cancel/i }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(correctScore).not.toHaveBeenCalled()
})

test('shows a conflict message when the match changed before the correction was applied', async () => {
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: resetMatches })
  vi.spyOn(api, 'correctScore').mockRejectedValue({ status: 409 })

  render(<CorrectionForm match={match} team1Name="Spikers" team2Name="Diggers" />)
  enterCorrection('10', '21')
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: /apply correction/i }),
  )

  expect(await screen.findByText(/updated elsewhere/i)).toBeInTheDocument()
})
