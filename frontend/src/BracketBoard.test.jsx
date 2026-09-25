import { MemoryRouter } from 'react-router-dom'
import { act, fireEvent, render, screen, within } from './testUtils'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import BracketBoard from './BracketBoard'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// Tests run without matchMedia, so the board shows its phone layout: round
// pages with a card per match.
function renderBoard(props = {}, options) {
  return render(
    <MemoryRouter>
      <BracketBoard playoffBracketId={1} tournamentId={3} teams={teams} courtCount={3} {...props} />
    </MemoryRouter>,
    options,
  )
}

const teams = [
  { id: 20, name: 'Spikers' },
  { id: 30, name: 'Diggers' },
]

const fiveTeamBracket = [
  { id: 11, round: 1, position: 1, team1_id: 10, team2_id: null, status: 'complete', winner_id: 10, winner_next_match_id: 15, winner_next_slot: 1, version: 1 },
  { id: 12, round: 1, position: 2, team1_id: 40, team2_id: 50, status: 'ready', winner_next_match_id: 15, winner_next_slot: 2, version: 1 },
  { id: 13, round: 1, position: 3, team1_id: 20, team2_id: null, status: 'complete', winner_id: 20, winner_next_match_id: 16, winner_next_slot: 1, version: 1 },
  { id: 14, round: 1, position: 4, team1_id: 30, team2_id: null, status: 'complete', winner_id: 30, winner_next_match_id: 16, winner_next_slot: 2, version: 1 },
  { id: 15, round: 2, position: 1, team1_id: 10, team2_id: null, status: 'pending', winner_next_match_id: 17, winner_next_slot: 1, version: 1 },
  { id: 16, round: 2, position: 2, team1_id: 20, team2_id: 30, status: 'ready', winner_next_match_id: 17, winner_next_slot: 2, version: 1 },
  { id: 17, round: 3, position: 1, team1_id: null, team2_id: null, status: 'pending', winner_next_match_id: null, winner_next_slot: null, version: 1 },
]

const open = async (name) => fireEvent.click(await screen.findByRole('button', { name }))
const panel = (name) => screen.getByRole('dialog', { name })

test('shows the bracket round by round, opening on the round being played', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)

  renderBoard()

  const rounds = await screen.findByRole('navigation', { name: 'Rounds' })
  const tabs = within(rounds).getAllByRole('button')
  expect(tabs.map((tab) => tab.textContent)).toEqual(['Quarters', 'Semis', 'Final'])
  expect(within(rounds).getByRole('button', { name: 'Quarters' })).toHaveAttribute('aria-pressed', 'true')

  const semis = screen.getByRole('region', { name: 'Semis' })
  expect(
    within(semis).getByRole('button', { name: 'Semis · match 2: Spikers vs Diggers' }),
  ).toBeInTheDocument()

  fireEvent.click(within(screen.getByRole('region', { name: 'Quarters' })).getByRole('button', { name: /Next: Semis/ }))
  expect(within(rounds).getByRole('button', { name: 'Semis' })).toHaveAttribute('aria-pressed', 'true')
})

test('a match on a court links to its scoreboard', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(
    fiveTeamBracket.map((match) => (match.id === 16 ? { ...match, court: 2 } : match)),
  )

  renderBoard()

  const semis = await screen.findByRole('region', { name: 'Semis' })
  expect(within(semis).getByRole('link', { name: 'Score on Court 2' })).toHaveAttribute(
    'href',
    '/tournaments/3/courts/2',
  )
  expect(screen.queryByRole('button', { name: /submit score/i })).not.toBeInTheDocument()
})

test('opening a match shows its tools, only once both teams are known', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)

  renderBoard()

  await open('Semis · match 2: Spikers vs Diggers')
  const semi = panel('Semis · match 2')
  expect(within(semi).getByRole('button', { name: /save schedule/i })).toBeInTheDocument()
  expect(within(semi).getAllByRole('option', { name: /^court/i })).toHaveLength(3)
  expect(within(semi).getByRole('button', { name: 'Hold Semis · match 2' })).toBeInTheDocument()
  fireEvent.click(within(semi).getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  // Waiting on an opponent: nothing to schedule or hold yet.
  await open('Semis · match 1: Team 10 vs TBD')
  const waiting = panel('Semis · match 1')
  expect(waiting).toHaveTextContent('Waiting for both teams')
  expect(within(waiting).queryByRole('button', { name: /save schedule|hold/i })).not.toBeInTheDocument()
})

test('Escape closes the match', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)

  renderBoard()
  await open('Semis · match 2: Spikers vs Diggers')
  fireEvent.keyDown(document, { key: 'Escape' })

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a finished match between two teams can be corrected; a bye cannot', async () => {
  const played = fiveTeamBracket.map((match) =>
    match.id === 16
      ? { ...match, status: 'complete', team1_score: 21, team2_score: 10, winner_id: 20 }
      : match,
  )
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(played)

  renderBoard()

  await open('Semis · match 2: Spikers vs Diggers')
  expect(
    within(panel('Semis · match 2')).getByRole('button', { name: 'Correct Spikers vs Diggers' }),
  ).toBeInTheDocument()
  fireEvent.click(within(panel('Semis · match 2')).getByRole('button', { name: 'Close' }))

  await open('Quarters · match 3: Spikers vs BYE')
  expect(within(panel('Quarters · match 3')).queryByRole('button', { name: /^correct/i })).not.toBeInTheDocument()
})

