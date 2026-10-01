import { fireEvent, render, screen, waitFor } from './testUtils'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import InlineAddPlayer from './InlineAddPlayer'
import { NotificationProvider } from './NotificationContext'

afterEach(() => {
  vi.restoreAllMocks()
})

const team = { id: 10, name: 'Aces' }

function renderBox(onAdded = vi.fn()) {
  render(
    <NotificationProvider>
      <InlineAddPlayer team={team} onAdded={onAdded} />
    </NotificationProvider>,
  )
  return onAdded
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add players to Aces' }))
const nameBox = () => screen.getByLabelText('Player name for Aces')

function enter(name) {
  fireEvent.change(nameBox(), { target: { value: name } })
  fireEvent.submit(nameBox().closest('form'))
}

test('starts as a small button and opens a focused name box', () => {
  renderBox()

  expect(screen.queryByLabelText('Player name for Aces')).not.toBeInTheDocument()
  open()

  expect(nameBox()).toHaveFocus()
})

test('Enter adds the player, then the box is empty, still open and focused for the next', async () => {
  const createPlayer = vi
    .spyOn(api, 'createPlayer')
    .mockResolvedValueOnce({ id: 1, team_id: 10, name: 'Alex Kim' })
    .mockResolvedValueOnce({ id: 2, team_id: 10, name: 'Blake Lee' })
  const onAdded = renderBox()
  open()

  enter('Alex Kim')

  await waitFor(() => expect(onAdded).toHaveBeenCalledWith({ id: 1, team_id: 10, name: 'Alex Kim' }))
  expect(createPlayer).toHaveBeenCalledWith(10, { name: 'Alex Kim' })
  expect(nameBox()).toHaveValue('')
  expect(nameBox()).toHaveFocus()

  enter('Blake Lee')
  await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(2))
})

test('a blank name adds nothing, and a name is trimmed', async () => {
  const createPlayer = vi
    .spyOn(api, 'createPlayer')
    .mockResolvedValue({ id: 1, team_id: 10, name: 'Alex Kim' })
  renderBox()
  open()

  enter('   ')
  expect(createPlayer).not.toHaveBeenCalled()

  enter('  Alex Kim ')
  await waitFor(() => expect(createPlayer).toHaveBeenCalledWith(10, { name: 'Alex Kim' }))
})

test('Escape and Done close the box', () => {
  renderBox()
  open()

  fireEvent.keyDown(nameBox(), { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Add players to Aces' })).toBeInTheDocument()

  open()
  fireEvent.click(screen.getByRole('button', { name: 'Done adding players to Aces' }))
  expect(screen.getByRole('button', { name: 'Add players to Aces' })).toBeInTheDocument()
})

test('a failure is shown and the typed name is kept so it can be tried again', async () => {
  vi.spyOn(api, 'createPlayer').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'Team not found' }),
  })
  const onAdded = renderBox()
  open()

  enter('Alex Kim')

  expect(await screen.findByText('Team not found')).toBeInTheDocument()
  expect(nameBox()).toHaveValue('Alex Kim')
  expect(onAdded).not.toHaveBeenCalled()
})

test('submitting twice quickly adds the player once', async () => {
  let finish
  const createPlayer = vi.spyOn(api, 'createPlayer').mockImplementation(
    () => new Promise((resolve) => (finish = () => resolve({ id: 1, team_id: 10, name: 'Alex Kim' }))),
  )
  renderBox()
  open()

  enter('Alex Kim')
  fireEvent.submit(nameBox().closest('form'))
  finish()

  await waitFor(() => expect(nameBox()).toHaveValue(''))
  expect(createPlayer).toHaveBeenCalledTimes(1)
})
