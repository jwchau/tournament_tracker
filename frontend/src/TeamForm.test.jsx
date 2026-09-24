import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import TeamForm from './TeamForm'

afterEach(() => {
  vi.restoreAllMocks()
})

test('submitting the form adds a team, notifies the caller, and clears the input', async () => {
  vi.spyOn(api, 'createTeam').mockResolvedValue({
    id: 1,
    tournament_id: 42,
    name: 'Ice Wolves',
  })
  const onCreated = vi.fn()

  render(<TeamForm tournamentId={42} onCreated={onCreated} />)

  const input = screen.getByLabelText(/team name/i)
  fireEvent.change(input, { target: { value: 'Ice Wolves' } })
  fireEvent.click(screen.getByRole('button', { name: /add team/i }))

  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith({ id: 1, tournament_id: 42, name: 'Ice Wolves' }),
  )
  expect(input).toHaveValue('')
  expect(api.createTeam).toHaveBeenCalledWith(42, { name: 'Ice Wolves' })
})

test('a team being added cannot be added twice', async () => {
  let finish
  const createTeam = vi
    .spyOn(api, 'createTeam')
    .mockReturnValue(new Promise((resolve) => (finish = resolve)))

  render(<TeamForm tournamentId={42} />)

  fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Ice Wolves' } })
  const form = screen.getByRole('button', { name: /add team/i }).closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)

  expect(createTeam).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()

  finish({ id: 1, tournament_id: 42, name: 'Ice Wolves' })

  expect(await screen.findByRole('button', { name: 'Add team' })).toBeEnabled()
})
