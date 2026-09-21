import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { withTimeout } from './withTimeout'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('resolves with the value when the promise settles before the timeout', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 5000)
  expect(result).toBe('ok')
})

test('rejects with a timeout error if the promise never settles in time', async () => {
  const neverSettles = new Promise(() => {})

  const outcome = withTimeout(neverSettles, 5000)
  const assertion = expect(outcome).rejects.toThrow('timed out')

  await vi.advanceTimersByTimeAsync(5000)
  await assertion
})
