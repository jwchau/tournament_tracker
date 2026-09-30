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

test('the Teams heading counts every registered team', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, tournament_id: 1, name: 'Ice Wolves', player_count: 2, checked_in: true },
    { id: 11, tournament_id: 1, name: 'Fire Hawks', player_count: 3, checked_in: false },
  ])

  renderAt(1)

  expect(await screen.findByRole('heading', { name: 'Teams, 2' })).toBeInTheDocument()
  expect(screen.queryByText(/no teams yet/i)).not.toBeInTheDocument()
})

test('a tournament without teams shows a count of 0 beside the empty message', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])

  renderAt(1)

  expect(await screen.findByRole('heading', { name: 'Teams, 0' })).toBeInTheDocument()
  expect(screen.getByText(/no teams yet/i)).toBeInTheDocument()
})

test('adding a team from the Teams section updates the count', async () => {
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

  renderAt(1)
  await screen.findByRole('heading', { name: 'Teams, 1' })

  fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Fire Hawks' } })
  fireEvent.click(screen.getByRole('button', { name: /add team/i }))

  expect(await screen.findByRole('heading', { name: 'Teams, 2' })).toBeInTheDocument()
})

test('links to the court list for scorekeepers', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
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

  expect(await screen.findByRole('heading', { name: 'Pool A' })).toBeInTheDocument()
  expect(screen.getByText('Courts 1, 2')).toBeInTheDocument()
  expect(await screen.findByRole('table', { name: /standings/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Pool A' })).toHaveAttribute('href', '/pools/7')
  expect(screen.queryByRole('button', { name: /generate schedule/i })).not.toBeInTheDocument()
  expect(api.getPoolMatches).not.toHaveBeenCalled()
})

test('has a playoffs section showing the tier brackets once the tournament has advanced', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
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

test('a tournament that went straight to a bracket shows no standings section', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    stage: 'playoffs',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([
    { id: 30, tournament_id: 1, tier: 1, format: 'single' },
  ])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'advanced' })
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])

  renderAt(1)

  expect(await screen.findByRole('heading', { name: 'Bracket 1' })).toBeInTheDocument()
  await waitFor(() => expect(api.listPools).toHaveBeenCalled())
  expect(screen.queryByRole('heading', { name: 'Standings' })).not.toBeInTheDocument()
  expect(screen.queryByText(/no pools yet/i)).not.toBeInTheDocument()
})

test('a team with one player says "1 player"', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 2,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([
    { id: 10, tournament_id: 1, name: 'Aces', player_count: 1 },
    { id: 11, tournament_id: 1, name: 'Blockers', player_count: 2 },
  ])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'no pools' })

  renderAt(1)

  const aces = (await screen.findByRole('link', { name: 'Aces' })).closest('li')
  expect(aces).toHaveTextContent('Aces (1 player)')
  expect(screen.getByRole('link', { name: 'Blockers' }).closest('li')).toHaveTextContent(
    'Blockers (2 players)',
  )
})

const settings = {
  id: 1,
  name: 'Fall Open',
  stage: 'draft',
  date: null,
  venue: null,
  advance_per_pool: 2,
  playoff_bracket_count: 2,
  court_count: 3,
  games_per_pairing: 1,
  target_pool_size: 4,
  playoff_best_of: 1,
  setting_locks: {},
}

// What saving opens first: what the change would do, none by default.
function mockPreview(effects = []) {
  return vi.spyOn(api, 'previewSettings').mockResolvedValue({ effects })
}

function mockSettingsPage(tournament = settings) {
  vi.spyOn(api, 'getTournament').mockResolvedValue(tournament)
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'x' })
}

