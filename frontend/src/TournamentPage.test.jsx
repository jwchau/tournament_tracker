import { fireEvent, render, screen, waitFor, within } from './testUtils'
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
    settings_confirmed: true,
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

test('links to the court list for scorekeepers', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])

  renderAt(1)

  expect(await screen.findByRole('link', { name: /courts/i })).toHaveAttribute(
    'href',
    '/tournaments/1/courts',
  )
})

test('toggling "show players" fetches and displays each team\'s roster', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
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
    settings_confirmed: true,
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
    settings_confirmed: true,
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
    settings_confirmed: true,
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

test('games per pairing and target pool size are tournament settings', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
    games_per_pairing: 1,
    target_pool_size: 4,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockImplementation(async (id, values) => ({ id: 1, ...values }))

  renderAt(1)

  const games = await screen.findByLabelText(/games per pairing/i)
  const target = screen.getByLabelText(/target pool size/i)
  expect([games.value, target.value]).toEqual(['1', '4'])
  expect(games).toHaveAttribute('min', '1')
  expect(target).toHaveAttribute('min', '2')
  fireEvent.change(games, { target: { value: '2' } })
  fireEvent.change(target, { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  await waitFor(() =>
    expect(updateTournament).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ games_per_pairing: 2, target_pool_size: 5 }),
    ),
  )
})

test('shows each pool with its standings, leaving the schedule to the pool page', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
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

test('has a playoffs section showing the tier brackets once the tournament has advanced', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([
    { id: 30, tournament_id: 1, tier: 1, format: 'single' },
  ])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'advanced' })
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])

  renderAt(1)

  expect(await screen.findByRole('heading', { name: 'Playoffs' })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Bracket 1' })).toBeInTheDocument()
})

const unconfirmed = {
  id: 1,
  name: 'Fall Open',
  advance_per_pool: 2,
  playoff_bracket_count: 2,
  court_count: 3,
  games_per_pairing: 1,
  target_pool_size: 4,
  settings_confirmed: false,
  settings_locked: false,
}

test('a new tournament shows only its settings until they are confirmed', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue(unconfirmed)
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  const listPools = vi.spyOn(api, 'listPools').mockResolvedValue([])
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockImplementation(async (id, values) => ({ ...unconfirmed, ...values }))
  const confirmSettings = vi
    .spyOn(api, 'confirmSettings')
    .mockImplementation(async () => ({ ...unconfirmed, court_count: 4, settings_confirmed: true }))

  renderAt(1)

  expect(
    await screen.findByText('Confirm the tournament settings to add teams, pools, and brackets.'),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText(/team name/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /add pool/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /generate bracket|advance to playoffs/i })).not.toBeInTheDocument()
  expect(listPools).not.toHaveBeenCalled()

  fireEvent.change(screen.getByLabelText(/court count/i), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save and confirm settings' }))
  const dialog = screen.getByRole('dialog', { name: /confirm settings/i })
  expect(dialog).toHaveTextContent('Court count: 4')
  expect(dialog).toHaveTextContent('Advance per pool: 2')
  expect(updateTournament).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: /^confirm$/i }))

  expect(await screen.findByLabelText(/team name/i)).toBeInTheDocument()
  expect(updateTournament).toHaveBeenCalledWith('1', expect.objectContaining({ court_count: 4 }))
  expect(confirmSettings).toHaveBeenCalledWith('1')
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
})

test('once play has started only the tournament name can be edited', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    ...unconfirmed,
    settings_confirmed: true,
    settings_locked: true,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'x' })

  renderAt(1)

  expect(await screen.findByLabelText(/tournament name/i)).toBeEnabled()
  for (const label of [/advance per pool/i, /playoff bracket count/i, /court count/i, /games per pairing/i, /target pool size/i]) {
    expect(screen.getByLabelText(label)).toBeDisabled()
  }
  expect(screen.getByText(/settings are locked once play has started/i)).toBeInTheDocument()
})

