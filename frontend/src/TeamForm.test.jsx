import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { NotificationProvider } from './NotificationContext'
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

  // The name clears once added, so the button stays off until a new one is typed.
  expect(await screen.findByRole('button', { name: 'Add team' })).toBeDisabled()
})

test('with a reason to wait, the form is off and says why', () => {
  const createTeam = vi.spyOn(api, 'createTeam')

  render(<TeamForm tournamentId={42} disabledReason="Pool play has started, so teams can't be added." />)

  expect(screen.getByLabelText(/team name/i)).toBeDisabled()
  expect(screen.getByRole('button', { name: /add team/i })).toBeDisabled()
  expect(screen.getByText("Pool play has started, so teams can't be added.")).toBeInTheDocument()
  fireEvent.submit(screen.getByLabelText(/team name/i).closest('form'))
  expect(createTeam).not.toHaveBeenCalled()
})

test('a team the server refuses says why and keeps what was typed', async () => {
  vi.spyOn(api, 'createTeam').mockRejectedValue({
    json: () => Promise.resolve({ detail: 'pool play has started, so teams can no longer be added' }),
  })
  const onCreated = vi.fn()

  render(
    <NotificationProvider>
      <TeamForm tournamentId={42} onCreated={onCreated} />
    </NotificationProvider>,
  )

  const input = screen.getByLabelText(/team name/i)
  fireEvent.change(input, { target: { value: 'Ice Wolves' } })
  fireEvent.click(screen.getByRole('button', { name: /add team/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/pool play has started/)
  expect(onCreated).not.toHaveBeenCalled()
  expect(input).toHaveValue('Ice Wolves')
})

test('a blank name cannot be submitted', () => {
  const createTeam = vi.spyOn(api, 'createTeam')

  render(<TeamForm tournamentId={42} />)

  const input = screen.getByLabelText(/team name/i)
  expect(screen.getByRole('button', { name: /add team/i })).toBeDisabled()
  fireEvent.change(input, { target: { value: '   ' } })
  expect(screen.getByRole('button', { name: /add team/i })).toBeDisabled()
  fireEvent.submit(input.closest('form'))
  expect(createTeam).not.toHaveBeenCalled()
})

test('a placeholder names the empty box while its label stays for screen readers', () => {
  render(<TeamForm tournamentId={42} placeholder="Team name" />)

  const input = screen.getByLabelText('Team name')
  expect(input).toHaveAttribute('placeholder', 'Team name')
})

test('without a placeholder the box shows none', () => {
  render(<TeamForm tournamentId={42} />)

  expect(screen.getByLabelText('Team name')).not.toHaveAttribute('placeholder')
})
