import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import HealthCheck from './HealthCheck'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders connected state after a successful health check', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }),
  )

  render(<HealthCheck />)

  expect(await screen.findByText(/connected/i)).toBeInTheDocument()
})
