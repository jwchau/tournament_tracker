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