test('playoff best-of is chosen from odd counts and locks once brackets exist', async () => {
  const confirmed = { ...unconfirmed, settings_confirmed: true, playoff_best_of: 1, stage: 'draft' }
  vi.spyOn(api, 'getTournament').mockResolvedValue(confirmed)
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'x' })
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockImplementation(async (id, values) => ({ ...confirmed, ...values }))

  const { unmount } = renderAt(1)

  const bestOf = await screen.findByLabelText(/playoff best-of/i)
  expect([...bestOf.options].map((option) => option.value)).toEqual(['1', '3', '5', '7'])
  fireEvent.change(bestOf, { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(updateTournament).toHaveBeenCalledWith('1', expect.objectContaining({ playoff_best_of: 3 })),
  )
  unmount()

  api.getTournament.mockResolvedValue({ ...confirmed, stage: 'playoffs' })
  renderAt(1)
  expect(await screen.findByLabelText(/playoff best-of/i)).toBeDisabled()
  expect(screen.getByLabelText(/court count/i)).toBeEnabled()
})

test('generating a bracket locks the best-of setting without a reload', async () => {
  const confirmed = { ...unconfirmed, settings_confirmed: true, playoff_best_of: 3, stage: 'draft' }
  vi.spyOn(api, 'getTournament')
    .mockResolvedValueOnce(confirmed)
    .mockResolvedValue({ ...confirmed, stage: 'playoffs' })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets')
    .mockResolvedValueOnce([])
    .mockResolvedValue([{ id: 30, tournament_id: 1, tier: 1, format: 'single', has_scores: false }])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'x' })
  vi.spyOn(api, 'generateBracket').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])

  renderAt(1)

  expect(await screen.findByLabelText(/playoff best-of/i)).toBeEnabled()
  fireEvent.click(await screen.findByRole('button', { name: /generate bracket/i }))

  await waitFor(() => expect(screen.getByLabelText(/playoff best-of/i)).toBeDisabled())
})

test('a refused settings save says why', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({ ...unconfirmed, settings_confirmed: true })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'x' })
  vi.spyOn(api, 'updateTournament').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'play has started, so only the tournament name can still be changed' }),
  })

  renderAt(1)

  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/play has started/)
})

function mockPlayoffsNotStarted() {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'not yet' })
}

test('without pools the playoffs section generates a bracket in the chosen format', async () => {
  mockPlayoffsNotStarted()
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  const generateBracket = vi.spyOn(api, 'generateBracket').mockResolvedValue([])

  renderAt(1)

  const format = await screen.findByLabelText(/playoff format/i)
  expect(format).toHaveValue('single')
  fireEvent.change(format, { target: { value: 'double' } })
  fireEvent.click(screen.getByRole('button', { name: /generate bracket/i }))

  await waitFor(() => expect(generateBracket).toHaveBeenCalledWith('1', { format: 'double' }))
  expect(screen.queryByRole('heading', { name: /^bracket$/i })).not.toBeInTheDocument()
})

test('once a pool exists the playoffs section advances instead of generating', async () => {
  mockPlayoffsNotStarted()
  vi.spyOn(api, 'listPools').mockResolvedValue([
    { id: 7, tournament_id: 1, name: 'Pool A', courts: [1, 2] },
  ])
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue([])

  renderAt(1)

  expect(await screen.findByRole('button', { name: /advance to playoffs/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /generate bracket/i })).not.toBeInTheDocument()
})

