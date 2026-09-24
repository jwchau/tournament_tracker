import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import BracketDiagram from './BracketDiagram'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
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
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(eightTeamBracket)

  render(<BracketDiagram playoffBracketId={1} />)

  expect(await screen.findByTestId('match-3-1')).toBeInTheDocument()
  expect(screen.getAllByTestId(/^match-/)).toHaveLength(7)
  expect(screen.getAllByTestId(/^line-/)).toHaveLength(6)
  expect(screen.queryByText('Losers bracket')).not.toBeInTheDocument()
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
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)

  render(<BracketDiagram playoffBracketId={1} />)

  expect(await screen.findByTestId('match-3-1')).toBeInTheDocument()
  expect(screen.getAllByTestId(/^match-/)).toHaveLength(7)
  expect(screen.getAllByTestId(/^line-/)).toHaveLength(6)
  expect(screen.getAllByText('BYE')).toHaveLength(3)
})

const teams = [
  { id: 20, name: 'Spikers' },
  { id: 30, name: 'Diggers' },
]

test('shows team names instead of team ids', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  expect(await screen.findByLabelText('Diggers score')).toBeInTheDocument()
  expect(screen.getAllByText('Spikers')).toHaveLength(2)
  expect(screen.getByText('Team 40')).toBeInTheDocument()
  expect(screen.queryByText('Team 20')).not.toBeInTheDocument()
})

test('shows the champion once the final match is complete', async () => {
  const finished = fiveTeamBracket.map((match) =>
    match.id === 17
      ? { ...match, team1_id: 10, team2_id: 30, status: 'complete', winner_id: 30 }
      : match,
  )
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(finished)

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  const champion = await screen.findByRole('region', { name: 'Champion' })
  expect(champion).toHaveTextContent('Diggers')
})

test('offers a correction for completed matches between two teams but not for byes', async () => {
  const played = fiveTeamBracket.map((match) =>
    match.id === 16
      ? { ...match, status: 'complete', team1_score: 21, team2_score: 10, winner_id: 20 }
      : match,
  )
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(played)

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  expect(
    await screen.findByRole('button', { name: 'Correct Spikers vs Diggers' }),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^correct/i })).toHaveLength(1)
})

test('each correction button sits under its match box and opens the form in a dialog', async () => {
  const played = fiveTeamBracket.map((match) =>
    match.id === 16
      ? { ...match, status: 'complete', team1_score: 21, team2_score: 10, winner_id: 20 }
      : match,
  )
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(played)

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  const under = await screen.findByTestId('match-2-2-actions')
  const box = screen.getByTestId('match-2-2')
  expect(under.style.left).toBe(`${box.getAttribute('data-x')}px`)
  expect(Number.parseFloat(under.style.top)).toBeGreaterThan(Number(box.getAttribute('data-y')))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  fireEvent.click(within(under).getByRole('button', { name: 'Correct Spikers vs Diggers' }))

  const dialog = screen.getByRole('dialog', { name: 'Correct Spikers vs Diggers' })
  expect(within(dialog).getByLabelText('Spikers score')).toHaveValue(21)
  fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('does not show a champion while the final is unfinished', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  await screen.findByTestId('match-3-1')
  expect(screen.queryByRole('region', { name: 'Champion' })).not.toBeInTheDocument()
})

function doubleMatch(id, bracket, round, position, fields = {}) {
  return {
    id,
    bracket,
    round,
    position,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    winner_id: null,
    winner_next_match_id: null,
    winner_next_slot: null,
    loser_next_match_id: null,
    loser_next_slot: null,
    version: 1,
    ...fields,
  }
}

const fourTeamDouble = [
  doubleMatch(1, 'winners', 1, 1, { team1_id: 10, team2_id: 40, status: 'ready', winner_next_match_id: 3, winner_next_slot: 1, loser_next_match_id: 4, loser_next_slot: 1 }),
  doubleMatch(2, 'winners', 1, 2, { team1_id: 20, team2_id: 30, status: 'ready', winner_next_match_id: 3, winner_next_slot: 2, loser_next_match_id: 4, loser_next_slot: 2 }),
  doubleMatch(3, 'winners', 2, 1, { winner_next_match_id: 6, winner_next_slot: 1, loser_next_match_id: 5, loser_next_slot: 2 }),
  doubleMatch(4, 'losers', 1, 1, { winner_next_match_id: 5, winner_next_slot: 1 }),
  doubleMatch(5, 'losers', 2, 1, { winner_next_match_id: 6, winner_next_slot: 2 }),
  doubleMatch(6, 'grand_final', 1, 1),
]

test('lays out a double-elimination bracket in winners, losers, and grand final sections', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fourTeamDouble)

  render(<BracketDiagram playoffBracketId={1} />)

  expect(await screen.findByText('Winners bracket')).toBeInTheDocument()
  expect(screen.getByText('Losers bracket')).toBeInTheDocument()
  expect(screen.getByText('Grand final')).toBeInTheDocument()
  for (const testId of [
    'match-1-1',
    'match-1-2',
    'match-2-1',
    'match-losers-1-1',
    'match-losers-2-1',
    'match-grand_final-1-1',
  ]) {
    expect(screen.getByTestId(testId)).toBeInTheDocument()
  }
  expect(screen.queryByTestId('match-grand_final-2-1')).not.toBeInTheDocument()
  // Only winner links are drawn: 1→3, 2→3, 3→GF, L1→L2, L2→GF.
  expect(screen.getAllByTestId(/^line-/)).toHaveLength(5)
})

