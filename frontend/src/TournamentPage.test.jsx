import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { NotificationProvider } from './NotificationContext'
import TournamentPage from './TournamentPage'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAt(tournamentId) {
  return render(
    <MemoryRouter initialEntries={[`/tournaments/${tournamentId}`]}>
      <NotificationProvider>
        <Routes>
          <Route path="/tournaments/:tournamentId" element={<TournamentPage />} />
        </Routes>
      </NotificationProvider>
    </MemoryRouter>,
  )
}

function renderAtWithHome(tournamentId) {
  return render(
    <MemoryRouter initialEntries={[`/tournaments/${tournamentId}`]}>
      <NotificationProvider>
        <Routes>
          <Route path="/" element={<h2>Home page</h2>} />
          <Route path="/tournaments/:tournamentId" element={<TournamentPage />} />
        </Routes>
      </NotificationProvider>
    </MemoryRouter>,
  )
}

test('loads the tournament and lists its teams with player counts, linking to their team pages', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, tournament_id: 1, name: 'Ice Wolves', player_count: 2 },
  ])

  renderAt(1)

  expect(await screen.findByText('Spring Classic')).toBeInTheDocument()
  const link = screen.getByRole('link', { name: /ice wolves/i })
  expect(link).toHaveAttribute('href', '/teams/10')
  expect(screen.getByText(/2 players/i)).toBeInTheDocument()
})

test('toggling "show players" fetches and displays each team\'s roster', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, tournament_id: 1, name: 'Ice Wolves', player_count: 2 },
  ])
  vi.spyOn(api, 'listPlayers').mockResolvedValue([
    { id: 100, team_id: 10, name: 'Alex Kim' },
    { id: 101, team_id: 10, name: 'Jordan Lee' },
  ])

  renderAt(1)

  await screen.findByText(/ice wolves/i)
  expect(screen.queryByText('Alex Kim')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('checkbox', { name: /show players/i }))

  expect(await screen.findByText('Alex Kim')).toBeInTheDocument()
  expect(screen.getByText('Jordan Lee')).toBeInTheDocument()
  expect(api.listPlayers).toHaveBeenCalledWith(10)
})

test('toggling "show players" again reuses the cached rosters instead of refetching', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, tournament_id: 1, name: 'Ice Wolves', player_count: 1 },
  ])
  const listPlayers = vi
    .spyOn(api, 'listPlayers')
    .mockResolvedValue([{ id: 100, team_id: 10, name: 'Alex Kim' }])

  renderAt(1)
  await screen.findByText(/ice wolves/i)
  const toggle = screen.getByRole('checkbox', { name: /show players/i })

  // First show: cache miss, so the roster comes from the backend.
  fireEvent.click(toggle)
  expect(await screen.findByText('Alex Kim')).toBeInTheDocument()
  expect(listPlayers).toHaveBeenCalledTimes(1)

  fireEvent.click(toggle)
  expect(screen.queryByText('Alex Kim')).not.toBeInTheDocument()

  // Second show: cache hit, rendered immediately with no new request.
  fireEvent.click(toggle)
  expect(screen.getByText('Alex Kim')).toBeInTheDocument()
  expect(listPlayers).toHaveBeenCalledTimes(1)
})

test('a team added after rosters were cached is fetched while cached teams are not', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, tournament_id: 1, name: 'Ice Wolves', player_count: 1 },
  ])
  vi.spyOn(api, 'createTeam').mockResolvedValue({ id: 11, tournament_id: 1, name: 'Fire Hawks' })
  const listPlayers = vi.spyOn(api, 'listPlayers').mockImplementation((teamId) =>
    Promise.resolve(
      teamId === 10 ? [{ id: 100, team_id: 10, name: 'Alex Kim' }] : [{ id: 200, team_id: 11, name: 'Sam Park' }],
    ),
  )

  renderAt(1)
  await screen.findByText(/ice wolves/i)
  const toggle = screen.getByRole('checkbox', { name: /show players/i })
  fireEvent.click(toggle)
  await screen.findByText('Alex Kim')
  fireEvent.click(toggle)

  fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Fire Hawks' } })
  fireEvent.click(screen.getByRole('button', { name: /add team/i }))
  await screen.findByRole('link', { name: /fire hawks/i })

  fireEvent.click(toggle)

  expect(await screen.findByText('Sam Park')).toBeInTheDocument()
  expect(screen.getByText('Alex Kim')).toBeInTheDocument()
  // Ice Wolves was a cache hit; only Fire Hawks went to the backend.
  expect(listPlayers.mock.calls.map(([teamId]) => teamId)).toEqual([10, 11])
})

