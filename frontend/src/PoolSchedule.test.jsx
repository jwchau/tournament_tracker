import { fireEvent, render, screen, waitFor, within } from './testUtils'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PoolSchedule from './PoolSchedule'

const inRouter = (ui) => <MemoryRouter>{ui}</MemoryRouter>

afterEach(() => {
  vi.restoreAllMocks()
})

const pool = { id: 1, tournament_id: 3, name: 'Pool A', courts: [1] }

const teams = [
  { id: 10, name: 'Spikers', pool_id: 1 },
  { id: 11, name: 'Diggers', pool_id: 1 },
  { id: 12, name: 'Blockers', pool_id: 1 },
  { id: 13, name: 'Elsewhere', pool_id: 2 },
]

function poolMatch(id, round, team1, team2, fields = {}) {
  return {
    id,
    bracket: 'pool',
    pool_id: 1,
    round,
    position: 1,
    court: 1,
    team1_id: team1,
    team2_id: team2,
    team1_score: null,
    team2_score: null,
    status: 'ready',
    winner_id: null,
    ref_team_id: null,
    ref_set_at: null,
    version: 1,
    ...fields,
  }
}

const schedule = [
  poolMatch(1, 1, 10, 11, {
    team1_score: 21,
    team2_score: 15,
    status: 'complete',
    winner_id: 10,
    ref_team_id: 12,
  }),
  poolMatch(2, 2, 10, 12, { ref_team_id: 11 }),
  poolMatch(3, 3, 11, 12),
]

// The slot list's row for a pairing.
function matchRow(teamsText) {
  return screen.getByText(teamsText).closest('li')
}

test('lists each slot with its court, teams, score, and ref', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />), { user: null })

  const firstSlot = (await screen.findByRole('heading', { name: /^Slot 1/ })).closest('li')
  const played = within(firstSlot).getByText('Spikers vs Diggers').closest('li')
  expect(played).toHaveTextContent('Court 1')
  expect(played).toHaveTextContent('21–15')
  expect(within(played).getByText('Ref: Blockers')).toBeInTheDocument()
  expect(within(matchRow('Diggers vs Blockers')).getByText('Ref: N/A')).toBeInTheDocument()
  // Blockers is reffing, so no one rests; no one is ever "observing".
  expect(within(firstSlot).queryByText(/Resting/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Observing/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Elsewhere/)).not.toBeInTheDocument()
})

test('scoring happens on the court: unfinished matches link to its scoreboard', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  await screen.findByRole('heading', { name: /^Slot 1/ })
  expect(
    within(matchRow('Spikers vs Blockers')).getByRole('link', { name: 'Score on Court 1' }),
  ).toHaveAttribute('href', '/tournaments/3/courts/1')
  expect(
    within(matchRow('Spikers vs Diggers')).queryByRole('link', { name: /court/i }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /submit score/i })).not.toBeInTheDocument()
})

test('the slot being played now is marked', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  expect(await screen.findByRole('heading', { name: 'Slot 2 Now' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Slot 1' })).toBeInTheDocument()
})

// A team's cell in a slot's column of the grid (column 0 is the team names).
function gridCell(grid, team, slot) {
  return within(grid).getByRole('rowheader', { name: team }).closest('tr').cells[slot]
}

test('the grid has a column per slot, in order, and a row per pool team', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const heads = within(grid).getAllByRole('columnheader').slice(1)
  expect(heads.map((head) => head.textContent)).toEqual(['Slot 1', 'Slot 2 (now)', 'Slot 3'])
  expect(within(grid).getAllByRole('rowheader').map((head) => head.textContent)).toEqual([
    'Spikers',
    'Diggers',
    'Blockers',
  ])
  // No team-against-team letters or hatched diagonal any more.
  expect(within(grid).queryByTitle('Spikers')).not.toBeInTheDocument()
})

test('a playing cell shows the court and opponent, and the score from that team’s side', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const spikersFirst = gridCell(grid, 'Spikers', 1)
  expect(spikersFirst).toHaveTextContent('Ct 1 · vs Diggers21–15')
  expect(within(spikersFirst).getByText('21')).toHaveClass('score-won')
  expect(gridCell(grid, 'Diggers', 1)).toHaveTextContent('Ct 1 · vs Spikers15–21')
  expect(within(gridCell(grid, 'Diggers', 1)).getByText('21')).toHaveClass('score-won')
  // Not played yet: court and opponent only.
  expect(gridCell(grid, 'Spikers', 2)).toHaveTextContent(/^Ct 1 · vs Blockers$/)
  expect(within(gridCell(grid, 'Spikers', 2)).getByRole('link')).toHaveAttribute(
    'href',
    '#pool-match-2',
  )
})

test('a match being played shows its running score, muted', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([
    poolMatch(1, 1, 10, 11, { team1_score: 9, team2_score: 7, status: 'in_progress' }),
  ])

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const score = gridCell(grid, 'Diggers', 1).querySelector('.slot-score')
  expect(score).toHaveTextContent('7–9')
  expect(score).toHaveAttribute('data-live')
  expect(within(score).queryByText('9')).not.toHaveClass('score-won')
})

