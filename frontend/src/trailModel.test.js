import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { ancestorsOf, labelOf, pageOf } from './trailModel'

beforeEach(() => {
  vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 1, name: 'Spring Classic' })
  vi.spyOn(api, 'getPool').mockImplementation(async (id) => ({
    id: Number(id),
    tournament_id: id === '70' ? 2 : 1,
    name: 'Pool A',
  }))
  vi.spyOn(api, 'getPlayoffBracket').mockResolvedValue({ id: 5, tournament_id: 1, tier: 2 })
  vi.spyOn(api, 'getTeam').mockResolvedValue({ id: 10, tournament_id: 1, name: 'Ice Wolves' })
  vi.spyOn(api, 'listCourts').mockResolvedValue([
    { court: 1, pool_id: null, playoff_bracket_id: 5 },
    { court: 2, pool_id: 7, playoff_bracket_id: null },
    { court: 3, pool_id: null, playoff_bracket_id: null },
  ])
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('every route is a known page, anything else is not', () => {
  expect(pageOf('/')).toEqual({ kind: 'home' })
  expect(pageOf('/tournaments/1/courts/2')).toEqual({
    kind: 'court',
    tournamentId: '1',
    court: '2',
  })
  expect(pageOf('/pools/7')).toEqual({ kind: 'pool', id: '7' })
  expect(pageOf('/nowhere')).toEqual({ kind: 'other' })
})

test('pools, brackets and teams sit under their tournament, the courts list too', async () => {
  const underTournament = ['/', '/tournaments/1']
  expect(await ancestorsOf('/')).toEqual([])
  expect(await ancestorsOf('/tournaments/1')).toEqual(['/'])
  expect(await ancestorsOf('/pools/7')).toEqual(underTournament)
  expect(await ancestorsOf('/brackets/5')).toEqual(underTournament)
  expect(await ancestorsOf('/teams/10')).toEqual(underTournament)
  expect(await ancestorsOf('/tournaments/1/courts')).toEqual(underTournament)
})

test('the Users page is named in the trail and sits under Home', async () => {
  expect(await labelOf('/users')).toBe('Users')
  expect(await ancestorsOf('/users')).toEqual(['/'])
})

test('pages outside the tree, and ones whose data cannot load, sit under Home', async () => {
  api.getTeam.mockRejectedValue(new Error('not found'))

  expect(await ancestorsOf('/account')).toEqual(['/'])
  expect(await ancestorsOf('/nowhere')).toEqual(['/'])
  expect(await ancestorsOf('/teams/99')).toEqual(['/'])
})

test('a court sits under the page it was opened from', async () => {
  expect(await ancestorsOf('/tournaments/1/courts/3', '/pools/7')).toEqual([
    '/',
    '/tournaments/1',
    '/pools/7',
  ])
  expect(await ancestorsOf('/tournaments/1/courts/2', '/brackets/5')).toEqual([
    '/',
    '/tournaments/1',
    '/brackets/5',
  ])
  expect(await ancestorsOf('/tournaments/1/courts/2', '/tournaments/1/courts')).toEqual([
    '/',
    '/tournaments/1',
    '/tournaments/1/courts',
  ])
  expect(api.listCourts).not.toHaveBeenCalled()
})

test('opened any other way, a court sits under what is using it, else the courts list', async () => {
  expect(await ancestorsOf('/tournaments/1/courts/2')).toEqual(['/', '/tournaments/1', '/pools/7'])
  expect(await ancestorsOf('/tournaments/1/courts/1', '/')).toEqual([
    '/',
    '/tournaments/1',
    '/brackets/5',
  ])
  expect(await ancestorsOf('/tournaments/1/courts/3')).toEqual([
    '/',
    '/tournaments/1',
    '/tournaments/1/courts',
  ])
  // A pool of another tournament isn't a parent.
  expect(await ancestorsOf('/tournaments/1/courts/2', '/pools/70')).toEqual([
    '/',
    '/tournaments/1',
    '/pools/7',
  ])
})

test('names come from the page data, with a placeholder when it is blank or missing', async () => {
  expect(await labelOf('/')).toBe('Home')
  expect(await labelOf('/tournaments/1')).toBe('Spring Classic')
  expect(await labelOf('/pools/7')).toBe('Pool A')
  expect(await labelOf('/brackets/5')).toBe('Bracket 2')
  expect(await labelOf('/teams/10')).toBe('Ice Wolves')
  expect(await labelOf('/tournaments/1/courts')).toBe('Courts')
  expect(await labelOf('/tournaments/1/courts/3')).toBe('Court 3')
  expect(await labelOf('/account')).toBe('Account')

  api.getTournament.mockResolvedValue({ id: 1, name: '  ' })
  api.getTeam.mockRejectedValue(new Error('not found'))
  expect(await labelOf('/tournaments/1')).toBe('Tournament')
  expect(await labelOf('/teams/10')).toBe('Team')
})
