import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { NotificationProvider } from './NotificationContext'
import PlayoffsPanel from './PlayoffsPanel'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderPanel() {
  return render(
    <NotificationProvider>
      <PlayoffsPanel tournamentId={5} teams={[]} courtCount={2} />
    </NotificationProvider>,
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
})

const tierBrackets = [
  { id: 30, tournament_id: 5, tier: 1, format: 'double' },
  { id: 31, tournament_id: 5, tier: 2, format: 'double' },
]

test('advancing once pools are complete shows each tier bracket', async () => {
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: true, reason: null })
  const advance = vi.spyOn(api, 'advanceToPlayoffs').mockResolvedValue(tierBrackets)
  const bracketMatches = vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])

  renderPanel()

  const button = await screen.findByRole('button', { name: /advance to playoffs/i })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.change(screen.getByLabelText(/playoff format/i), { target: { value: 'double' } })
  fireEvent.click(button)

  await waitFor(() => expect(advance).toHaveBeenCalledWith(5, { format: 'double' }))
  expect(await screen.findByRole('heading', { name: 'Bracket 1' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Bracket 2' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /advance to playoffs/i })).not.toBeInTheDocument()
  await waitFor(() => expect(bracketMatches).toHaveBeenCalledWith(30))
  expect(bracketMatches).toHaveBeenCalledWith(31)
})

test('a tournament already in playoffs shows its brackets instead of the advance action', async () => {
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue(tierBrackets)
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({
    ready: false,
    reason: 'this tournament has already advanced to playoffs',
  })
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])

  renderPanel()

  expect(await screen.findByRole('heading', { name: 'Bracket 2' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /advance to playoffs/i })).not.toBeInTheDocument()
})
