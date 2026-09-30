import { render } from './testUtils'
import { expect, test } from 'vitest'

import { MatchTeams } from './MatchCard'

const teamsById = { 1: { name: 'Aces' }, 2: { name: 'Kings' } }
const inPlay = { team1_id: 1, team2_id: 2, team1_score: 7, team2_score: 5, status: 'in_progress' }

function chips(match, bestOf) {
  const { container } = render(<MatchTeams match={match} teamsById={teamsById} bestOf={bestOf} />)
  return [...container.querySelectorAll('.score-chip')]
}

test('a match in a best-of-3 section shows games won, a single-game section its running score', () => {
  const bestOf = { winners: 3, losers: 1, grand_final: 3 }

  const series = chips({ ...inPlay, bracket: 'winners' }, bestOf)
  const single = chips({ ...inPlay, bracket: 'losers' }, bestOf)

  expect(series.every((chip) => !chip.classList.contains('score-live'))).toBe(true)
  expect(single.every((chip) => chip.classList.contains('score-live'))).toBe(true)
})
