import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import PlayerForm from './PlayerForm'

afterEach(() => {
  vi.restoreAllMocks()
})

test('submitting the form adds a player to the given team', async () => {
  vi.spyOn(api, 'createPlayer').mockResolvedValue({
    id: 1,
    team_id: 10,
    name: 'Alex Kim',
  })

  render(<PlayerForm teamId={10} />)

  fireEvent.change(screen.getByLabelText(/player name/i), {
    target: { value: 'Alex Kim' },
  })
  fireEvent.click(screen.getByRole('button', { name: /add player/i }))

  expect(await screen.findByText('Alex Kim')).toBeInTheDocument()
  expect(api.createPlayer).toHaveBeenCalledWith(10, { name: 'Alex Kim' })
})