test('editing the settings sends only what changed, shows the new values and notifies', async () => {
  mockSettingsPage({ ...settings, name: 'Spring Classic', advance_per_pool: 1, court_count: 2 })
  const preview = mockPreview()
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockResolvedValue({ ...settings, name: 'Spring Classic 2026', advance_per_pool: 2, court_count: 4 })

  renderAt(1)

  await screen.findByText('Spring Classic')
  fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: 'Spring Classic 2026' } })
  fireEvent.change(screen.getByLabelText(/advance per pool/i), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText(/court count/i), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('Spring Classic 2026')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(/settings saved/i)
  const changes = { name: 'Spring Classic 2026', advance_per_pool: 2, court_count: 4 }
  expect(preview).toHaveBeenCalledWith('1', changes)
  expect(updateTournament).toHaveBeenCalledWith('1', changes)
})

test('Save waits until something has changed', async () => {
  mockSettingsPage()
  mockPreview()

  renderAt(1)

  const save = await screen.findByRole('button', { name: 'Save' })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/court count/i), { target: { value: '4' } })
  expect(save).toBeEnabled()
  fireEvent.change(screen.getByLabelText(/court count/i), { target: { value: '3' } })
  expect(save).toBeDisabled()
})

test('games per pairing and number of teams per pool are tournament settings', async () => {
  mockSettingsPage()
  mockPreview()
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockImplementation(async (id, values) => ({ ...settings, ...values }))

  renderAt(1)

  const games = await screen.findByLabelText(/games per pairing/i)
  const target = screen.getByLabelText(/number of teams per pool/i)
  expect([games.value, target.value]).toEqual(['1', '4'])
  expect(games).toHaveAttribute('min', '1')
  expect(target).toHaveAttribute('min', '2')
  fireEvent.change(games, { target: { value: '2' } })
  fireEvent.change(target, { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(updateTournament).toHaveBeenCalledWith('1', { games_per_pairing: 2, target_pool_size: 5 }),
  )
})

test('a blank advance per pool is automatic, and clearing the box goes back to it', async () => {
  mockSettingsPage({ ...settings, advance_per_pool: null })
  mockPreview()
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockImplementation(async (id, values) => ({ ...settings, ...values }))

  renderAt(1)

  const advance = await screen.findByLabelText(/advance per pool/i)
  expect(advance).toHaveValue(null)
  expect(advance).toHaveAttribute('placeholder', 'Automatic')
  fireEvent.change(advance, { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateTournament).toHaveBeenLastCalledWith('1', { advance_per_pool: 3 }))

  fireEvent.change(await screen.findByLabelText(/advance per pool/i), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateTournament).toHaveBeenLastCalledWith('1', { advance_per_pool: null }))
})

test('the date and venue are saved and shown under the tournament name', async () => {
  mockSettingsPage()
  mockPreview()
  vi.spyOn(api, 'updateTournament').mockResolvedValue({
    ...settings,
    date: '2026-10-04',
    venue: 'Riverside courts',
  })

  renderAt(1)

  fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2026-10-04' } })
  fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'Riverside courts' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText(/Oct 4, 2026 · Riverside courts/)).toBeInTheDocument()
  expect(api.updateTournament).toHaveBeenCalledWith('1', { date: '2026-10-04', venue: 'Riverside courts' })
})

test('clearing the date and venue sends null for each', async () => {
  mockSettingsPage({ ...settings, date: '2026-10-04', venue: 'Riverside courts' })
  mockPreview()
  const updateTournament = vi.spyOn(api, 'updateTournament').mockResolvedValue(settings)

  renderAt(1)

  fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Venue'), { target: { value: '  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(updateTournament).toHaveBeenCalledWith('1', { date: null, venue: null }))
})