const dispatched = [
  { id: 1, round: 1, position: 1, team1_id: 10, team2_id: 80, status: 'ready', court: 1, winner_next_match_id: 5, winner_next_slot: 1 },
  { id: 2, round: 1, position: 2, team1_id: 40, team2_id: 50, status: 'in_progress', team1_score: 5, team2_score: 3, court: 2, winner_next_match_id: 5, winner_next_slot: 2 },
  { id: 3, round: 1, position: 3, team1_id: 20, team2_id: 70, status: 'ready', court: null, winner_next_match_id: 6, winner_next_slot: 1 },
  { id: 4, round: 1, position: 4, team1_id: 30, team2_id: 60, status: 'ready', court: null, winner_next_match_id: 6, winner_next_slot: 2 },
  { id: 5, round: 2, position: 1, team1_id: null, team2_id: null, status: 'pending', winner_next_match_id: 7, winner_next_slot: 1 },
  { id: 6, round: 2, position: 2, team1_id: null, team2_id: null, status: 'pending', winner_next_match_id: 7, winner_next_slot: 2 },
  { id: 7, round: 3, position: 1, team1_id: null, team2_id: null, status: 'pending', winner_next_match_id: null, winner_next_slot: null },
].map((match) => ({ on_hold: false, version: 1, ...match }))

test('a match can be held and released from its panel', async () => {
  const held = { ...dispatched[2], on_hold: true, version: 2 }
  const loadMatches = vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(dispatched)
  vi.spyOn(api, 'getBracketDispatch').mockResolvedValue({ courts: [], queue: [], overflow: false })
  const holdMatch = vi.spyOn(api, 'holdMatch').mockImplementation(async () => {
    loadMatches.mockResolvedValue(dispatched.map((m) => (m.id === 3 ? held : m)))
    return held
  })

  renderBoard()

  // Match 2 has a score, so it can't be held.
  await open('Quarters · match 2: Team 40 vs Team 50')
  expect(within(panel('Quarters · match 2')).queryByRole('button', { name: /^hold/i })).not.toBeInTheDocument()
  fireEvent.click(within(panel('Quarters · match 2')).getByRole('button', { name: 'Close' }))

  await open('Quarters · match 3: Spikers vs Team 70')
  fireEvent.click(within(panel('Quarters · match 3')).getByRole('button', { name: 'Hold Quarters · match 3' }))

  expect(holdMatch).toHaveBeenCalledWith(3, { onHold: true, version: 1 })
  expect(
    await within(panel('Quarters · match 3')).findByRole('button', { name: 'Release Quarters · match 3' }),
  ).toBeInTheDocument()
  expect(panel('Quarters · match 3')).toHaveTextContent('On hold')
})

test('a refused hold says why', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(dispatched)
  vi.spyOn(api, 'getBracketDispatch').mockResolvedValue({ courts: [], queue: [], overflow: false })
  vi.spyOn(api, 'holdMatch').mockRejectedValue({
    json: () => Promise.resolve({ detail: "this match has a score, so it can't be put on hold" }),
  })

  renderBoard()
  await open('Quarters · match 3: Spikers vs Team 70')
  fireEvent.click(within(panel('Quarters · match 3')).getByRole('button', { name: 'Hold Quarters · match 3' }))

  expect(await screen.findByText(/has a score, so it can't be put on hold/)).toBeInTheDocument()
})

test('a match waiting for a court shows its place in line', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(dispatched)
  vi.spyOn(api, 'getBracketDispatch').mockResolvedValue({
    courts: [{ court: 1, match_id: 1 }, { court: 2, match_id: 2 }],
    queue: [4, 99, 3],
    overflow: false,
  })

  renderBoard()

  const quarters = await screen.findByRole('region', { name: 'Quarters' })
  expect(await within(quarters).findByText('Waiting for a court · #1')).toBeInTheDocument()
  expect(within(quarters).getByText('Waiting for a court · #3')).toBeInTheDocument()
})

test('a saved court and time show on the match right away', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)
  vi.spyOn(api, 'scheduleMatch').mockImplementation((id, { court, scheduledTime }) =>
    Promise.resolve({
      ...fiveTeamBracket.find((match) => match.id === id),
      court,
      scheduled_time: `${scheduledTime}:00`,
    }),
  )

  renderBoard()

  await open('Semis · match 2: Spikers vs Diggers')
  const form = within(panel('Semis · match 2')).getByRole('button', { name: /save schedule/i }).closest('form')
  fireEvent.change(within(form).getByLabelText(/court/i), { target: { value: '3' } })
  fireEvent.change(within(form).getByLabelText(/time/i), { target: { value: '2026-10-03T09:15' } })
  fireEvent.click(within(form).getByRole('button', { name: /save schedule/i }))

  const semis = screen.getByRole('region', { name: 'Semis' })
  expect(await within(semis).findByText('Court 3 · Sat 09:15')).toBeInTheDocument()
})

