import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import BracketPage from './BracketPage'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAt(bracketId) {
  return render(
    <MemoryRouter initialEntries={[`/brackets/${bracketId}`]}>
      <Routes>
        <Route path="/brackets/:bracketId" element={<BracketPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('shows one tier with its controls, team names, courts, and a link back', async () => {
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({
    id: 30,
    tournament_id: 3,
    tier: 2,
    format: 'single',
    has_scores: false,
  })
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 3, name: 'Spring Classic', court_count: 4 })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, name: 'Spikers' },
    { id: 11, name: 'Diggers' },
  ])
  const matches = vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([
    { id: 1, bracket: 'winners', round: 1, position: 1, team1_id: 10, team2_id: 11, status: 'ready', version: 1 },
  ])

  renderAt(30)

  expect(await screen.findByRole('heading', { name: 'Bracket 2' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /back to tournament/i })).toHaveAttribute(
    'href',
    '/tournaments/3',
  )
  expect(await screen.findByLabelText('Diggers score')).toBeInTheDocument()
  expect(screen.getAllByRole('option', { name: /^court/i })).toHaveLength(4)
  expect(matches).toHaveBeenCalledWith(30)
})

test('a best-of tournament scores its playoff matches as series', async () => {
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 30, tournament_id: 3, tier: 1 })
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 3, court_count: 2, playoff_best_of: 5 })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, name: 'Spikers' },
    { id: 11, name: 'Diggers' },
  ])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([
    { id: 1, bracket: 'winners', round: 1, position: 1, team1_id: 10, team2_id: 11, status: 'ready', version: 1 },
  ])
  vi.spyOn(api, 'listGames').mockResolvedValue([])

  renderAt(30)

  expect(await screen.findByText('Spikers vs Diggers · best of 5 · 0–0')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Record game 1' })).toBeInTheDocument()
})

test('says so when the bracket does not exist', async () => {
  vi.spyOn(api, 'getPlayoffBracket').mockRejectedValue({ status: 404 })

  renderAt(99)

  expect(await screen.findByText('Bracket not found.')).toBeInTheDocument()
})
