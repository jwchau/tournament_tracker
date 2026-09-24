import { fireEvent, render, screen } from './testUtils'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import TeamPage from './TeamPage'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAt(teamId) {
  return render(
    <MemoryRouter initialEntries={[`/teams/${teamId}`]}>
      <Routes>
        <Route path="/teams/:teamId" element={<TeamPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

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