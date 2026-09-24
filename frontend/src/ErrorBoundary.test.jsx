import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import ErrorBoundary from './ErrorBoundary'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function Broken() {
  throw new Error('render failed')
}

test('renders its children when nothing goes wrong', () => {
  render(
    <ErrorBoundary>
      <p>Bracket 1</p>
    </ErrorBoundary>,
  )

  expect(screen.getByText('Bracket 1')).toBeInTheDocument()
})

test('a render error shows a message with a reload button instead of a blank page', () => {
  // React logs the caught error; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })

  render(
    <ErrorBoundary>
      <Broken />
    </ErrorBoundary>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
  expect(reload).toHaveBeenCalled()
})
