import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('navigating from the main page to a tournament page and back to a team page', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue({ id: 1, username: 'organizer' })
  vi.spyOn(api, 'listTournaments').mockResolvedValue([
    { id: 1, name: 'Spring Classic', team_count: 1 },
  ])
  vi.spyOn(api, 'getTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 1,
  })
  vi.spyOn(api, 'listTeams').mockResolvedValue([{ id: 10, tournament_id: 1, name: 'Ice Wolves' }])
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Ice Wolves' })
  vi.spyOn(api, 'listPlayers').mockResolvedValue([])

  render(<App />)

  fireEvent.click(await screen.findByRole('link', { name: /spring classic/i }))
  fireEvent.click(await screen.findByRole('link', { name: /ice wolves/i }))

  expect(await screen.findByDisplayValue('Ice Wolves')).toBeInTheDocument()
})

const pageData = {
  '/health': { status: 'ok' },
  '/auth/me': { id: 1, username: 'organizer' },
  '/tournaments': [{ id: 1, name: 'Spring Classic', team_count: 1 }],
  '/tournaments/1': {
    id: 1,
    name: 'Spring Classic',
    settings_confirmed: true,
    advance_per_pool: 1,
    playoff_bracket_count: 1,
    court_count: 1,
  },
  '/tournaments/1/teams': [{ id: 10, tournament_id: 1, name: 'Ice Wolves', pool_id: 7, player_count: 0 }],
  '/tournaments/1/pools': [{ id: 7, tournament_id: 1, name: 'Pool A', courts: [1] }],
  '/tournaments/1/playoff-brackets': [],
  '/tournaments/1/playoff-readiness': { ready: false, reason: 'Pool A has no schedule yet' },
  '/pools/7': { id: 7, tournament_id: 1, name: 'Pool A', courts: [1] },
  '/pools/7/matches': [],
  '/pools/7/standings': [],
  '/teams/10': { id: 10, tournament_id: 1, name: 'Ice Wolves' },
  '/teams/10/players': [],
}

test('moving between pages reuses loaded data instead of refetching it', async () => {
  api.clearApiCache()
  window.history.pushState({}, '', '/')
  const fetchMock = vi.fn((url) => {
    const path = new URL(url, 'http://localhost').pathname
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pageData[path]) })
  })
  vi.stubGlobal('fetch', fetchMock)
  const hits = (path) =>
    fetchMock.mock.calls.filter(([url]) => new URL(url, 'http://localhost').pathname === path)
      .length

  render(<App />)

  // home -> tournament -> team -> home -> tournament -> pool -> tournament -> home
  fireEvent.click(await screen.findByRole('link', { name: 'Spring Classic' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Ice Wolves' }))
  await screen.findByDisplayValue('Ice Wolves')
  fireEvent.click(screen.getByRole('link', { name: 'Home' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Spring Classic' }))
  fireEvent.click(await screen.findByRole('link', { name: 'Open Pool A' }))
  fireEvent.click(await screen.findByRole('link', { name: /back to tournament/i }))
  await screen.findByRole('link', { name: 'Open Pool A' })
  fireEvent.click(screen.getByRole('link', { name: 'Home' }))
  await screen.findByRole('link', { name: 'Spring Classic' })

  // Each page's data came from the API once; every revisit was a cache hit.
  for (const path of [
    '/tournaments',
    '/tournaments/1',
    '/tournaments/1/teams',
    '/tournaments/1/pools',
    '/tournaments/1/playoff-brackets',
    '/pools/7',
    '/teams/10',
    '/teams/10/players',
  ]) {
    expect({ path, hits: hits(path) }).toEqual({ path, hits: 1 })
  }
})

test('revisiting team and pool pages loads their data from the cache', async () => {
  api.clearApiCache()
  window.history.pushState({}, '', '/tournaments/1')
  const fetchMock = vi.fn((url) => {
    const path = new URL(url, 'http://localhost').pathname
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pageData[path]) })
  })
  vi.stubGlobal('fetch', fetchMock)
  const hits = (path) =>
    fetchMock.mock.calls.filter(([url]) => new URL(url, 'http://localhost').pathname === path)
      .length

  render(<App />)

  for (let visit = 0; visit < 3; visit++) {
    fireEvent.click(await screen.findByRole('link', { name: 'Ice Wolves' }))
    await screen.findByDisplayValue('Ice Wolves')
    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Spring Classic' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Open Pool A' }))
    fireEvent.click(await screen.findByRole('link', { name: /back to tournament/i }))
  }
  await screen.findByRole('link', { name: 'Open Pool A' })

  // Three visits each, one API call each.
  expect(hits('/teams/10')).toBe(1)
  expect(hits('/teams/10/players')).toBe(1)
  expect(hits('/pools/7')).toBe(1)
})
