import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import BracketDiagram from './BracketDiagram'

afterEach(() => {
  vi.restoreAllMocks()
})

const eightTeamBracket = [
  { id: 1, round: 1, position: 1, team1_id: 10, team2_id: 80, status: 'ready', winner_next_match_id: 5, winner_next_slot: 1 },
  { id: 2, round: 1, position: 2, team1_id: 40, team2_id: 50, status: 'ready', winner_next_match_id: 5, winner_next_slot: 2 },
  { id: 3, round: 1, position: 3, team1_id: 20, team2_id: 70, status: 'ready', winner_next_match_id: 6, winner_next_slot: 1 },
  { id: 4, round: 1, position: 4, team1_id: 30, team2_id: 60, status: 'ready', winner_next_match_id: 6, winner_next_slot: 2 },
  { id: 5, round: 2, position: 1, team1_id: null, team2_id: null, status: 'pending', winner_next_match_id: 7, winner_next_slot: 1 },
  { id: 6, round: 2, position: 2, team1_id: null, team2_id: null, status: 'pending', winner_next_match_id: 7, winner_next_slot: 2 },
  { id: 7, round: 3, position: 1, team1_id: null, team2_id: null, status: 'pending', winner_next_match_id: null, winner_next_slot: null },
]

test('renders all rounds, matches, and connecting lines for an 8-team bracket', async () => {
  vi.spyOn(api, 'getBracket').mockResolvedValue(eightTeamBracket)

  render(<BracketDiagram tournamentId={1} />)

  expect(await screen.findByTestId('match-3-1')).toBeInTheDocument()
  expect(screen.getAllByTestId(/^match-/)).toHaveLength(7)
  expect(screen.getAllByTestId(/^line-/)).toHaveLength(6)
})

const fiveTeamBracket = [
  { id: 11, round: 1, position: 1, team1_id: 10, team2_id: null, status: 'complete', winner_id: 10, winner_next_match_id: 15, winner_next_slot: 1 },
  { id: 12, round: 1, position: 2, team1_id: 40, team2_id: 50, status: 'ready', winner_next_match_id: 15, winner_next_slot: 2 },
  { id: 13, round: 1, position: 3, team1_id: 20, team2_id: null, status: 'complete', winner_id: 20, winner_next_match_id: 16, winner_next_slot: 1 },
  { id: 14, round: 1, position: 4, team1_id: 30, team2_id: null, status: 'complete', winner_id: 30, winner_next_match_id: 16, winner_next_slot: 2 },
  { id: 15, round: 2, position: 1, team1_id: 10, team2_id: null, status: 'pending', winner_next_match_id: 17, winner_next_slot: 1 },
  { id: 16, round: 2, position: 2, team1_id: 20, team2_id: 30, status: 'ready', winner_next_match_id: 17, winner_next_slot: 2 },
  { id: 17, round: 3, position: 1, team1_id: null, team2_id: null, status: 'pending', winner_next_match_id: null, winner_next_slot: null },
]

test('renders byes as pre-completed matches for a 5-team bracket', async () => {
  vi.spyOn(api, 'getBracket').mockResolvedValue(fiveTeamBracket)

  render(<BracketDiagram tournamentId={1} />)

  expect(await screen.findByTestId('match-3-1')).toBeInTheDocument()
  expect(screen.getAllByTestId(/^match-/)).toHaveLength(7)
  expect(screen.getAllByTestId(/^line-/)).toHaveLength(6)
  expect(screen.getAllByText('BYE')).toHaveLength(3)
})