test('a change that affects something is reviewed first, and can be cancelled', async () => {
  mockSettingsPage()
  mockPreview(['Pool play will send Bracket 1: 2 teams, Bracket 2: 3 teams.', 'Bracket 1 would have 1 team; every playoff bracket needs at least 2.'])
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockImplementation(async (id, values) => ({ ...settings, ...values }))

  renderAt(1)

  fireEvent.change(await screen.findByLabelText(/playoff bracket count/i), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  const dialog = await screen.findByRole('dialog', { name: 'Review changes' })
  const effects = within(dialog).getAllByRole('listitem').map((item) => item.textContent)
  expect(effects).toEqual([
    'Pool play will send Bracket 1: 2 teams, Bracket 2: 3 teams.',
    'Bracket 1 would have 1 team; every playoff bracket needs at least 2.',
  ])
  expect(updateTournament).not.toHaveBeenCalled()

  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(updateTournament).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/playoff bracket count/i)).toHaveValue(3)

  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Review changes' })).getByRole('button', { name: 'Save changes' }))

  await waitFor(() => expect(updateTournament).toHaveBeenCalledWith('1', { playoff_bracket_count: 3 }))
  expect(screen.queryByRole('dialog', { name: 'Review changes' })).not.toBeInTheDocument()
})

test('a setting that has locked is disabled with the reason, and the rest stay open', async () => {
  mockSettingsPage({
    ...settings,
    setting_locks: { games_per_pairing: 'play has started', target_pool_size: 'play has started' },
  })

  renderAt(1)

  await screen.findByLabelText(/tournament name/i)
  for (const label of [/games per pairing/i, /number of teams per pool/i]) {
    expect(screen.getByLabelText(label)).toBeDisabled()
  }
  expect(screen.getAllByText('Locked: play has started.')).toHaveLength(2)
  for (const label of [/tournament name/i, /^date$/i, /venue/i, /advance per pool/i, /playoff bracket count/i, /court count/i, /playoff best-of/i]) {
    expect(screen.getByLabelText(label)).toBeEnabled()
  }
})

test('the settings are grouped by what they run', async () => {
  mockSettingsPage()

  renderAt(1)

  await screen.findByLabelText(/tournament name/i)
  const fields = (name) =>
    within(screen.getByRole('group', { name }))
      .getAllByRole('spinbutton')
      .concat(within(screen.getByRole('group', { name })).queryAllByRole('combobox'))
      .map((field) => field.id)
  expect(fields('Pool play')).toEqual(['target-pool-size', 'games-per-pairing', 'pool-point-cap'])
  expect(fields('Playoffs')).toEqual([
    'playoff-bracket-count',
    'advance-per-pool',
    'playoff-best-of',
    'playoff-best-of-losers',
    'playoff-best-of-final',
  ])
  expect(fields('Courts')).toEqual(['court-count'])
  expect(within(screen.getByRole('group', { name: 'Tournament' })).getByLabelText('Venue')).toBeInTheDocument()
})