test('a ref cell shows the court and both teams, a free team rests, and an N/A match has no ref cell', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const reffing = gridCell(grid, 'Blockers', 1)
  expect(reffing).toHaveTextContent('Ref · Ct 1Spikers v Diggers')
  expect(within(reffing).getByRole('link')).toHaveAttribute('data-kind', 'ref')
  // Slot 3's match has no ref, so Spikers just rests.
  expect(gridCell(grid, 'Spikers', 3)).toHaveTextContent(/^Rest$/)
  expect(within(grid).getAllByText(/^Ref · /)).toHaveLength(2)
})

test('the current slot’s column is marked', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const heads = within(grid).getAllByRole('columnheader')
  expect(heads[2]).toHaveAttribute('data-now')
  expect(heads[1]).not.toHaveAttribute('data-now')
  for (const team of ['Spikers', 'Diggers', 'Blockers']) {
    expect(gridCell(grid, team, 2)).toHaveAttribute('data-now')
    expect(gridCell(grid, team, 3)).not.toHaveAttribute('data-now')
  }
})

test('choosing a cell marks the match in the grid and the schedule, and back', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  const grid = await screen.findByRole('table', { name: 'Results grid' })
  const cells = ['Spikers', 'Diggers', 'Blockers'].map((team) =>
    within(gridCell(grid, team, 1)).getByRole('link'),
  )
  fireEvent.click(cells[0])

  // Both teams' cells and the ref's, and its row in the schedule.
  for (const cell of cells) expect(cell).toHaveAttribute('aria-current', 'true')
  expect(matchRow('Spikers vs Diggers')).toHaveAttribute('aria-current', 'true')
  expect(matchRow('Spikers vs Blockers')).not.toHaveAttribute('aria-current')

  // And from the schedule back to the grid.
  const schedulePair = within(matchRow('Spikers vs Blockers')).getByRole('link', {
    name: 'Spikers vs Blockers',
  })
  expect(schedulePair).toHaveAttribute('href', `#${gridCell(grid, 'Spikers', 2).querySelector('a').id}`)
  fireEvent.click(schedulePair)
  expect(matchRow('Spikers vs Blockers')).toHaveAttribute('aria-current', 'true')
  expect(cells[0]).not.toHaveAttribute('aria-current')
})

const bigPool = [10, 11, 12, 13, 14].map((id) => ({ id, name: `T${id}`, pool_id: 1 }))

test('idle teams not reffing are listed as resting', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([poolMatch(1, 1, 10, 11, { ref_team_id: 12 })])

  render(inRouter(<PoolSchedule pool={pool} teams={bigPool} />))

  expect(await screen.findByText('Resting: T13, T14')).toBeInTheDocument()
  expect(screen.queryByText(/Observing/)).not.toBeInTheDocument()
})

test('signed in, the Ref dropdown offers Automatic, the teams free that slot, and N/A', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([
    poolMatch(1, 1, 10, 11, { ref_team_id: 12 }),
    poolMatch(2, 1, 12, 13, {
      position: 2,
      court: 2,
      ref_team_id: 14,
      ref_set_at: '2026-09-28T10:00:00',
    }),
  ])
  const withOutsider = [...bigPool, { id: 99, name: 'Other pool', pool_id: 2 }]

  render(inRouter(<PoolSchedule pool={pool} teams={withOutsider} />))

  const automatic = await screen.findByRole('combobox', { name: 'Ref for T10 vs T11' })
  expect(within(automatic).getAllByRole('option').map((option) => option.textContent)).toEqual([
    'Automatic (T12)',
    'T14',
    'N/A',
  ])
  expect(automatic).toHaveValue('auto')
  // A hand-set ref shows as that team.
  expect(screen.getByRole('combobox', { name: 'Ref for T12 vs T13' })).toHaveValue('14')
})

test('changing a ref saves it and reloads the schedule; Automatic and N/A are sent as such', async () => {
  const before = [poolMatch(1, 1, 10, 11, { ref_team_id: 12, version: 4 })]
  const after = [
    poolMatch(1, 1, 10, 11, { ref_team_id: 13, ref_set_at: '2026-09-28T10:00:00', version: 5 }),
  ]
  vi.spyOn(api, 'getPoolMatches').mockResolvedValueOnce(before).mockResolvedValue(after)
  const setMatchRef = vi.spyOn(api, 'setMatchRef').mockResolvedValue(after[0])

  render(inRouter(<PoolSchedule pool={pool} teams={bigPool} />))

  const select = await screen.findByRole('combobox', { name: 'Ref for T10 vs T11' })
  fireEvent.change(select, { target: { value: '13' } })

  await waitFor(() => expect(select).toHaveValue('13'))
  expect(setMatchRef).toHaveBeenCalledWith(1, { automatic: false, refTeamId: 13, version: 4 })

  fireEvent.change(select, { target: { value: 'na' } })
  await waitFor(() =>
    expect(setMatchRef).toHaveBeenLastCalledWith(1, {
      automatic: false,
      refTeamId: null,
      version: 5,
    }),
  )
  await waitFor(() => expect(select).not.toBeDisabled())
  fireEvent.change(select, { target: { value: 'auto' } })
  await waitFor(() =>
    expect(setMatchRef).toHaveBeenLastCalledWith(1, { automatic: true, refTeamId: null, version: 5 }),
  )
})

