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
