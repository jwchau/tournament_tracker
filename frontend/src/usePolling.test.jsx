import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { usePolling } from './usePolling'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete document.hidden
})

async function advance(ms) {
  await act(() => vi.advanceTimersByTimeAsync(ms))
}

test('loads on mount, then refreshes automatically every 10 seconds', async () => {
  const load = vi.fn().mockResolvedValue('rows')
  const onData = vi.fn()

  renderHook(() => usePolling(load, onData, 1))
  await advance(0)
  expect(load).toHaveBeenCalledTimes(1)
  expect(onData).toHaveBeenCalledWith('rows')

  await advance(9999)
  expect(load).toHaveBeenCalledTimes(1)
  await advance(1)
  expect(load).toHaveBeenCalledTimes(2)
})

test('a manual refresh fetches now and restarts the 10 second wait', async () => {
  const load = vi.fn().mockResolvedValue('rows')
  const { result } = renderHook(() => usePolling(load, vi.fn(), 1))
  await advance(6000)

  await act(() => result.current.refresh())
  expect(load).toHaveBeenCalledTimes(2)

  // The old schedule (10s after mount) no longer fires...
  await advance(4000)
  expect(load).toHaveBeenCalledTimes(2)
  // ...the next automatic fetch is 10s after the manual one.
  await advance(6000)
  expect(load).toHaveBeenCalledTimes(3)
})

test('manual refresh is throttled to once every 3 seconds', async () => {
  const load = vi.fn().mockResolvedValue('rows')
  const { result } = renderHook(() => usePolling(load, vi.fn(), 1))
  await advance(0)
  expect(result.current.canRefresh).toBe(true)

  await act(() => result.current.refresh())
  expect(load).toHaveBeenCalledTimes(2)
  expect(result.current.canRefresh).toBe(false)

  await act(() => result.current.refresh())
  await advance(2999)
  await act(() => result.current.refresh())
  expect(load).toHaveBeenCalledTimes(2)
  expect(result.current.canRefresh).toBe(false)

  await advance(1)
  expect(result.current.canRefresh).toBe(true)
  await act(() => result.current.refresh())
  expect(load).toHaveBeenCalledTimes(3)
})

function setTabHidden(hidden) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

test('pauses while the tab is hidden and fetches as soon as it is shown again', async () => {
  const load = vi.fn().mockResolvedValue('rows')
  renderHook(() => usePolling(load, vi.fn(), 1))
  await advance(0)

  await act(async () => setTabHidden(true))
  await advance(60000)
  expect(load).toHaveBeenCalledTimes(1)

  await act(async () => setTabHidden(false))
  expect(load).toHaveBeenCalledTimes(2)
  await advance(10000)
  expect(load).toHaveBeenCalledTimes(3)
})
