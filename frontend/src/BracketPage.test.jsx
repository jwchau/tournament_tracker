import { fireEvent, render, screen, within } from './testUtils'
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

  expect(await screen.findByRole('heading', { name: 'Bracket not found' })).toBeInTheDocument()
})

test('signed out, the bracket is read-only', async () => {
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 30, tournament_id: 3, tier: 1 })
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 3, court_count: 2 })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, name: 'Spikers' },
    { id: 11, name: 'Diggers' },
  ])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([
    { id: 1, bracket: 'winners', round: 1, position: 1, team1_id: 10, team2_id: 11, status: 'ready', version: 1 },
  ])

  render(
    <MemoryRouter initialEntries={['/brackets/30']}>
      <Routes>
        <Route path="/brackets/:bracketId" element={<BracketPage />} />
      </Routes>
    </MemoryRouter>,
    { user: null },
  )

  expect(await screen.findByText('Spikers')).toBeInTheDocument()
  expect(screen.queryByLabelText('Diggers score')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('once the tournament is complete, lists this tier\'s full placings', async () => {
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 31, tournament_id: 3, tier: 2 })
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 3, court_count: 2, stage: 'complete' })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])
  vi.spyOn(api, 'getTournamentResults').mockResolvedValue([
    {
      tier: 1,
      playoff_bracket_id: 30,
      format: 'single',
      champion: { team_id: 1, name: 'Other Tier' },
      runner_up: { team_id: 2, name: 'Also Other' },
      eliminated: [],
    },
    {
      tier: 2,
      playoff_bracket_id: 31,
      format: 'single',
      champion: { team_id: 10, name: 'Spikers' },
      runner_up: { team_id: 11, name: 'Diggers' },
      eliminated: [
        { bracket: 'winners', round: 2, teams: [{ team_id: 12, name: 'Blockers' }, { team_id: 13, name: 'Setters' }] },
        { bracket: 'winners', round: 1, teams: [{ team_id: 14, name: 'Servers' }] },
      ],
    },
  ])

  renderAt(31)

  const placings = await screen.findByRole('region', { name: 'Placings' })
  const rows = within(placings).getAllByRole('listitem')
  expect(rows.map((row) => row.textContent)).toEqual([
    '1st: Spikers',
    '2nd: Diggers',
    '3rd: Blockers, Setters (out in round 2)',
    '5th: Servers (out in round 1)',
  ])
  expect(api.getTournamentResults).toHaveBeenCalledWith(3)
})

test('double-elimination placings name the losers-bracket round', async () => {
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 30, tournament_id: 3, tier: 1 })
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 3, court_count: 2, stage: 'complete' })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])
  vi.spyOn(api, 'getTournamentResults').mockResolvedValue([
    {
      tier: 1,
      playoff_bracket_id: 30,
      format: 'double',
      champion: { team_id: 10, name: 'Spikers' },
      runner_up: { team_id: 11, name: 'Diggers' },
      eliminated: [{ bracket: 'losers', round: 2, teams: [{ team_id: 12, name: 'Blockers' }] }],
    },
  ])

  renderAt(30)

  const placings = await screen.findByRole('region', { name: 'Placings' })
  expect(within(placings).getByText('3rd: Blockers (out in losers round 2)')).toBeInTheDocument()
})

test('scoring the final shows the placings without a reload', async () => {
  const final = {
    id: 1, bracket: 'winners', round: 1, position: 1,
    team1_id: 10, team2_id: 11, status: 'ready', version: 1,
  }
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 30, tournament_id: 3, tier: 1 })
  vi.spyOn(api, 'getTournament')
    .mockResolvedValueOnce({ id: 3, court_count: 1, stage: 'playoffs' })
    .mockResolvedValue({ id: 3, court_count: 1, stage: 'complete' })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, name: 'Spikers' },
    { id: 11, name: 'Diggers' },
  ])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([final])
  vi.spyOn(api, 'submitScore').mockResolvedValue({
    ...final, team1_score: 21, team2_score: 15, status: 'complete', winner_id: 10, version: 2,
  })
  vi.spyOn(api, 'getTournamentResults').mockResolvedValue([
    {
      tier: 1,
      playoff_bracket_id: 30,
      format: 'single',
      champion: { team_id: 10, name: 'Spikers' },
      runner_up: { team_id: 11, name: 'Diggers' },
      eliminated: [],
    },
  ])

  renderAt(30)

  fireEvent.change(await screen.findByLabelText('Spikers score'), { target: { value: '21' } })
  fireEvent.change(screen.getByLabelText('Diggers score'), { target: { value: '15' } })
  fireEvent.click(screen.getByLabelText(/complete match/i))
  fireEvent.click(screen.getByRole('button', { name: /submit score/i }))

  const placings = await screen.findByRole('region', { name: 'Placings' })
  expect(await within(placings).findByText('1st: Spikers')).toBeInTheDocument()
})

test('shows no placings while the tournament is still being played', async () => {
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 30, tournament_id: 3, tier: 1 })
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 3, court_count: 2, stage: 'playoffs' })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])
  vi.spyOn(api, 'getTournamentResults')

  renderAt(30)

  expect(await screen.findByRole('heading', { name: 'Bracket 1' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Placings' })).not.toBeInTheDocument()
  expect(api.getTournamentResults).not.toHaveBeenCalled()
})
