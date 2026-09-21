import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import ConfirmModal from './ConfirmModal'

test('renders nothing when closed', () => {
  render(
    <ConfirmModal
      open={false}
      title="Delete tournament"
      message="Are you sure?"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  )

  expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
})

test('shows the title and message, and calls the right handler for each button', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  render(
    <ConfirmModal
      open
      title="Delete tournament"
      message="Are you sure?"
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )

  expect(screen.getByRole('dialog', { name: /delete tournament/i })).toBeInTheDocument()
  expect(screen.getByText('Are you sure?')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(onCancel).toHaveBeenCalled()
  expect(onConfirm).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: /delete/i }))
  expect(onConfirm).toHaveBeenCalled()
})
