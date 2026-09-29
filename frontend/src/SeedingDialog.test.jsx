import { fireEvent, render, screen, within } from './testUtils'
import { expect, test, vi } from 'vitest'

import SeedingDialog from './SeedingDialog'

const team = (id, name, pool = null, rank = null) => ({ team_id: id, name, pool, pool_rank: rank })

const seeding = {
  ready: true,
  reason: null,
  tiers: [
    { tier: 1, teams: [team(1, 'Aces', 'Pool A', 1), team(2, 'Bees', 'Pool B', 1), team(3, 'Cats', 'Pool A', 2)] },
    { tier: 2, teams: [team(4, 'Dogs', 'Pool B', 2), team(5, 'Eels', 'Pool A', 3)] },
  ],
}

function renderDialog(props = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <SeedingDialog
      seeding={seeding}
      confirmLabel="Confirm and advance"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onConfirm, onCancel }
}

const names = (bracket) =>
  within(screen.getByRole('region', { name: bracket }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.seed-name').textContent)

test('confirming without changes sends the format and no seeding', () => {
  const { onConfirm } = renderDialog()

  fireEvent.click(screen.getByRole('button', { name: 'Confirm and advance' }))

  expect(onConfirm).toHaveBeenCalledWith({ format: 'single', seeding: undefined })
})

test('moving a team reorders only its own bracket, and the new order is confirmed', () => {
  const { onConfirm } = renderDialog()

  fireEvent.click(screen.getByRole('button', { name: 'Move Cats up' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move Dogs down' }))

  expect(names('Bracket 1')).toEqual(['Aces', 'Cats', 'Bees'])
  expect(names('Bracket 2')).toEqual(['Eels', 'Dogs'])

  fireEvent.click(screen.getByRole('button', { name: 'Confirm and advance' }))
  expect(onConfirm).toHaveBeenCalledWith({ format: 'single', seeding: [[1, 3, 2], [5, 4]] })
})

test('the first team cannot move up and the last cannot move down', () => {
  renderDialog()

  expect(screen.getByRole('button', { name: 'Move Aces up' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move Cats down' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move Dogs up' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move Eels down' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move Bees up' })).toBeEnabled()
})

test('resetting brings back the standings order, which then confirms as unchanged', () => {
  const { onConfirm } = renderDialog()
  expect(screen.queryByRole('button', { name: /reset to standings order/i })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Move Bees up' }))
  fireEvent.click(screen.getByRole('button', { name: /reset to standings order/i }))

  expect(names('Bracket 1')).toEqual(['Aces', 'Bees', 'Cats'])
  expect(screen.queryByRole('button', { name: /reset to standings order/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and advance' }))
  expect(onConfirm).toHaveBeenCalledWith({ format: 'single', seeding: undefined })
})

test('moving a team back to where it started counts as unchanged', () => {
  const { onConfirm } = renderDialog()

  fireEvent.click(screen.getByRole('button', { name: 'Move Bees up' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move Bees down' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and advance' }))

  expect(onConfirm).toHaveBeenCalledWith({ format: 'single', seeding: undefined })
})

test('the format is chosen in the dialog', () => {
  const { onConfirm } = renderDialog({ initialFormat: 'single' })

  fireEvent.change(screen.getByLabelText(/playoff format/i), { target: { value: 'double' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and advance' }))

  expect(onConfirm).toHaveBeenCalledWith({ format: 'double', seeding: undefined })
})

test('cancel and Escape both close it without confirming', () => {
  const { onConfirm, onCancel } = renderDialog()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.keyDown(document, { key: 'Escape' })

  expect(onCancel).toHaveBeenCalledTimes(2)
  expect(onConfirm).not.toHaveBeenCalled()
})

test('a team from no pool shows just its name, and a busy dialog cannot be confirmed again', () => {
  renderDialog({
    seeding: { ready: true, reason: null, tiers: [{ tier: 1, teams: [team(1, 'Aces'), team(2, 'Bees')] }] },
    busy: true,
  })

  expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
  expect(within(screen.getByRole('region', { name: 'Bracket 1' })).queryByText(/·/)).not.toBeInTheDocument()
})

test('focus stays on the move button after a team moves', () => {
  renderDialog()

  const button = screen.getByRole('button', { name: 'Move Cats up' })
  button.focus()
  fireEvent.click(button)

  expect(screen.getByRole('button', { name: 'Move Cats up' })).toHaveFocus()
})
