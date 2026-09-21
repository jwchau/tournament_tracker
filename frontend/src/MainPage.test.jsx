import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import MainPage from './MainPage'

afterEach(() => {
  vi.restoreAllMocks()
})

test('renders each tournament with its name and team count, linking to its page', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([
    { id: 1, name: 'Spring Classic', team_count: 3 },
    { id: 2, name: 'Fall Invitational', team_count: 0 },
  ])

  render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
  )

  const link = await screen.findByRole('link', { name: /spring classic/i })
  expect(link).toHaveAttribute('href', '/tournaments/1')
  expect(screen.getByText(/3 teams/i)).toBeInTheDocument()

  const otherLink = screen.getByRole('link', { name: /fall invitational/i })
  expect(otherLink).toHaveAttribute('href', '/tournaments/2')
  expect(screen.getByText(/0 teams/i)).toBeInTheDocument()
})

test('creating a tournament adds it to the list', async () => {
  vi.spyOn(api, 'listTournaments').mockResolvedValue([])
  vi.spyOn(api, 'createTournament').mockResolvedValue({
    id: 5,
    name: 'Winter Cup',
    team_count: 0,
  })

  render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>,
  )

  fireEvent.change(screen.getByLabelText(/tournament name/i), {
    target: { value: 'Winter Cup' },
  })
  fireEvent.click(screen.getByRole('button', { name: /create/i }))

  expect(await screen.findByRole('link', { name: /winter cup/i })).toBeInTheDocument()
})