test('shows the grand final reset match once it exists', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([
    ...fourTeamDouble,
    doubleMatch(7, 'grand_final', 2, 1, { team1_id: 10, team2_id: 20, status: 'ready' }),
  ])

  render(<BracketDiagram playoffBracketId={1} />)

  expect(await screen.findByTestId('match-grand_final-2-1')).toBeInTheDocument()
})

function withGrandFinals(...grandFinals) {
  return [...fourTeamDouble.filter((match) => match.bracket !== 'grand_final'), ...grandFinals]
}

test('the winners champion taking grand final one is the champion', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(
    withGrandFinals(
      doubleMatch(6, 'grand_final', 1, 1, { team1_id: 20, team2_id: 30, status: 'complete', winner_id: 20 }),
    ),
  )

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  expect(await screen.findByRole('region', { name: 'Champion' })).toHaveTextContent('Spikers')
})

test('no champion yet when the losers champion takes grand final one', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(
    withGrandFinals(
      doubleMatch(6, 'grand_final', 1, 1, { team1_id: 20, team2_id: 30, status: 'complete', winner_id: 30 }),
    ),
  )

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  await screen.findByTestId('match-grand_final-1-1')
  expect(screen.queryByRole('region', { name: 'Champion' })).not.toBeInTheDocument()
})

test('the reset match decides the champion', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(
    withGrandFinals(
      doubleMatch(6, 'grand_final', 1, 1, { team1_id: 20, team2_id: 30, status: 'complete', winner_id: 30 }),
      doubleMatch(7, 'grand_final', 2, 1, { team1_id: 20, team2_id: 30, status: 'complete', winner_id: 20 }),
    ),
  )

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  expect(await screen.findByRole('region', { name: 'Champion' })).toHaveTextContent('Spikers')
})

test('shows each match court and time and offers a schedule editor only once both teams are known', async () => {
  const scheduled = fiveTeamBracket.map((match) =>
    match.id === 16 ? { ...match, court: 2, scheduled_time: '2026-10-03T10:30:00' } : match,
  )
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(scheduled)

  render(<BracketDiagram playoffBracketId={1} teams={teams} courtCount={3} />)

  const box = await screen.findByTestId('match-2-2')
  expect(box).toHaveTextContent('Court 2 · Sat 10:30')
  // Only 12 and 16 have both teams and are unfinished: 11, 13 and 14 are
  // byes, 15 is waiting on an opponent, and 17 has no teams yet.
  expect(screen.getAllByRole('button', { name: /save schedule/i })).toHaveLength(2)
  expect(screen.getAllByRole('button', { name: /submit score/i })).toHaveLength(2)
  expect(screen.getByText('Round 2 match 2: Spikers vs Diggers')).toBeInTheDocument()
  expect(screen.queryByText(/TBD/, { selector: 'p, h4, legend, span' })).not.toBeInTheDocument()
})

