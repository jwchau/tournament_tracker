import { expect, test } from 'vitest'

import { groupByRound, roundsInView } from './scheduleView'

// A pool match stored the way the backend does: `round` counts games in play
// order (a slot), and `position` is the pairing's place among its simultaneous matches.
const slotMatch = (id, slot, position) => ({ id, round: slot, position })

test('one game per pairing: every slot is its own round with one game per pairing', () => {
  const rounds = groupByRound([slotMatch(1, 1, 1), slotMatch(2, 1, 2), slotMatch(3, 2, 1)], 1)

  expect(rounds.map((round) => round.round)).toEqual([1, 2])
  expect(rounds[0].pairings.map((pairing) => pairing.games.map((game) => game.id))).toEqual([
    [1],
    [2],
  ])
  expect(rounds[0].pairings[0].games[0].gameNumber).toBe(1)
})

test('two games per pairing: consecutive slots join one round, a pairing’s games together', () => {
  const matches = [
    slotMatch(1, 1, 1),
    slotMatch(2, 1, 2),
    slotMatch(3, 2, 1),
    slotMatch(4, 2, 2),
    slotMatch(5, 3, 1),
    slotMatch(6, 4, 1),
  ]

  const rounds = groupByRound(matches, 2)

  expect(rounds.map((round) => round.round)).toEqual([1, 2])
  expect(rounds[0].pairings.map((pairing) => pairing.games.map((game) => game.id))).toEqual([
    [1, 3],
    [2, 4],
  ])
  expect(rounds[0].pairings[0].games.map((game) => game.gameNumber)).toEqual([1, 2])
  expect(rounds[1].pairings.map((pairing) => pairing.games.map((game) => game.id))).toEqual([[5, 6]])
  expect(rounds[0].matches.map((match) => match.id)).toEqual([1, 3, 2, 4])
})

test('a missing or bad games-per-pairing counts as one', () => {
  expect(groupByRound([slotMatch(1, 1, 1), slotMatch(2, 2, 1)], undefined)).toHaveLength(2)
  expect(groupByRound([slotMatch(1, 1, 1), slotMatch(2, 2, 1)], 0)).toHaveLength(2)
})

test('the schedule shows about three matches’ worth of rounds before it scrolls', () => {
  expect(roundsInView(3)).toBe(1)
  expect(roundsInView(4)).toBe(1)
  expect(roundsInView(2)).toBe(2)
  expect(roundsInView(1)).toBe(3)
  expect(roundsInView(0)).toBe(3)
})
