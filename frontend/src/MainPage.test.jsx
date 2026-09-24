import { fireEvent, render, screen } from './testUtils'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import MainPage from './MainPage'
import { NotificationProvider } from './NotificationContext'

afterEach(() => {
  vi.restoreAllMocks()
})

test('renders each tournament with its name and team count, linking to its page', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([
    { id: 1, name: 'Spring Classic', team_count: 3 },
    { id: 2, name: 'Fall Invitational', team_count: 0 },
  ])

  render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
  )

  const link = await screen.findByRole('link', { name: /spring classic/i })
  expect(link).toHaveAttribute('href', '/tournaments/1')
  expect(screen.getByText(/3 teams/i)).toBeInTheDocument()

  const otherLink = screen.getByRole('link', { name: /fall invitational/i })
  expect(otherLink).toHaveAttribute('href', '/tournaments/2')
  expect(screen.getByText(/0 teams/i)).toBeInTheDocument()
})

test('creating a tournament adds it to the list', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([])
  vi.spyOn(api, 'createTournament').mockResolvedValue({
    id: 5,
    name: 'Winter Cup',
    team_count: 0,
  })

  render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
  )

  fireEvent.change(screen.getByLabelText(/tournament name/i), {
    target: { value: 'Winter Cup' },
  })
  fireEvent.click(screen.getByRole('button', { name: /create/i }))

  expect(await screen.findByRole('link', { name: /winter cup/i })).toBeInTheDocument()
})

test('signed out, the tournaments are listed but there is no create form', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([{ id: 1, name: 'Spring Classic', team_count: 3 }])

  render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
    { user: null },
  )

  expect(await screen.findByRole('link', { name: /spring classic/i })).toBeInTheDocument()
  expect(screen.queryByLabelText(/tournament name/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
})

test('shows each tournament\'s stage', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([
    { id: 1, name: 'Spring Classic', team_count: 8, stage: 'pool_play' },
    { id: 2, name: 'Fall Invitational', team_count: 4, stage: 'complete' },
  ])

  render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
  )

  const spring = (await screen.findByRole('link', { name: /spring classic/i })).closest('li')
  expect(spring).toHaveTextContent('Pool play')
  const fall = screen.getByRole('link', { name: /fall invitational/i }).closest('li')
  expect(fall).toHaveTextContent('Complete')
})

test('a new tournament starts in the draft stage in the list', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([])
  vi.spyOn(api, 'createTournament').mockResolvedValue({ id: 5, name: 'Winter Cup', stage: 'draft' })

  render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
  )

  fireEvent.change(screen.getByLabelText(/tournament name/i), {
    target: { value: 'Winter Cup' },
  })
  fireEvent.click(screen.getByRole('button', { name: /create/i }))

  const created = (await screen.findByRole('link', { name: /winter cup/i })).closest('li')
  expect(created).toHaveTextContent('Draft')
})

test('shows a loading placeholder in place of the list until the tournaments arrive', async () => {
  let resolveTournaments
  vi.spyOn(api, 'listTournaments').mockReturnValue(
    new Promise((resolve) => (resolveTournaments = resolve)),
  )

  render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
  )

  expect(screen.getByRole('status', { name: 'Loading tournaments' })).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()

  resolveTournaments([{ id: 1, name: 'Spring Classic', team_count: 3 }])

  expect(await screen.findByRole('link', { name: /spring classic/i })).toBeInTheDocument()
  expect(screen.queryByRole('status', { name: 'Loading tournaments' })).not.toBeInTheDocument()
})

test('says so when the tournaments fail to load', async () => {
  vi.spyOn(api, 'listTournaments').mockRejectedValue(new TypeError('Failed to fetch'))

  render(
    <MemoryRouter>
      <NotificationProvider>
        <MainPage />
      </NotificationProvider>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the server/i)
})