function doubleMatch(id, bracket, round, position, fields = {}) {
  return {
    id, bracket, round, position,
    team1_id: null, team2_id: null, status: 'pending', winner_id: null,
    winner_next_match_id: null, winner_next_slot: null,
    loser_next_match_id: null, loser_next_slot: null, version: 1,
    ...fields,
  }
}

const fourTeamDouble = [
  doubleMatch(1, 'winners', 1, 1, { team1_id: 10, team2_id: 40, status: 'ready', winner_next_match_id: 3, winner_next_slot: 1, loser_next_match_id: 4, loser_next_slot: 1 }),
  doubleMatch(2, 'winners', 1, 2, { team1_id: 20, team2_id: 30, status: 'ready', winner_next_match_id: 3, winner_next_slot: 2, loser_next_match_id: 4, loser_next_slot: 2 }),
  doubleMatch(3, 'winners', 2, 1, { winner_next_match_id: 6, winner_next_slot: 1, loser_next_match_id: 5, loser_next_slot: 2 }),
  doubleMatch(4, 'losers', 1, 1, { winner_next_match_id: 5, winner_next_slot: 1 }),
  doubleMatch(5, 'losers', 2, 1, { winner_next_match_id: 6, winner_next_slot: 2 }),
]

test('double elimination names its winners, losers and grand final rounds', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue([
    ...fourTeamDouble,
    doubleMatch(6, 'grand_final', 1, 1),
  ])

  renderBoard()

  const rounds = await screen.findByRole('navigation', { name: 'Rounds' })
  expect(within(rounds).getAllByRole('button').map((tab) => tab.textContent)).toEqual([
    'Winners Semis',
    'Winners final',
    'Losers 1',
    'Losers final',
    'Grand final',
  ])
})

test('a correction that removes the reset match takes it off the bracket right away', async () => {
  const grandFinal = doubleMatch(6, 'grand_final', 1, 1, {
    team1_id: 20, team2_id: 30, team1_score: 10, team2_score: 21, status: 'complete', winner_id: 30,
  })
  const resetMatch = doubleMatch(7, 'grand_final', 2, 1, { team1_id: 20, team2_id: 30, status: 'ready' })
  const corrected = { ...grandFinal, team1_score: 21, team2_score: 10, winner_id: 20, version: 2 }
  vi.spyOn(api, 'getPlayoffBracketMatches')
    .mockResolvedValueOnce([...fourTeamDouble, grandFinal, resetMatch])
    .mockResolvedValue([...fourTeamDouble, corrected])
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: [resetMatch] })
  vi.spyOn(api, 'correctScore').mockResolvedValue({ match: corrected, reset_matches: [resetMatch] })

  renderBoard()

  await open('Grand final: Spikers vs Diggers')
  fireEvent.click(within(panel('Grand final')).getByRole('button', { name: 'Correct Spikers vs Diggers' }))
  const form = screen.getByText(/correcting spikers vs diggers/i).closest('form')
  fireEvent.change(within(form).getByLabelText('Spikers score'), { target: { value: '21' } })
  fireEvent.change(within(form).getByLabelText('Diggers score'), { target: { value: '10' } })
  fireEvent.click(within(form).getByRole('button', { name: /review correction/i }))
  fireEvent.click(await screen.findByRole('button', { name: /apply correction/i }))

  expect(await screen.findByRole('region', { name: 'Champion' })).toHaveTextContent('Spikers')
  expect(screen.queryByRole('button', { name: /Grand final reset/ })).not.toBeInTheDocument()
})

test('signed out, a match opens with its court but no tools', async () => {
  vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(
    fiveTeamBracket.map((match) => (match.id === 16 ? { ...match, court: 2 } : match)),
  )

  renderBoard({}, { user: null })

  await open('Semis · match 2: Spikers vs Diggers')
  const semi = panel('Semis · match 2')
  expect(within(semi).getByRole('link', { name: 'Watch Court 2' })).toBeInTheDocument()
  expect(within(semi).queryByRole('button', { name: /save schedule|hold|correct/i })).not.toBeInTheDocument()
})

test('keeps polling, so a result scored on the court shows up', async () => {
  vi.useFakeTimers()
  const finished = fiveTeamBracket.map((match) =>
    match.id === 16
      ? { ...match, status: 'complete', team1_score: 21, team2_score: 17, winner_id: 20 }
      : match,
  )
  const loadMatches = vi.spyOn(api, 'getPlayoffBracketMatches').mockResolvedValue(fiveTeamBracket)

  renderBoard()
  await act(() => vi.advanceTimersByTimeAsync(0))
  loadMatches.mockResolvedValue(finished)
  await act(() => vi.advanceTimersByTimeAsync(4000))

  const semis = screen.getByRole('region', { name: 'Semis' })
  expect(within(semis).getByRole('button', { name: 'Semis · match 2: Spikers vs Diggers' })).toHaveTextContent('21')
})
