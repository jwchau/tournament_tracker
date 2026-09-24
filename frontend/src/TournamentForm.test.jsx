import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import TournamentForm from './TournamentForm'

afterEach(() => {
  vi.restoreAllMocks()
})

test('submitting the form creates a tournament, notifies the caller, and clears the input', async () => {
  vi.spyOn(api, 'createTournament').mockResolvedValue({
    id: 1,
    name: 'Spring Classic',
    stage: 'draft',
  })
  const onCreated = vi.fn()

  render(<TournamentForm onCreated={onCreated} />)

  const input = screen.getByLabelText(/tournament name/i)
  fireEvent.change(input, { target: { value: 'Spring Classic' } })
  fireEvent.click(screen.getByRole('button', { name: /create/i }))

  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith({ id: 1, name: 'Spring Classic', stage: 'draft' }),
  )
  expect(input).toHaveValue('')
  expect(api.createTournament).toHaveBeenCalledWith({ name: 'Spring Classic' })
})

test('a tournament being created cannot be created twice', async () => {
  let finish
  const createTournament = vi
    .spyOn(api, 'createTournament')
    .mockReturnValue(new Promise((resolve) => (finish = resolve)))

  render(<TournamentForm />)

  fireEvent.change(screen.getByLabelText(/tournament name/i), {
    target: { value: 'Spring Classic' },
  })
  const form = screen.getByRole('button', { name: /create/i }).closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)

  expect(createTournament).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()

  finish({ id: 1, name: 'Spring Classic' })

  expect(await screen.findByRole('button', { name: 'Create' })).toBeEnabled()
})
