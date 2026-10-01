import { expect, test } from 'vitest'

import { bestOfFor, bestOfLabel, bestOfSettings, pointCapsFor } from './bracketModel'

const tournament = { playoff_best_of: 3, playoff_best_of_losers: 0, playoff_best_of_final: 0 }

test('the losers bracket and grand final follow the winners best-of until set', () => {
  expect(bestOfSettings(tournament)).toMatchObject({ winners: 3, losers: 3, grand_final: 3 })
  expect(
    bestOfSettings({ ...tournament, playoff_best_of_losers: 1, playoff_best_of_final: 5 }),
  ).toMatchObject({ winners: 3, losers: 1, grand_final: 5 })
})

test('a tournament without the settings plays single games', () => {
  expect(bestOfSettings({})).toMatchObject({ winners: 1, losers: 1, grand_final: 1 })
})

test('a match plays the best-of of its own section', () => {
  const bestOf = { winners: 3, losers: 1, grand_final: 5 }

  expect(bestOfFor(bestOf, { bracket: 'winners' })).toBe(3)
  expect(bestOfFor(bestOf, { bracket: 'losers' })).toBe(1)
  expect(bestOfFor(bestOf, { bracket: 'grand_final' })).toBe(5)
  expect(bestOfFor(bestOf, {})).toBe(3)
})

test('a single number is every match’s best-of', () => {
  expect(bestOfFor(3, { bracket: 'losers' })).toBe(3)
  expect(bestOfFor(undefined, { bracket: 'losers' })).toBe(1)
})

test('the bracket header names the best-of of each section that differs', () => {
  const mixed = { winners: 3, losers: 1, grand_final: 5 }

  expect(bestOfLabel({ winners: 1, losers: 1, grand_final: 1 }, 'double')).toBe('')
  expect(bestOfLabel({ winners: 3, losers: 3, grand_final: 3 }, 'double')).toBe('best of 3')
  expect(bestOfLabel(mixed, 'double')).toBe('winners best of 3 · losers best of 1 · final best of 5')
  expect(bestOfLabel(mixed, 'single')).toBe('best of 3')
})

test('the settings carry the playoff point caps, and a match gets the caps of its own sets', () => {
  const bestOf = bestOfSettings({
    playoff_best_of: 3,
    playoff_best_of_losers: 1,
    playoff_best_of_final: 0,
    playoff_point_caps: [21, 21, 15],
  })

  expect(bestOf.pointCaps).toEqual({
    winners: [21, 21, 15],
    losers: [21, 21, 15],
    grand_final: [21, 21, 15],
  })
  expect(pointCapsFor(bestOf, { bracket: 'winners' })).toEqual([21, 21, 15])
  expect(pointCapsFor(bestOf, { bracket: 'losers' })).toEqual([21])
  expect(pointCapsFor(bestOfSettings({}), { bracket: 'winners' })).toEqual([])
  expect(pointCapsFor(3, {})).toEqual([])
})

test('the losers bracket and grand final use their own caps once set, and the winners caps until then', () => {
  const bestOf = bestOfSettings({
    playoff_best_of: 3,
    playoff_best_of_losers: 3,
    playoff_best_of_final: 5,
    playoff_point_caps: [21, 21, 15],
    playoff_point_caps_losers: [],
    playoff_point_caps_final: [11, 11],
  })

  expect(pointCapsFor(bestOf, { bracket: 'winners' })).toEqual([21, 21, 15])
  // Own caps with none set means no cap, not the winners' caps.
  expect(pointCapsFor(bestOf, { bracket: 'losers' })).toEqual([])
  expect(pointCapsFor(bestOf, { bracket: 'grand_final' })).toEqual([11, 11])
})
