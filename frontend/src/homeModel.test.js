import { expect, test } from 'vitest'

import { createdAt, groupTournaments, shortDate, tournamentName } from './homeModel'

// Noon on Sep 28 2026, local time.
const now = new Date(2026, 8, 28, 12)
const at = (day, hour = 10) => new Date(2026, 8, day, hour).toISOString().replace('Z', '')

test('the server’s zoneless timestamps are read as UTC', () => {
  expect(createdAt({ created_at: '2026-09-25T05:27:05' }).toISOString()).toBe(
    '2026-09-25T05:27:05.000Z',
  )
  expect(createdAt({ created_at: '2026-09-25T05:27:05Z' }).toISOString()).toBe(
    '2026-09-25T05:27:05.000Z',
  )
  expect(createdAt({})).toBeNull()
  expect(createdAt({ created_at: 'not a date' })).toBeNull()
})

test('tournaments group into Today, This week and Earlier, leaving out empty groups', () => {
  const groups = groupTournaments(
    [
      { id: 1, stage: 'draft', created_at: at(28) },
      { id: 2, stage: 'draft', created_at: at(22) },
      { id: 3, stage: 'draft', created_at: at(21) },
      { id: 4, stage: 'draft', created_at: at(2) },
    ],
    now,
  )

  expect(groups.map((group) => [group.label, group.tournaments.map((t) => t.id)])).toEqual([
    ['Today', [1]],
    ['This week', [2]],
    ['Earlier', [3, 4]],
  ])
  expect(groupTournaments([{ id: 2, created_at: at(22) }], now).map((g) => g.label)).toEqual([
    'This week',
  ])
})

test('a tournament without a date, like one just created, counts as today', () => {
  const [today] = groupTournaments([{ id: 9, stage: 'draft' }], now)

  expect(today.label).toBe('Today')
})

test('within a group, tournaments in play come first, then drafts, then finished, newest first', () => {
  const [today] = groupTournaments(
    [
      { id: 1, stage: 'complete', created_at: at(28, 11) },
      { id: 2, stage: 'draft', created_at: at(28, 9) },
      { id: 3, stage: 'draft', created_at: at(28, 10) },
      { id: 4, stage: 'playoffs', created_at: at(28, 8) },
      { id: 5, stage: 'pool_play', created_at: at(28, 7) },
    ],
    now,
  )

  expect(today.tournaments.map((t) => t.id)).toEqual([4, 5, 3, 2, 1])
})

test('dates show the year only when it isn’t this one', () => {
  expect(shortDate(new Date(2026, 8, 26), now)).not.toMatch(/2026/)
  expect(shortDate(new Date(2025, 8, 26), now)).toMatch(/2025/)
})

test('a blank name shows as Untitled tournament', () => {
  expect(tournamentName({ name: '  ' })).toBe('Untitled tournament')
  expect(tournamentName({ name: 'Spring Classic' })).toBe('Spring Classic')
})