test('editing tournament config submits the update, reflects the new values, and notifies', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  const updateTournament = vi.spyOn(api, 'updateTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic 2026',
    advance_per_pool: 2,
    playoff_bracket_count: 1,
    court_count: 4,
  })

  renderAt(1)

  await screen.findByText('Spring Classic')

  fireEvent.change(screen.getByLabelText(/tournament name/i), {
    target: { value: 'Spring Classic 2026' },
  })
  fireEvent.change(screen.getByLabelText(/advance per pool/i), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText(/court count/i), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  expect(await screen.findByText('Spring Classic 2026')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(/settings saved/i)
  expect(updateTournament).toHaveBeenCalledWith(
    '1',
    expect.objectContaining({
      name: 'Spring Classic 2026',
      advance_per_pool: 2,
      playoff_bracket_count: 1,
      court_count: 4,
    }),
  )
})

test('shows each pool with its standings, leaving the schedule to the pool page', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([
    { id: 7, tournament_id: 1, name: 'Pool A', courts: [1, 2] },
  ])
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([])
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue([])

  renderAt(1)

  expect(await screen.findByText('Pool A — courts 1, 2')).toBeInTheDocument()
  expect(await screen.findByRole('table', { name: /standings/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Pool A' })).toHaveAttribute('href', '/pools/7')
  expect(screen.queryByRole('button', { name: /generate schedule/i })).not.toBeInTheDocument()
  expect(api.getPoolMatches).not.toHaveBeenCalled()
})

test('generates a bracket in the chosen format, single by default', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'getBracket').mockResolvedValue([])
  const generateBracket = vi.spyOn(api, 'generateBracket').mockResolvedValue([])

  renderAt(1)

  const format = await screen.findByLabelText(/format/i)
  expect(format).toHaveValue('single')

  fireEvent.change(format, { target: { value: 'double' } })
  fireEvent.click(screen.getByRole('button', { name: /generate bracket/i }))

  await waitFor(() => expect(generateBracket).toHaveBeenCalledWith('1', { format: 'double' }))
})

test('shows a notification with the validation detail when generating a bracket is rejected', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'generateBracket').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'at least 2 teams are required to generate a bracket' }),
  })

  renderAt(1)

  fireEvent.click(await screen.findByRole('button', { name: /generate bracket/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/at least 2 teams are required/i)
})

test('clicking delete tournament shows a confirmation modal that does nothing until confirmed', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  const deleteTournament = vi.spyOn(api, 'deleteTournament')

  renderAtWithHome(1)

  fireEvent.click(await screen.findByRole('button', { name: /delete tournament/i }))
  expect(screen.getByRole('dialog', { name: /delete tournament/i })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(deleteTournament).not.toHaveBeenCalled()
  expect(screen.getByText('Spring Classic')).toBeInTheDocument()
})

test('confirming delete tournament removes it and redirects to the home page', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  const deleteTournament = vi.spyOn(api, 'deleteTournament').mockResolvedValue(undefined)

  renderAtWithHome(1)

  fireEvent.click(await screen.findByRole('button', { name: /delete tournament/i }))
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

  expect(await screen.findByText('Home page')).toBeInTheDocument()
  expect(deleteTournament).toHaveBeenCalledWith('1')
})