test('playoff best-of is chosen from odd counts and locks once a playoff match is scored', async () => {
  mockSettingsPage({ ...settings, playoff_best_of: 1 })
  mockPreview()
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockImplementation(async (id, values) => ({ ...settings, ...values }))

  const { unmount } = renderAt(1)

  const bestOf = await screen.findByLabelText(/playoff best-of/i)
  expect([...bestOf.options].map((option) => option.value)).toEqual(['1', '3', '5', '7'])
  fireEvent.change(bestOf, { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(updateTournament).toHaveBeenCalledWith('1', { playoff_best_of: 3 }))
  unmount()

  api.getTournament.mockResolvedValue({
    ...settings,
    stage: 'playoffs',
    setting_locks: { playoff_best_of: 'a playoff match has been scored' },
  })
  renderAt(1)
  expect(await screen.findByLabelText(/playoff best-of/i)).toBeDisabled()
  expect(screen.getByText('Locked: a playoff match has been scored.')).toBeInTheDocument()
  expect(screen.getByLabelText(/court count/i)).toBeEnabled()
})

test('a fresh tournament opens the Manage drawer, and teams can be added from the Teams section at once', async () => {
  mockSettingsPage()

  renderAt(1)

  expect(await screen.findByLabelText(/team name/i)).toBeInTheDocument()
  expect(document.querySelector('details.manage').open).toBe(true)
})

test('the add-a-team form is under the Teams heading, not in the Manage drawer', async () => {
  mockSettingsPage()

  renderAt(1)

  const teams = await screen.findByRole('region', { name: /^Teams/ })
  expect(within(teams).getByLabelText(/team name/i)).toBeInTheDocument()
  expect(within(teams).getByRole('button', { name: 'Add team' })).toBeInTheDocument()
  const drawer = screen.getByRole('region', { name: 'Manage tournament' })
  expect(within(drawer).queryByLabelText(/team name/i)).not.toBeInTheDocument()
  expect(within(drawer).queryByRole('heading', { name: 'Add a team' })).not.toBeInTheDocument()
})

test('a tournament with teams keeps the Manage drawer closed', async () => {
  mockSettingsPage()
  api.listTeams.mockResolvedValue([{ id: 10, tournament_id: 1, name: 'Aces', player_count: 0 }])

  renderAt(1)

  await screen.findByRole('link', { name: 'Aces' })
  expect(document.querySelector('details.manage').open).toBe(false)
})

// Generating opens the seeding dialog first; this walks through it.
function mockSeedingPreview() {
  vi.spyOn(api, 'getPlayoffSeeding').mockResolvedValue({
    ready: true,
    reason: null,
    tiers: [
      {
        tier: 1,
        teams: [
          { team_id: 1, name: 'Aces', pool: null, pool_rank: null },
          { team_id: 2, name: 'Bees', pool: null, pool_rank: null },
        ],
      },
    ],
  })
}

async function generateFromDialog(format) {
  fireEvent.click(await screen.findByRole('button', { name: /generate bracket/i }))
  const dialog = await screen.findByRole('dialog', { name: 'Confirm playoff seeding' })
  if (format) fireEvent.change(within(dialog).getByLabelText(/playoff format/i), { target: { value: format } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and generate' }))
}

test('generating a bracket locks advance per pool and the bracket count without a reload', async () => {
  mockSeedingPreview()
  const locked = 'the playoff brackets exist; reset them first'
  vi.spyOn(api, 'getTournament')
    .mockResolvedValueOnce({ ...settings, playoff_best_of: 3 })
    .mockResolvedValue({
      ...settings,
      playoff_best_of: 3,
      stage: 'playoffs',
      setting_locks: { advance_per_pool: locked, playoff_bracket_count: locked },
    })
  vi.spyOn(api, 'listTeams').mockResolvedValue([])
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'listPlayoffBrackets')
    .mockResolvedValueOnce([])
    .mockResolvedValue([{ id: 30, tournament_id: 1, tier: 1, format: 'single', has_scores: false }])
  vi.spyOn(api, 'getPlayoffReadiness').mockResolvedValue({ ready: false, reason: 'x' })
  vi.spyOn(api, 'generateBracket').mockResolvedValue([])
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([])

  renderAt(1)

  expect(await screen.findByLabelText(/advance per pool/i)).toBeEnabled()
  await generateFromDialog()

  await waitFor(() => expect(screen.getByLabelText(/advance per pool/i)).toBeDisabled())
  expect(screen.getByLabelText(/playoff bracket count/i)).toBeDisabled()
  expect(screen.getByLabelText(/playoff best-of/i)).toBeEnabled()
})

test('a setting the server refuses says why, before anything is saved', async () => {
  mockSettingsPage()
  vi.spyOn(api, 'previewSettings').mockRejectedValue({
    json: () => Promise.resolve({ detail: "Games per pairing can't change now: play has started" }),
  })
  const updateTournament = vi.spyOn(api, 'updateTournament')

  renderAt(1)

  fireEvent.change(await screen.findByLabelText(/games per pairing/i), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/can't change now: play has started/)
  expect(updateTournament).not.toHaveBeenCalled()
})

test('a save the server refuses says why', async () => {
  mockSettingsPage()
  mockPreview()
  vi.spyOn(api, 'updateTournament').mockRejectedValue({
    json: () => Promise.resolve({ detail: "Court count can't change now: play has started" }),
  })

  renderAt(1)

  fireEvent.change(await screen.findByLabelText(/court count/i), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/can't change now/)
})

function mockPlayoffsNotStarted() {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
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
  mockSeedingPreview()
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  const generateBracket = vi.spyOn(api, 'generateBracket').mockResolvedValue([])

  renderAt(1)

  fireEvent.click(await screen.findByRole('button', { name: /generate bracket/i }))
  const dialog = await screen.findByRole('dialog', { name: 'Confirm playoff seeding' })
  const format = within(dialog).getByLabelText(/playoff format/i)
  expect(format).toHaveValue('single')
  fireEvent.change(format, { target: { value: 'double' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and generate' }))

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
  mockSeedingPreview()
  vi.spyOn(api, 'listPools').mockResolvedValue([])
  vi.spyOn(api, 'generateBracket').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'at least 2 teams are required to generate a bracket' }),
  })

  renderAt(1)

  await generateFromDialog()

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

test('signed out, the tournament is read-only', async () => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
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

test('shows a loading placeholder, not an empty page, until the tournament arrives', () => {
  vi.spyOn(api, 'getTournament').mockReturnValue(new Promise(() => {}))
  vi.spyOn(api, 'listTeams').mockReturnValue(new Promise(() => {}))

  renderAt(1)

  expect(screen.getByRole('status', { name: 'Loading tournament' })).toBeInTheDocument()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
})

test('a tournament that fails to load for another reason says so', async () => {
  vi.spyOn(api, 'getTournament').mockRejectedValue(new TypeError('Failed to fetch'))
  vi.spyOn(api, 'listTeams').mockRejectedValue(new TypeError('Failed to fetch'))

  renderAt(1)

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the server/i)
  expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
})

test('once pool matches have started the add-a-team form is off, with the reason', async () => {
  mockSettingsPage({ ...settings, pool_play_started: true })

  renderAt(1)

  const teams = await screen.findByRole('region', { name: /^Teams/ })
  expect(within(teams).getByLabelText(/team name/i)).toBeDisabled()
  expect(within(teams).getByRole('button', { name: 'Add team' })).toBeDisabled()
  expect(within(teams).getByText("Pool play has started, so teams can't be added.")).toBeInTheDocument()
})

test('the pool point cap is set from the pool play settings, and blank means no cap', async () => {
  mockSettingsPage({ ...settings, pool_point_cap: 0 })
  mockPreview()
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockResolvedValue({ ...settings, pool_point_cap: 21 })

  renderAt(1)

  const cap = await screen.findByLabelText(/pool point cap/i)
  expect(cap).toHaveValue(null)
  expect(cap.closest('fieldset')).toHaveTextContent('Pool play')
  fireEvent.change(cap, { target: { value: '21' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(updateTournament).toHaveBeenCalledWith('1', { pool_point_cap: 21 }))
  await waitFor(() => expect(screen.getByLabelText(/pool point cap/i)).toHaveValue(21))

  fireEvent.change(screen.getByLabelText(/pool point cap/i), { target: { value: '' } })
  updateTournament.mockResolvedValue({ ...settings, pool_point_cap: 0 })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(updateTournament).toHaveBeenLastCalledWith('1', { pool_point_cap: 0 }))
})

test('the losers bracket and grand final best-of are chosen separately, defaulting to the winners bracket’s', async () => {
  mockSettingsPage({ ...settings, playoff_best_of: 3, playoff_best_of_losers: 0, playoff_best_of_final: 0 })
  mockPreview()
  const updateTournament = vi
    .spyOn(api, 'updateTournament')
    .mockImplementation(async (id, values) => ({ ...settings, ...values }))

  renderAt(1)

  const losers = await screen.findByLabelText(/losers bracket best-of/i)
  expect(losers).toHaveValue('0')
  expect([...losers.options].map((option) => option.textContent)).toEqual([
    'Same as winners',
    '1',
    '3',
    '5',
    '7',
  ])
  fireEvent.change(losers, { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText(/grand final best-of/i), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(updateTournament).toHaveBeenCalledWith('1', {
      playoff_best_of_losers: 1,
      playoff_best_of_final: 5,
    }),
  )
})
