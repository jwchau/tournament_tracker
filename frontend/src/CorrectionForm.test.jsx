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

test('a series is corrected game by game, sending every corrected game', async () => {
  const series = { ...match, team1_score: 2, team2_score: 0, version: 6 }
  vi.spyOn(api, 'listGames').mockResolvedValue([
    { number: 1, team1_score: 21, team2_score: 15 },
    { number: 2, team1_score: 21, team2_score: 16 },
  ])
  const preview = vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: [] })
  const correctScore = vi
    .spyOn(api, 'correctScore')
    .mockResolvedValue({ match: series, reset_matches: [] })

  render(<CorrectionForm match={series} bestOf={3} team1Name="Spikers" team2Name="Diggers" />)

  fireEvent.click(screen.getByRole('button', { name: 'Correct Spikers vs Diggers' }))
  const dialog = screen.getByRole('dialog', { name: 'Correct Spikers vs Diggers' })
  expect(await within(dialog).findByLabelText('Game 2 Diggers score')).toHaveValue(16)
  fireEvent.change(within(dialog).getByLabelText('Game 2 Spikers score'), { target: { value: '12' } })
  fireEvent.change(within(dialog).getByLabelText('Game 2 Diggers score'), { target: { value: '21' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add game' }))
  fireEvent.change(within(dialog).getByLabelText('Game 3 Spikers score'), { target: { value: '21' } })
  fireEvent.change(within(dialog).getByLabelText('Game 3 Diggers score'), { target: { value: '9' } })
  fireEvent.click(within(dialog).getByRole('button', { name: /review correction/i }))

  const games = [
    { team1Score: 21, team2Score: 15 },
    { team1Score: 12, team2Score: 21 },
    { team1Score: 21, team2Score: 9 },
  ]
  await waitFor(() => expect(preview).toHaveBeenCalledWith(7, { games }))
  fireEvent.click(await screen.findByRole('button', { name: /apply correction/i }))
  await waitFor(() => expect(correctScore).toHaveBeenCalledWith(7, { games, version: 6 }))
})

test('names losers-bracket and grand final matches in the preview', async () => {
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({
    reset_matches: [
      { id: 9, bracket: 'losers', round: 1, position: 2 },
      { id: 12, bracket: 'grand_final', round: 1, position: 1 },
      { id: 13, bracket: 'grand_final', round: 2, position: 1 },
    ],
  })

  render(<CorrectionForm match={match} team1Name="Spikers" team2Name="Diggers" />)
  enterCorrection('10', '21')

  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent(
    'This will reset 3 matches (scores cleared, teams updated): Losers round 1 match 2, Grand final, Grand final reset.',
  )
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

  const confirmation = await screen.findByRole('dialog', { name: 'Confirm score correction' })
  fireEvent.click(within(confirmation).getByRole('button', { name: /cancel/i }))

  expect(screen.queryByRole('dialog', { name: 'Confirm score correction' })).not.toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Correct Spikers vs Diggers' })).toBeInTheDocument()
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
