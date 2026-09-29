import { fireEvent, render, screen, within } from './testUtils'
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

  fireEvent.click(await screen.findByRole('button', { name: 'New tournament' }))
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
  expect(screen.queryByRole('button', { name: /create|new tournament/i })).not.toBeInTheDocument()
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

  fireEvent.click(await screen.findByRole('button', { name: 'New tournament' }))
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

const iso = (date) => date.toISOString().replace('Z', '')
const daysAgo = (days) => iso(new Date(Date.now() - days * 24 * 60 * 60 * 1000))

function renderPage(tournaments, options) {
  vi.spyOn(api, 'listTournaments').mockResolvedValue(tournaments)
  return render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
    options,
  )
}

test('today’s tournaments lead as large cards; earlier ones are dated rows under their group', async () => {
  renderPage([
    { id: 1, name: 'Spring Classic', team_count: 8, stage: 'pool_play', created_at: iso(new Date()) },
    { id: 2, name: 'Fall Open', team_count: 6, stage: 'draft', created_at: daysAgo(3) },
    { id: 3, name: 'Summer Cup', team_count: 8, stage: 'complete', created_at: daysAgo(40), champion_name: 'Ice Wolves' },
  ])

  const today = (await screen.findByRole('heading', { name: 'Today' })).closest('section')
  expect(within(today).getByRole('link', { name: 'Spring Classic' })).toHaveClass('today-name')
  const week = screen.getByRole('heading', { name: 'This week' }).closest('section')
  expect(within(week).getByRole('link', { name: 'Fall Open' })).toHaveClass('dated-name')
  const earlier = screen.getByRole('heading', { name: 'Earlier' }).closest('section')
  const summer = within(earlier).getByRole('link', { name: 'Summer Cup' }).closest('li')
  expect(summer).toHaveTextContent('Champion Ice Wolves')
  expect(within(summer).getByText('Ice Wolves').tagName).toBe('STRONG')
})

test('a tournament in play links to its courts; drafts and finished ones don’t', async () => {
  const now = iso(new Date())
  renderPage([
    { id: 1, name: 'Spring Classic', team_count: 8, stage: 'playoffs', created_at: now },
    { id: 2, name: 'Fall Open', team_count: 6, stage: 'draft', created_at: now },
  ])

  await screen.findByRole('link', { name: 'Spring Classic' })
  const courts = screen.getAllByRole('link', { name: 'Courts' })
  expect(courts).toHaveLength(1)
  expect(courts[0]).toHaveAttribute('href', '/tournaments/1/courts')
})

test('New tournament opens the form, Cancel closes it, and a created one lands under Today', async () => {
  vi.spyOn(api, 'createTournament').mockResolvedValue({
    id: 5,
    name: 'Winter Cup',
    stage: 'draft',
    created_at: iso(new Date()),
  })
  renderPage([{ id: 2, name: 'Fall Open', team_count: 6, stage: 'draft', created_at: daysAgo(3) }])

  fireEvent.click(await screen.findByRole('button', { name: 'New tournament' }))
  expect(screen.getByLabelText(/tournament name/i)).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByLabelText(/tournament name/i)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'New tournament' }))
  fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: 'Winter Cup' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))

  const today = (await screen.findByRole('heading', { name: 'Today' })).closest('section')
  expect(within(today).getByRole('link', { name: 'Winter Cup' })).toBeInTheDocument()
  expect(screen.queryByLabelText(/tournament name/i)).not.toBeInTheDocument()
})

test('Create waits for a name', async () => {
  renderPage([])

  fireEvent.click(await screen.findByRole('button', { name: 'New tournament' }))

  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/tournament name/i), { target: { value: '   ' } })
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
})

test('with no tournaments, says so and points an organizer at New tournament', async () => {
  renderPage([])

  expect(await screen.findByText(/No tournaments yet\. Start one with New tournament\./)).toBeInTheDocument()
})

test('a tournament with a blank name still has a link to follow', async () => {
  renderPage([{ id: 7, name: '', team_count: 0, stage: 'draft', created_at: iso(new Date()) }])

  expect(await screen.findByRole('link', { name: 'Untitled tournament' })).toHaveAttribute(
    'href',
    '/tournaments/7',
  )
})

test('a tournament finished today names its champion in the banner’s words', async () => {
  renderPage([
    {
      id: 3,
      name: 'Summer Cup',
      team_count: 8,
      stage: 'complete',
      created_at: iso(new Date()),
      champion_name: 'Ice Wolves',
    },
  ])

  const card = (await screen.findByRole('link', { name: 'Summer Cup' })).closest('li')
  expect(card).toHaveTextContent('Ice Wolves win the tournament')
  expect(card).not.toHaveAttribute('data-live')
})

test('a tournament being played today is marked live', async () => {
  renderPage([
    { id: 1, name: 'Spring Classic', team_count: 8, stage: 'pool_play', created_at: iso(new Date()) },
  ])

  const card = (await screen.findByRole('link', { name: 'Spring Classic' })).closest('li')
  expect(card).toHaveAttribute('data-live')
})