test('shows a notification with the validation detail when generating a bracket is rejected', async () => {
  mockPlayoffsNotStarted()
  vi.spyOn(api, 'listPools').mockResolvedValue([])
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
    settings_confirmed: true,
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
    settings_confirmed: true,
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

test('signed out, the tournament is read-only', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, tournament_id: 1, name: 'Ice Wolves', pool_id: 7, player_count: 2 },
  ])
  vi.spyOn(api, 'listPools').mockResolvedValue([{ id: 7, tournament_id: 1, name: 'Pool A', courts: [1] }])
  vi.spyOn(api, 'getPoolStandings').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'Pool A has no schedule yet' })

  render(
    <MemoryRouter initialEntries={['/tournaments/1']}>
      <NotificationProvider>
        <Routes>
          <Route path="/tournaments/:tournamentId" element={<TournamentPage />} />
        </Routes>
      </NotificationProvider>
    </MemoryRouter>,
    { user: null },
  )

  expect(await screen.findByRole('link', { name: 'Ice Wolves' })).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Open Pool A' })).toBeInTheDocument()
  expect(await screen.findByText('Pool A has no schedule yet')).toBeInTheDocument()
  // Only the roster toggle and refreshing, which change nothing on the server.
  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Refresh standings',
  ])
  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

function mockCompleteTournament(stage) {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    stage,
    settings_confirmed: true,
    advance_per_pool: 1,
    playoff_bracket_count: 2,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
}

test('shows the tournament stage next to its name', async () => {
  mockCompleteTournament('pool_play')

  renderAt(1)

  expect(await screen.findByText('Spring Classic')).toBeInTheDocument()
  expect(screen.getByText('Stage: Pool play')).toBeInTheDocument()
})

test('a complete tournament lists each tier\'s champion and runner-up, linking to its placings', async () => {
  mockCompleteTournament('complete')
  vi.spyOn(api, 'getTournamentResults').mockResolvedValue([
    {
      tier: 1,
      playoff_bracket_id: 30,
      format: 'double',
      champion: { team_id: 10, name: 'Spikers' },
      runner_up: { team_id: 11, name: 'Diggers' },
      eliminated: [],
    },
    {
      tier: 2,
      playoff_bracket_id: 31,
      format: 'double',
      champion: { team_id: 12, name: 'Blockers' },
      runner_up: { team_id: 13, name: 'Setters' },
      eliminated: [],
    },
  ])

  renderAt(1)

  const results = await screen.findByRole('region', { name: 'Results' })
  expect(screen.getByText('Stage: Complete')).toBeInTheDocument()
  // The section renders before its results load, so wait for the tiers.
  const tiers = await within(results).findAllByRole('listitem')
  expect(tiers[0]).toHaveTextContent('Bracket 1')
  expect(tiers[0]).toHaveTextContent('Champion: Spikers')
  expect(tiers[0]).toHaveTextContent('Runner-up: Diggers')
  expect(within(tiers[0]).getByRole('link', { name: /full placings/i })).toHaveAttribute(
    'href',
    '/brackets/30',
  )
  expect(tiers[1]).toHaveTextContent('Champion: Blockers')
  expect(tiers[1]).toHaveTextContent('Runner-up: Setters')
  expect(api.getTournamentResults).toHaveBeenCalledWith('1')
})

test('there are no results until the tournament is complete', async () => {
  mockCompleteTournament('playoffs')
  vi.spyOn(api, 'getTournamentResults')

  renderAt(1)

  expect(await screen.findByText('Stage: Playoffs')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Results' })).not.toBeInTheDocument()
  expect(api.getTournamentResults).not.toHaveBeenCalled()
})

test('says so when the tournament does not exist', async () => {
  vi.spyOn(api, 'getTournament').mockRejectedValue({ status: 404 })
  vi.spyOn(api, 'listTeams').mockRejectedValue({ status: 404 })

  renderAt(999)

  expect(await screen.findByRole('heading', { name: 'Tournament not found' })).toBeInTheDocument()
})

test('a tournament that fails to load for another reason says so', async () => {
  vi.spyOn(api, 'getTournament').mockRejectedValue(new TypeError('Failed to fetch'))
  vi.spyOn(api, 'listTeams').mockRejectedValue(new TypeError('Failed to fetch'))

  renderAt(1)

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the server/i)
  expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
})
