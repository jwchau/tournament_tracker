import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import TournamentList from './TournamentList'

afterEach(() => {
  vi.restoreAllMocks()
})

test('renders tournaments with their teams and rosters', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([
    { id: 1, name: 'Spring Classic', stage: 'draft' },
  ])
  vi.spyOn(api, 'listTeams').mockImplementation(async (tournamentId) =>
    tournamentId === 1 ? [{ id: 10, tournament_id: 1, name: 'Ice Wolves' }] : [],
  )
  vi.spyOn(api, 'listPlayers').mockImplementation(async (teamId) =>
    teamId === 10 ? [{ id: 100, team_id: 10, name: 'Alex Kim' }] : [],
  )

  render(<TournamentList />)

  expect(await screen.findByText('Spring Classic')).toBeInTheDocument()
  expect(await screen.findByText('Ice Wolves')).toBeInTheDocument()
  expect(await screen.findByText('Alex Kim')).toBeInTheDocument()
})

test('shows the validation error when generating a bracket is rejected', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([
    { id: 1, name: 'Spring Classic', stage: 'draft' },
  ])
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'generateBracket').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'at least 2 teams are required to generate a bracket' }),
  })

  render(<TournamentList />)

  fireEvent.click(await screen.findByRole('button', { name: /generate bracket/i }))

  expect(await screen.findByText(/at least 2 teams are required/i)).toBeInTheDocument()
})
