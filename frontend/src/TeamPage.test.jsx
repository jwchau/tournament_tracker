import { fireEvent, render, screen } from './testUtils'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { NotificationProvider } from './NotificationContext'
import TeamPage from './TeamPage'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAt(teamId) {
  return render(
    <MemoryRouter initialEntries={[`/teams/${teamId}`]}>
      <NotificationProvider>
        <Routes>
          <Route path="/teams/:teamId" element={<TeamPage />} />
          <Route path="/tournaments/:tournamentId" element={<h2>Tournament page</h2>} />
        </Routes>
      </NotificationProvider>
    </MemoryRouter>,
  )
}

function mockAces() {
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Aces', seed: 3 })
  vi.spyOn(api, 'listPlayers').mockResolvedValue([])
}

function refusal(detail) {
  return { json: () => Promise.resolve({ detail }) }
}

test('editing the seed saves it', async () => {
  mockAces()
  const updateTeam = vi
    .spyOn(api, 'updateTeam')
    .mockResolvedValue({ id: 10, tournament_id: 1, name: 'Aces', seed: 1 })

  renderAt(10)

  fireEvent.change(await screen.findByLabelText('Seed'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  expect(await screen.findByText('Team updated')).toBeInTheDocument()
  expect(updateTeam).toHaveBeenCalledWith('10', { name: 'Aces', seed: 1 })
  expect(screen.getByLabelText('Seed')).toHaveValue(1)
})

test('a refused seed change shows the reason', async () => {
  mockAces()
  vi.spyOn(api, 'updateTeam').mockRejectedValue(
    refusal('play has started, so seeds can no longer change'),
  )

  renderAt(10)

  fireEvent.change(await screen.findByLabelText('Seed'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/play has started/)
})

test('deleting the team asks first, then returns to the tournament', async () => {
  mockAces()
  const deleteTeam = vi.spyOn(api, 'deleteTeam').mockResolvedValue(undefined)

  renderAt(10)

  fireEvent.click(await screen.findByRole('button', { name: /delete team/i }))
  expect(screen.getByRole('dialog', { name: /delete team/i })).toHaveTextContent(/Aces/)
  expect(deleteTeam).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

  expect(await screen.findByText('Tournament page')).toBeInTheDocument()
  expect(deleteTeam).toHaveBeenCalledWith('10')
})

test('a team that cannot be deleted says why and stays open', async () => {
  mockAces()
  vi.spyOn(api, 'deleteTeam').mockRejectedValue(
    refusal("brackets already exist, so teams can't be deleted"),
  )

  renderAt(10)

  fireEvent.click(await screen.findByRole('button', { name: /delete team/i }))
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/brackets already exist/)
  expect(screen.getByDisplayValue('Aces')).toBeInTheDocument()
})

test('loads the team and its roster', async () => {
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Ice Wolves' })
  vi.spyOn(api, 'listPlayers').mockResolvedValue([
    { id: 100, team_id: 10, name: 'Alex Kim' },
    { id: 101, team_id: 10, name: 'Jordan Lee' },
  ])

  renderAt(10)

  expect(await screen.findByDisplayValue('Ice Wolves')).toBeInTheDocument()
  expect(await screen.findByText('Alex Kim')).toBeInTheDocument()
  expect(screen.getByText('Jordan Lee')).toBeInTheDocument()
})

test('editing the team name submits the update', async () => {
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Ice Wolves' })
  vi.spyOn(api, 'listPlayers').mockResolvedValue([])
  const updateTeam = vi
    .spyOn(api, 'updateTeam')
    .mockResolvedValue({ id: 10, tournament_id: 1, name: 'Snow Wolves' })

  renderAt(10)

  const nameInput = await screen.findByDisplayValue('Ice Wolves')
  fireEvent.change(nameInput, { target: { value: 'Snow Wolves' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  expect(await screen.findByDisplayValue('Snow Wolves')).toBeInTheDocument()
  expect(updateTeam).toHaveBeenCalledWith('10', { name: 'Snow Wolves' })
})

test('removing a player calls the delete endpoint and removes them from the list', async () => {
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Ice Wolves' })
  vi.spyOn(api, 'listPlayers').mockResolvedValue([
    { id: 100, team_id: 10, name: 'Alex Kim' },
    { id: 101, team_id: 10, name: 'Jordan Lee' },
  ])
  const deletePlayer = vi.spyOn(api, 'deletePlayer').mockResolvedValue(undefined)

  renderAt(10)

  await screen.findByText('Alex Kim')
  fireEvent.click(screen.getByRole('button', { name: /remove alex kim/i }))

  expect(deletePlayer).toHaveBeenCalledWith('10', 100)
  expect(await screen.findByText('Jordan Lee')).toBeInTheDocument()
  expect(screen.queryByText('Alex Kim')).not.toBeInTheDocument()
})

test('signed out, the team and roster are read-only', async () => {
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Ice Wolves' })
  vi.spyOn(api, 'listPlayers').mockResolvedValue([{ id: 100, team_id: 10, name: 'Alex Kim' }])

  render(
    <MemoryRouter initialEntries={['/teams/10']}>
      <Routes>
        <Route path="/teams/:teamId" element={<TeamPage />} />
      </Routes>
    </MemoryRouter>,
    { user: null },
  )

  expect(await screen.findByRole('heading', { name: 'Ice Wolves' })).toBeInTheDocument()
  expect(await screen.findByText('Alex Kim')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
test('shows a loading placeholder until the team arrives, then the team', async () => {
  let resolveTeam
  vi.spyOn(api, 'getTeam').mockReturnValue(new Promise((resolve) => (resolveTeam = resolve)))
  vi.spyOn(api, 'listPlayers').mockResolvedValue([])

  renderAt(10)

  expect(screen.getByRole('status', { name: 'Loading team' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Roster' })).not.toBeInTheDocument()

  resolveTeam({ id: 10, tournament_id: 1, name: 'Aces', seed: 3 })

  expect(await screen.findByDisplayValue('Aces')).toBeInTheDocument()
  expect(screen.queryByRole('status', { name: 'Loading team' })).not.toBeInTheDocument()
})

test('says so when the team does not exist', async () => {
  vi.spyOn(api, 'getTeam').mockRejectedValue({ status: 404 })
  vi.spyOn(api, 'listPlayers').mockRejectedValue({ status: 404 })

  renderAt(999)

  expect(await screen.findByRole('heading', { name: 'Team not found' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /all tournaments/i })).toHaveAttribute('href', '/')
})
