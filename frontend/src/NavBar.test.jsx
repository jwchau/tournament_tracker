import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import * as api from './api'
import AuthProvider from './AuthProvider'
import NavBar from './NavBar'
import { NotificationProvider } from './NotificationContext'
import { PageTrailProvider } from './PageTrailContext'

beforeEach(() => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 1, name: 'Spring Classic' })
  vi.spyOn(api, 'getPool').mockResolvedValue({ id: 7, tournament_id: 1, name: 'Pool A' })
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 5, tournament_id: 1, tier: 1 })
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Ice Wolves' })
  vi.spyOn(api, 'listCourts').mockResolvedValue([{ court: 2, pool_id: 7, playoff_bracket_id: null }])
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Stand-ins for the app's pages, each with the links the real one has.
function Page({ title, links = [] }) {
  return (
    <main>
      <h2>{title}</h2>
      {links.map(([label, to]) => (
        <Link key={to} to={to}>
          {label}
        </Link>
      ))}
    </main>
  )
}

function renderApp(initialPath = '/') {
  // Strict, as in the app: effects run twice, which the trail has to survive.
  return render(
    <StrictMode>
    <MemoryRouter initialEntries={[initialPath]}>
      <NotificationProvider>
        <AuthProvider>
          <PageTrailProvider>
            <NavBar />
            <Routes>
              <Route path="/" element={<Page title="Home page" links={[['Spring Classic', '/tournaments/1']]} />} />
              <Route
                path="/tournaments/:id"
                element={
                  <Page
                    title="Tournament page"
                    links={[
                      ['Open Pool A', '/pools/7'],
                      ['Open Bracket 1', '/brackets/5'],
                      ['Courts (scorekeeper view)', '/tournaments/1/courts'],
                      ['Ice Wolves', '/teams/10'],
                    ]}
                  />
                }
              />
              <Route path="/pools/:id" element={<Page title="Pool page" links={[['Score on Court 2', '/tournaments/1/courts/2']]} />} />
              <Route path="/brackets/:id" element={<Page title="Bracket page" links={[['Score on Court 1', '/tournaments/1/courts/1']]} />} />
              <Route path="/tournaments/:id/courts" element={<Page title="Courts page" links={[['Court 3', '/tournaments/1/courts/3']]} />} />
              <Route path="/tournaments/:id/courts/:court" element={<Page title="Court page" />} />
              <Route path="/teams/:id" element={<Page title="Team page" />} />
              <Route path="/account" element={<Page title="Account page" />} />
            </Routes>
          </PageTrailProvider>
        </AuthProvider>
      </NotificationProvider>
    </MemoryRouter>
    </StrictMode>,
  )
}

// The trail as text: the current page starred, pages below it in brackets.
function trail() {
  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
  return within(nav)
    .getAllByRole('listitem')
    .map((item) => {
      const current = within(item).queryByText((_, node) => node?.getAttribute?.('aria-current') === 'page')
      const text = item.textContent + (current ? '*' : '')
      return item.classList.contains('trail-ahead') ? `(${text})` : text
    })
    .join(' › ')
}

async function expectTrail(expected) {
  await waitFor(() => expect(trail()).toBe(expected))
}

const follow = async (name) => fireEvent.click(await screen.findByRole('link', { name }))
const up = () => screen.getByRole('button', { name: /^Up/ })
const down = () => screen.getByRole('button', { name: /^Down/ })

test('home, tournament, pool, court: the trail follows each page’s place in the tree', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp()
  await expectTrail('Home*')
  expect(up()).toBeDisabled()
  expect(down()).toBeDisabled()

  await follow('Spring Classic')
  await expectTrail('Home › Spring Classic*')
  await follow('Open Pool A')
  await expectTrail('Home › Spring Classic › Pool A*')
  await follow('Score on Court 2')
  await expectTrail('Home › Spring Classic › Pool A › Court 2*')
  expect(up()).toHaveAccessibleName('Up to Pool A')
  expect(down()).toBeDisabled()
})

test('home, tournament, bracket, court', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp('/tournaments/1')

  await follow('Open Bracket 1')
  await follow('Score on Court 1')

  await expectTrail('Home › Spring Classic › Bracket 1 › Court 1*')
})

test('home, tournament, courts; a court opened from the list sits under it', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp('/tournaments/1')

  await follow('Courts (scorekeeper view)')
  await expectTrail('Home › Spring Classic › Courts*')
  await follow('Court 3')
  await expectTrail('Home › Spring Classic › Courts › Court 3*')
})

test('home, tournament, team', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp('/tournaments/1')

  await follow('Ice Wolves')

  await expectTrail('Home › Spring Classic › Ice Wolves*')
})

test('a court opened directly sits under what is using it', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp('/tournaments/1/courts/2')

  await expectTrail('Home › Spring Classic › Pool A › Court 2*')
})

test('the arrows move up the trail and back down the way the reader came', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp('/tournaments/1/courts/2')
  await expectTrail('Home › Spring Classic › Pool A › Court 2*')

  fireEvent.click(up())
  expect(await screen.findByText('Pool page')).toBeInTheDocument()
  await expectTrail('Home › Spring Classic › Pool A* › (Court 2)')
  fireEvent.click(screen.getByRole('button', { name: 'Up to Spring Classic' }))
  expect(await screen.findByText('Tournament page')).toBeInTheDocument()
  await expectTrail('Home › Spring Classic* › (Pool A) › (Court 2)')

  fireEvent.click(screen.getByRole('button', { name: 'Down to Pool A' }))
  expect(await screen.findByText('Pool page')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Down to Court 2' }))
  expect(await screen.findByText('Court page')).toBeInTheDocument()
  await expectTrail('Home › Spring Classic › Pool A › Court 2*')
  expect(down()).toBeDisabled()
})

test('a crumb moves along the trail; a new link drops the pages below', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp('/tournaments/1/courts/2')
  await expectTrail('Home › Spring Classic › Pool A › Court 2*')

  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
  fireEvent.click(within(nav).getByRole('link', { name: 'Spring Classic' }))
  await expectTrail('Home › Spring Classic* › (Pool A) › (Court 2)')

  await follow('Ice Wolves')
  await expectTrail('Home › Spring Classic › Ice Wolves*')
  expect(down()).toBeDisabled()
})

test('pages outside the tree sit under Home', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp('/account')

  await expectTrail('Home › Account*')
  expect(screen.getByRole('button', { name: 'Up to Home' })).toBeEnabled()
})

test('signed out, the nav bar offers to sign in and come back to this page', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)

  renderApp('/tournaments/1')

  const link = await screen.findByRole('link', { name: 'Sign in' })
  expect(link).toHaveAttribute('href', '/login?next=%2Ftournaments%2F1')
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

test('signed in, the nav bar shows the username and signs out', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue({ id: 1, username: 'organizer' })
  const logout = vi.spyOn(api, 'logout').mockResolvedValue(null)

  renderApp()

  expect(await screen.findByRole('link', { name: 'organizer' })).toHaveAttribute('href', '/account')
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

  expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  expect(logout).toHaveBeenCalled()
  expect(screen.queryByRole('link', { name: 'organizer' })).not.toBeInTheDocument()
})
