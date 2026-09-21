import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

test('navigating from the main page to a tournament page and back to a team page', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([
    { id: 1, name: 'Spring Classic', team_count: 1 },
  ])
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 1,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([{ id: 10, tournament_id: 1, name: 'Ice Wolves' }])
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Ice Wolves' })
  vi.spyOn(api, 'listPlayers').mockResolvedValue([])

  render(<App />)

  fireEvent.click(await screen.findByRole('link', { name: /spring classic/i }))
  fireEvent.click(await screen.findByRole('link', { name: /ice wolves/i }))

  expect(await screen.findByDisplayValue('Ice Wolves')).toBeInTheDocument()
})
