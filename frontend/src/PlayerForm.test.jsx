import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PlayerForm from './PlayerForm'

afterEach(() => {
  vi.restoreAllMocks()
})

test('submitting the form adds a player, notifies the caller, and clears the input', async () => {
  vi.spyOn(api, 'createPlayer').mockResolvedValue({
    id: 1,
    team_id: 10,
    name: 'Alex Kim',
  })
  const onCreated = vi.fn()

  render(<PlayerForm teamId={10} onCreated={onCreated} />)

  const input = screen.getByLabelText(/player name/i)
  fireEvent.change(input, { target: { value: 'Alex Kim' } })
  fireEvent.click(screen.getByRole('button', { name: /add player/i }))

  await waitFor(() =>
    expect(onCreated).toHaveBeenCalledWith({ id: 1, team_id: 10, name: 'Alex Kim' }),
  )
  expect(input).toHaveValue('')
  expect(api.createPlayer).toHaveBeenCalledWith(10, { name: 'Alex Kim' })
})

test('a player being added cannot be added twice', async () => {
  let finish
  const createPlayer = vi
    .spyOn(api, 'createPlayer')
    .mockReturnValue(new Promise((resolve) => (finish = resolve)))

  render(<PlayerForm teamId={10} />)

  fireEvent.change(screen.getByLabelText(/player name/i), { target: { value: 'Alex Kim' } })
  const form = screen.getByRole('button', { name: /add player/i }).closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)

  expect(createPlayer).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()

  finish({ id: 1, team_id: 10, name: 'Alex Kim' })

  expect(await screen.findByRole('button', { name: 'Add player' })).toBeEnabled()
})
