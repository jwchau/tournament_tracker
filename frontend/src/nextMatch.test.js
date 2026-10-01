import { expect, test } from 'vitest'

import { nextMatchFor } from './nextMatch'

const match = (id, fields = {}) => ({
  id,
  team1_name: `Team ${id}a`,
  team2_name: `Team ${id}b`,
  pool_id: null,
  playoff_bracket_id: null,
  ...fields,
})

const court = (number, fields = {}) => ({
  court: number,
  use: 'playoff',
  label: 'Bracket 2',
  now_playing: null,
  pool_id: null,
  playoff_bracket_id: 20,
  current: null,
  up_next: [],
  ...fields,
})

test('a court with a match on it has no next-match pointer', () => {
  const courts = [court(1, { current: match(1, { playoff_bracket_id: 20 }) }), court(2)]

  expect(nextMatchFor(courts, 1)).toBeNull()
})

test('an idle playoff court points to the court its own bracket is playing on, even a lent one', () => {
  // Bracket 1 is finished, so its court 1 is lent to bracket 2's semifinal; court 2 is bracket 2's own.
  const semifinal = match(5, { playoff_bracket_id: 20 })
  const courts = [
    court(1, { label: 'Bracket 1', now_playing: 'Bracket 2', playoff_bracket_id: 10, current: semifinal }),
    court(2),
  ]

  expect(nextMatchFor(courts, 2)).toEqual({ kind: 'on-court', court: 1, match: semifinal })
})

test('another bracket’s match on another court is not this court’s next match', () => {
  const courts = [
    court(1, { label: 'Bracket 1', playoff_bracket_id: 10, current: match(5, { playoff_bracket_id: 10 }) }),
    court(2),
  ]

  expect(nextMatchFor(courts, 2)).toBeNull()
})

test('an idle pool court points to a match of its own pool played elsewhere', () => {
  const moved = match(7, { pool_id: 3 })
  const courts = [
    court(1, { use: 'pool', label: 'Pool A', pool_id: 3, playoff_bracket_id: null, current: moved }),
    court(2, { use: 'pool', label: 'Pool A', pool_id: 3, playoff_bracket_id: null }),
    court(3, { use: 'pool', label: 'Pool B', pool_id: 4, playoff_bracket_id: null, current: match(9, { pool_id: 4 }) }),
  ]

  expect(nextMatchFor(courts, 2)).toEqual({ kind: 'on-court', court: 1, match: moved })
})

test('with several courts playing the same bracket, the lowest numbered is named', () => {
  const courts = [
    court(1),
    court(2, { current: match(6, { playoff_bracket_id: 20 }) }),
    court(3, { current: match(5, { playoff_bracket_id: 20 }) }),
  ]

  expect(nextMatchFor(courts, 1).court).toBe(2)
})

test('an idle court with a match waiting for it says so when nothing is playing elsewhere', () => {
  const waiting = match(8, { playoff_bracket_id: 20 })
  const courts = [court(1, { up_next: [waiting, match(9)] })]

  expect(nextMatchFor(courts, 1)).toEqual({ kind: 'waiting', match: waiting })
})

test('a match playing elsewhere wins over one waiting', () => {
  const playing = match(5, { playoff_bracket_id: 20 })
  const courts = [court(1, { up_next: [match(8)] }), court(2, { current: playing })]

  expect(nextMatchFor(courts, 1)).toEqual({ kind: 'on-court', court: 2, match: playing })
})

test('an idle court with nothing coming has no pointer, and an unknown court neither', () => {
  expect(nextMatchFor([court(1)], 1)).toBeNull()
  expect(nextMatchFor([court(1)], 9)).toBeNull()
})
