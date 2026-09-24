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

// A request whose failure nothing handled, as the browser reports it.
function unhandledRejection(reason) {
  const event = new Event('unhandledrejection')
  event.reason = reason
  act(() => {
    window.dispatchEvent(event)
  })
}

function refused(status, detail) {
  return { status, json: () => Promise.resolve({ detail }) }
}

test('a failed request nothing handled shows the reason as an error', async () => {
  vi.useRealTimers()
  render(<NotificationProvider />)

  unhandledRejection(refused(400, 'Pool A has no schedule yet'))

  expect(await screen.findByRole('alert')).toHaveTextContent('Pool A has no schedule yet')
})

test('an unhandled network failure says the server could not be reached', async () => {
  vi.useRealTimers()
  render(<NotificationProvider />)

  unhandledRejection(new TypeError('Failed to fetch'))

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the server/i)
})

test('an unhandled sign-in refusal is left to the sign-in redirect', async () => {
  vi.useRealTimers()
  render(<NotificationProvider />)

  unhandledRejection(refused(401, 'Not signed in'))
  unhandledRejection(new Error('not a request'))
  await act(() => Promise.resolve())

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
