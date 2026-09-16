import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import TeamForm from './TeamForm'

afterEach(() => {
  vi.restoreAllMocks()
})

test('submitting the form adds a team to the given tournament', async () => {
  vi.spyOn(api, 'createTeam').mockResolvedValue({
    id: 1,
    tournament_id: 42,
    name: 'Ice Wolves',
  })

  render(<TeamForm tournamentId={42} />)

  fireEvent.change(screen.getByLabelText(/team name/i), {
    target: { value: 'Ice Wolves' },
  })
  fireEvent.click(screen.getByRole('button', { name: /add team/i }))

  expect(await screen.findByText('Ice Wolves')).toBeInTheDocument()
  expect(api.createTeam).toHaveBeenCalledWith(42, { name: 'Ice Wolves' })
})
