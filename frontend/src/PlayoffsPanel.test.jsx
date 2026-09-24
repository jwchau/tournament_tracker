import { fireEvent, render, screen, waitFor } from './testUtils'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { NotificationProvider } from './NotificationContext'
import PlayoffsPanel from './PlayoffsPanel'

beforeEach(() => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderPanel({ hasPools = true } = {}) {
  return render(
    <MemoryRouter>
      <NotificationProvider>
        <PlayoffsPanel tournamentId={5} teams={[]} courtCount={2} hasPools={hasPools} />
      </NotificationProvider>
    </MemoryRouter>,
  )
}

test('advancing is disabled, with the reason shown, until pool play is finished', async () => {
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({
    ready: false,
    reason: 'Pool B has incomplete matches',
  })

  renderPanel()

  expect(await screen.findByText('Pool B has incomplete matches')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /advance to playoffs/i })).toBeDisabled()
  expect(screen.queryByRole('button', { name: /generate bracket/i })).not.toBeInTheDocument()
})

const tierBrackets = [
  { id: 30, tournament_id: 5, tier: 1, format: 'double', has_scores: false },
  { id: 31, tournament_id: 5, tier: 2, format: 'double', has_scores: false },
]

test('advancing once pools are complete shows each tier bracket', async () => {
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: true, reason: null })
  const advance = vi.spyOn(api, 'advanceToPlayoffs').mockResolvedValue(tierBrackets)

  renderPanel()

  const button = await screen.findByRole('button', { name: /advance to playoffs/i })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.change(screen.getByLabelText(/playoff format/i), { target: { value: 'double' } })
  fireEvent.click(button)

  await waitFor(() => expect(advance).toHaveBeenCalledWith(5, { format: 'double' }))
  expect(await screen.findByRole('heading', { name: 'Bracket 1' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Bracket 2' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /advance to playoffs/i })).not.toBeInTheDocument()
  await waitFor(() => expect(api.getPlayoffBracketMatches).toHaveBeenCalledWith(30))
  expect(api.getPlayoffBracketMatches).toHaveBeenCalledWith(31)
})

test('a tournament without pools generates one bracket instead of advancing', async () => {
  vi.spyOn(api, 'listPlayoffBrackets')
    .mockResolvedValueOnce([])
    .mockResolvedValue([{ ...tierBrackets[0], format: 'single' }])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'no pools' })
  const generate = vi.spyOn(api, 'generateBracket').mockResolvedValue([])

  renderPanel({ hasPools: false })

  const button = await screen.findByRole('button', { name: /generate bracket/i })
  expect(screen.queryByRole('button', { name: /advance to playoffs/i })).not.toBeInTheDocument()
  expect(screen.queryByText('no pools')).not.toBeInTheDocument()
  fireEvent.click(button)

  await waitFor(() => expect(generate).toHaveBeenCalledWith(5, { format: 'single' }))
  expect(await screen.findByRole('heading', { name: 'Bracket 1' })).toBeInTheDocument()
})

test('unscored brackets can be reset after confirming, bringing the advance action back', async () => {
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue(tierBrackets)
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: true, reason: null })
  const reset = vi.spyOn(api, 'resetPlayoffBrackets').mockResolvedValue(undefined)

  renderPanel()

  fireEvent.click(await screen.findByRole('button', { name: /reset brackets/i }))
  expect(reset).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /^reset$/i }))

  await waitFor(() => expect(reset).toHaveBeenCalledWith(5))
  expect(await screen.findByRole('button', { name: /advance to playoffs/i })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Bracket 1' })).not.toBeInTheDocument()
})

test('brackets can no longer be reset once any playoff match has a score', async () => {
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([
    tierBrackets[0],
    { ...tierBrackets[1], has_scores: true },
  ])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'advanced' })

  renderPanel()

  await screen.findByRole('heading', { name: 'Bracket 2' })
  expect(screen.queryByRole('button', { name: /reset brackets/i })).not.toBeInTheDocument()
})

test('tier diagrams here are read-only and link to each bracket page for scoring', async () => {
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([tierBrackets[0]])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'advanced' })
  api.getPlayoffBracketMatches.mockResolvedValue([
    { id: 1, bracket: 'winners', round: 1, position: 1, team1_id: 10, team2_id: 20, status: 'ready', version: 1 },
    { id: 2, bracket: 'winners', round: 1, position: 2, team1_id: 30, team2_id: 40, status: 'complete', winner_id: 30, team1_score: 21, team2_score: 9, version: 2 },
  ])

  renderPanel()

  expect(await screen.findByRole('link', { name: 'Open Bracket 1' })).toHaveAttribute(
    'href',
    '/brackets/30',
  )
  await screen.findByTestId('match-1-2')
  expect(screen.queryByRole('button', { name: /save schedule|submit score|^correct/i })).not.toBeInTheDocument()
})

test('a tournament already in playoffs shows its brackets instead of the advance action', async () => {
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue(tierBrackets)
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({
    ready: false,
    reason: 'this tournament has already advanced to playoffs',
  })

  renderPanel()

  expect(await screen.findByRole('heading', { name: 'Bracket 2' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /advance to playoffs/i })).not.toBeInTheDocument()
})
