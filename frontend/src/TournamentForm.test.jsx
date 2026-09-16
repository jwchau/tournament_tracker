import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import TournamentForm from './TournamentForm'

afterEach(() => {
  vi.restoreAllMocks()
})

test('submitting the form creates a tournament and shows it', async () => {
  vi.spyOn(api, 'createTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    stage: 'draft',
  })

  render(<TournamentForm />)

  fireEvent.change(screen.getByLabelText(/tournament name/i), {
    target: { value: 'Spring Classic' },
  })
  fireEvent.click(screen.getByRole('button', { name: /create/i }))

  expect(await screen.findByText('Spring Classic')).toBeInTheDocument()
  expect(api.createTournament).toHaveBeenCalledWith({ name: 'Spring Classic' })
})
