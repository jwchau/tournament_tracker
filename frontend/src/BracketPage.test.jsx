import { act, fireEvent, render, screen, waitFor, within } from './testUtils'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import BracketPage from './BracketPage'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
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

test('shows one tier with its format, team names, courts, and a link back', async () => {
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
  expect(screen.getByText('Single elimination')).toBeInTheDocument()
  // A match opens with its court and time, from the tournament's courts.
  fireEvent.click(
    await screen.findByRole('button', { name: 'Final: Spikers vs Diggers' }),
  )
  expect(screen.getAllByRole('option', { name: /^court/i })).toHaveLength(4)
  expect(matches).toHaveBeenCalledWith(30)
})

test('a best-of tournament says so, and its matches are scored on the court', async () => {
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 30, tournament_id: 3, tier: 1, format: 'double' })
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 3, court_count: 2, playoff_best_of: 5 })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, name: 'Spikers' },
    { id: 11, name: 'Diggers' },
  ])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([
    { id: 1, bracket: 'winners', round: 1, position: 1, team1_id: 10, team2_id: 11, status: 'ready', court: 1, version: 1 },
  ])

  renderAt(30)

  expect(await screen.findByText('Double elimination · best of 5')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Score on Court 1' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /record game/i })).not.toBeInTheDocument()
})

test('shows a loading placeholder until the bracket arrives', () => {
  vi.spyOn(api, 'getPlayoffBracket').mockReturnValue(new Promise(() => {}))

  renderAt(30)

  expect(screen.getByRole('status', { name: 'Loading bracket' })).toBeInTheDocument()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
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

  fireEvent.click(
    await screen.findByRole('button', { name: 'Final: Spikers vs Diggers' }),
  )
  const match = screen.getByRole('dialog', { name: 'Final' })
  expect(within(match).queryByRole('button', { name: /save schedule|hold|correct/i })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Diggers score')).not.toBeInTheDocument()
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
  expect(within(placings).getAllByRole('listitem')[2]).toHaveTextContent(
    '3rd: Blockers (out in losers round 2)',
  )
})

test('a final scored on the court shows the placings without a reload', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
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
  const loadMatches = vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([final])
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

  await screen.findByRole('button', { name: 'Final: Spikers vs Diggers' })
  // The scorekeeper finishes it on the court; the next poll brings it here.
  loadMatches.mockResolvedValue([
    { ...final, team1_score: 21, team2_score: 15, status: 'complete', winner_id: 10, version: 2 },
  ])
  await act(() => vi.advanceTimersByTimeAsync(4000))

  const placings = await screen.findByRole('region', { name: 'Placings' })
  await waitFor(() => expect(within(placings).getAllByRole('listitem')[0]).toHaveTextContent('1st: Spikers'))
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