test('a saved schedule shows up in the bracket right away', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)
  vi.spyOn(api, 'scheduleMatch').mockImplementation((id, { court, scheduledTime }) =>
    Promise.resolve({
      ...fiveTeamBracket.find((match) => match.id === id),
      court,
      scheduled_time: `${scheduledTime}:00`,
    }),
  )

  render(<BracketDiagram playoffBracketId={1} teams={teams} courtCount={3} />)

  const [firstForm] = await screen.findAllByRole('button', { name: /save schedule/i })
  const form = firstForm.closest('form')
  fireEvent.change(within(form).getByLabelText(/court/i), { target: { value: '3' } })
  fireEvent.change(within(form).getByLabelText(/time/i), {
    target: { value: '2026-10-03T09:15' },
  })
  fireEvent.click(firstForm)

  expect(await screen.findByText('Court 3 · Sat 09:15')).toBeInTheDocument()
})

test('a best-of series is scored game by game and shows games won in its box', async () => {
  const inSeries = fiveTeamBracket.map((match) =>
    match.id === 16
      ? { ...match, status: 'in_progress', team1_score: 1, team2_score: 0, version: 2 }
      : match,
  )
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(inSeries)
  vi.spyOn(api, 'listGames').mockImplementation(async (matchId) =>
    matchId === 16 ? [{ number: 1, team1_score: 21, team2_score: 15 }] : [],
  )

  render(<BracketDiagram playoffBracketId={1} teams={teams} bestOf={3} />)

  const box = await screen.findByTestId('match-2-2')
  expect(box).toHaveTextContent('Spikers · 1')
  expect(box).toHaveTextContent('Diggers · 0')
  expect(await screen.findByText('Game 1: 21–15')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Record game 2' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /submit score/i })).not.toBeInTheDocument()
})

test('stops polling after 3 consecutive failures and resumes after the cooldown', async () => {
  vi.useFakeTimers()
  const loadMatches = vi.spyOn(api, 'getPlayoffBracketMatches').mockRejectedValue(new Error('network down'))

  render(<BracketDiagram playoffBracketId={1} />)

  await act(() => vi.advanceTimersByTimeAsync(0))
  await act(() => vi.advanceTimersByTimeAsync(4000))
  await act(() => vi.advanceTimersByTimeAsync(4000))
  expect(loadMatches).toHaveBeenCalledTimes(3)
  expect(screen.getByText(/connection lost/i)).toBeInTheDocument()

  await act(() => vi.advanceTimersByTimeAsync(28000))
  expect(loadMatches).toHaveBeenCalledTimes(3)

  loadMatches.mockResolvedValue(eightTeamBracket)
  await act(() => vi.advanceTimersByTimeAsync(4000))
  expect(loadMatches).toHaveBeenCalledTimes(4)
  expect(screen.queryByText(/connection lost/i)).not.toBeInTheDocument()
})

test('a correction that removes the reset match takes it off the bracket right away', async () => {
  const grandFinal = doubleMatch(6, 'grand_final', 1, 1, {
    team1_id: 20,
    team2_id: 30,
    team1_score: 10,
    team2_score: 21,
    status: 'complete',
    winner_id: 30,
  })
  const resetMatch = doubleMatch(7, 'grand_final', 2, 1, { team1_id: 20, team2_id: 30, status: 'ready' })
  const corrected = { ...grandFinal, team1_score: 21, team2_score: 10, winner_id: 20, version: 2 }
  vi.spyOn(api, 'getPlayoffBracketMatches')
    .mockResolvedValueOnce(withGrandFinals(grandFinal, resetMatch))
    .mockResolvedValue(withGrandFinals(corrected))
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: [resetMatch] })
  vi.spyOn(api, 'correctScore').mockResolvedValue({ match: corrected, reset_matches: [resetMatch] })

  render(<BracketDiagram playoffBracketId={1} teams={teams} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Correct Spikers vs Diggers' }))
  const form = screen.getByText(/correcting spikers vs diggers/i).closest('form')
  fireEvent.change(within(form).getByLabelText('Spikers score'), { target: { value: '21' } })
  fireEvent.change(within(form).getByLabelText('Diggers score'), { target: { value: '10' } })
  fireEvent.click(within(form).getByRole('button', { name: /review correction/i }))
  fireEvent.click(await screen.findByRole('button', { name: /apply correction/i }))

  expect(await screen.findByRole('region', { name: 'Champion' })).toHaveTextContent('Spikers')
  expect(screen.queryByTestId('match-grand_final-2-1')).not.toBeInTheDocument()
})