test('shows why a ref change was refused', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([poolMatch(1, 1, 10, 11, { ref_team_id: 12 })])
  vi.spyOn(api, 'setMatchRef').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'version conflict: match was updated by someone else' }),
  })

  render(inRouter(<PoolSchedule pool={pool} teams={bigPool} />))

  fireEvent.change(await screen.findByRole('combobox', { name: 'Ref for T10 vs T11' }), {
    target: { value: '13' },
  })

  expect(await screen.findByText(/version conflict/)).toBeInTheDocument()
})

test('signed out, there is no Ref dropdown', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([poolMatch(1, 1, 10, 11, { ref_team_id: 12 })])

  render(inRouter(<PoolSchedule pool={pool} teams={bigPool} />), { user: null })

  expect(await screen.findByText('Ref: T12')).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

test('generates the schedule using the tournament setting for games per pairing', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([])
  const generate = vi.spyOn(api, 'generatePoolSchedule').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  fireEvent.click(await screen.findByRole('button', { name: /generate schedule/i }))

  await waitFor(() => expect(generate).toHaveBeenCalledWith(1))
  expect(await screen.findByRole('heading', { name: /^Slot 3/ })).toBeInTheDocument()
  expect(screen.queryByLabelText(/games per pairing/i)).not.toBeInTheDocument()
})

test('shows why generating the schedule was refused', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue([])
  vi.spyOn(api, 'generatePoolSchedule').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'a pool needs at least 2 teams' }),
  })

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))
  fireEvent.click(await screen.findByRole('button', { name: /generate schedule/i }))

  expect(await screen.findByText('a pool needs at least 2 teams')).toBeInTheDocument()
})

test('does not offer to generate a schedule once the pool has one', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  await screen.findByRole('heading', { name: /^Slot 1/ })
  expect(screen.queryByRole('button', { name: /generate schedule/i })).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/games per pairing/i)).not.toBeInTheDocument()
})

test('shows a loading placeholder, not an empty schedule or the generate button, until the matches arrive', () => {
  vi.spyOn(api, 'getPoolMatches').mockReturnValue(new Promise(() => {}))

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  expect(screen.getByRole('status', { name: 'Loading schedule' })).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /generate schedule/i })).not.toBeInTheDocument()
})

test('a finished match offers a correction; unfinished ones do not', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />))

  expect(
    await screen.findByRole('button', { name: 'Correct Spikers vs Diggers' }),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^correct /i })).toHaveLength(1)
})

test('signed out, finished matches cannot be corrected', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)

  render(inRouter(<PoolSchedule pool={pool} teams={teams} />), { user: null })

  await screen.findByText('Spikers vs Diggers')
  expect(screen.queryByRole('button', { name: /^correct /i })).not.toBeInTheDocument()
})

test('a correction shows the new score and tells the page the matches changed', async () => {
  vi.spyOn(api, 'getPoolMatches').mockResolvedValue(schedule)
  vi.spyOn(api, 'previewCorrection').mockResolvedValue({ reset_matches: [] })
  const corrected = { ...schedule[0], team1_score: 15, team2_score: 21, winner_id: 11, version: 2 }
  vi.spyOn(api, 'correctScore').mockResolvedValue({ match: corrected, reset_matches: [] })
  const onMatchesChange = vi.fn()

  render(inRouter(<PoolSchedule pool={pool} teams={teams} onMatchesChange={onMatchesChange} />))

  fireEvent.click(await screen.findByRole('button', { name: 'Correct Spikers vs Diggers' }))
  const dialog = screen.getByRole('dialog', { name: 'Correct Spikers vs Diggers' })
  fireEvent.change(within(dialog).getByLabelText('Spikers score'), { target: { value: '15' } })
  fireEvent.change(within(dialog).getByLabelText('Diggers score'), { target: { value: '21' } })
  fireEvent.click(within(dialog).getByRole('button', { name: /review correction/i }))
  fireEvent.click(await screen.findByRole('button', { name: /apply correction/i }))

  // The correction runs through a preview and a confirm; give it time under a busy test run.
  await waitFor(() => expect(matchRow('Spikers vs Diggers')).toHaveTextContent('15–21'), {
    timeout: 3000,
  })
  expect(onMatchesChange).toHaveBeenLastCalledWith(expect.arrayContaining([corrected]))
})
