import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import CourtsPage from './CourtsPage'

afterEach(() => {
  vi.restoreAllMocks()
})

test('lists every court as a link to its page, with what is on it now', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue([
    {
      court: 1,
      use: 'playoff',
      label: 'Bracket 1',
      current: { id: 5, team1_name: 'Spikers', team2_name: 'Diggers' },
      up_next: [],
    },
    { court: 2, use: null, label: null, current: null, up_next: [] },
  ])

  render(
    <MemoryRouter initialEntries={['/tournaments/3/courts']}>
      <Routes>
        <Route path="/tournaments/:tournamentId/courts" element={<CourtsPage />} />
      </Routes>
    </MemoryRouter>,
  )

  const courtOne = await screen.findByRole('link', { name: /court 1/i })
  expect(courtOne).toHaveAttribute('href', '/tournaments/3/courts/1')
  expect(courtOne).toHaveTextContent('Bracket 1')
  expect(courtOne).toHaveTextContent('Spikers vs Diggers')
  const courtTwo = screen.getByRole('link', { name: /court 2/i })
  expect(courtTwo).toHaveAttribute('href', '/tournaments/3/courts/2')
  expect(courtTwo).toHaveTextContent('Free')
  expect(screen.getByRole('link', { name: /back to tournament/i })).toHaveAttribute(
    'href',
    '/tournaments/3',
  )
})

test('a court lent to a bracket without courts says whose match it is playing', async () => {
  vi.spyOn(api, 'listCourts').mockResolvedValue([
    {
      court: 1,
      use: 'playoff',
      label: 'Bracket 1',
      now_playing: 'Bracket 2',
      current: { id: 7, team1_name: 'Servers', team2_name: 'Liberos' },
      up_next: [],
    },
  ])

  render(
    <MemoryRouter initialEntries={['/tournaments/3/courts']}>
      <Routes>
        <Route path="/tournaments/:tournamentId/courts" element={<CourtsPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('link', { name: /court 1/i })).toHaveTextContent(
    'Bracket 1 · now playing Bracket 2',
  )
})

test('a tournament that does not exist is not found', async () => {
  vi.spyOn(api, 'listCourts').mockRejectedValue({ status: 404 })

  render(
    <MemoryRouter initialEntries={['/tournaments/999/courts']}>
      <Routes>
        <Route path="/tournaments/:tournamentId/courts" element={<CourtsPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: 'Tournament not found' })).toBeInTheDocument()
})
