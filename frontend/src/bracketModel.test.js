import { expect, test } from 'vitest'

import { bestOfFor, bestOfLabel, bestOfSettings } from './bracketModel'

const tournament = { playoff_best_of: 3, playoff_best_of_losers: 0, playoff_best_of_final: 0 }

test('the losers bracket and grand final follow the winners best-of until set', () => {
  expect(bestOfSettings(tournament)).toEqual({ winners: 3, losers: 3, grand_final: 3 })
  expect(
    bestOfSettings({ ...tournament, playoff_best_of_losers: 1, playoff_best_of_final: 5 }),
  ).toEqual({ winners: 3, losers: 1, grand_final: 5 })
})

test('a tournament without the settings plays single games', () => {
  expect(bestOfSettings({})).toEqual({ winners: 1, losers: 1, grand_final: 1 })
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
