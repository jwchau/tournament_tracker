import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import * as api from './api'

let fetchMock

function jsonResponse(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

beforeEach(() => {
  api.clearApiCache()
  fetchMock = vi.fn((path) => jsonResponse({ path }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function networkHits(pathSuffix) {
  return fetchMock.mock.calls.filter(([path]) => path.endsWith(pathSuffix)).length
}

test('loading the same page data twice is a cache hit, not a second API call', async () => {
  const first = await api.getTournament(1)
  const second = await api.getTournament(1)

  expect(second).toEqual(first)
  expect(networkHits('/tournaments/1')).toBe(1)
})

test('any write clears the cache so the next page load gets fresh data', async () => {
  await api.listTeams(1)
  await api.getTournament(1)

  await api.createTeam(1, { name: 'Ice Wolves' })
  await api.listTeams(1)
  await api.getTournament(1)

  expect(networkHits('/tournaments/1/teams')).toBe(3) // load, POST, reload
  expect(networkHits('/tournaments/1')).toBe(2)
})

test('a failed load is not cached, so the next visit retries the API', async () => {
  fetchMock.mockImplementationOnce(() => jsonResponse({ detail: 'down' }, 500))

  await expect(api.getPool(3)).rejects.toMatchObject({ status: 500 })
  expect((await api.getPool(3)).path).toMatch(/\/pools\/3$/)

  expect(networkHits('/pools/3')).toBe(2)
})

test('live data that pages poll always hits the API', async () => {
  for (let i = 0; i < 2; i++) {
    await api.getBracket(1)
    await api.getPoolMatches(3)
    await api.getPoolStandings(3)
    await api.getMatch(9)
  }

  expect(networkHits('/tournaments/1/bracket')).toBe(2)
  expect(networkHits('/pools/3/matches')).toBe(2)
  expect(networkHits('/pools/3/standings')).toBe(2)
  expect(networkHits('/matches/9')).toBe(2)
})

async function reloadPage() {
  // A browser refresh wipes in-memory state; sessionStorage survives it.
  vi.resetModules()
  return import('./api')
}

test('a page reload in the same tab reuses cached page data', async () => {
  await api.getTeam(10)

  const reloaded = await reloadPage()
  const team = await reloaded.getTeam(10)

  expect(team.path).toMatch(/\/teams\/10$/)
  expect(networkHits('/teams/10')).toBe(1)
})

test('after a write, a reload fetches fresh data instead of the stored copy', async () => {
  await api.listPlayers(10)
  await api.createPlayer(10, { name: 'Alex Kim' })

  const reloaded = await reloadPage()
  await reloaded.listPlayers(10)

  expect(networkHits('/teams/10/players')).toBe(3) // load, POST, reload
})
