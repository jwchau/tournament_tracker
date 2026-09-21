import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { NotificationProvider, useNotify } from './NotificationContext'

function Trigger({ message = 'Tournament created', type }) {
  const notify = useNotify()
  return (
    <button type="button" onClick={() => notify(message, type ? { type } : undefined)}>
      Trigger
    </button>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('shows a notification and removes it after 5 seconds', () => {
  render(
    <NotificationProvider>
      <Trigger />
    </NotificationProvider>,
  )

  act(() => {
    screen.getByRole('button', { name: /trigger/i }).click()
  })

  expect(screen.getByText('Tournament created')).toBeInTheDocument()

  act(() => {
    vi.advanceTimersByTime(5000)
  })

  expect(screen.queryByText('Tournament created')).not.toBeInTheDocument()
})

test('stacks multiple notifications with the most recent first', () => {
  render(
    <NotificationProvider>
      <Trigger />
    </NotificationProvider>,
  )

  act(() => {
    screen.getByRole('button', { name: /trigger/i }).click()
    screen.getByRole('button', { name: /trigger/i }).click()
  })

  expect(screen.getAllByText('Tournament created')).toHaveLength(2)
})

test('renders an error notification with an alert role', () => {
  render(
    <NotificationProvider>
      <Trigger message="Failed to generate bracket" type="error" />
    </NotificationProvider>,
  )

  act(() => {
    screen.getByRole('button', { name: /trigger/i }).click()
  })

  expect(screen.getByRole('alert')).toHaveTextContent('Failed to generate bracket')
})
