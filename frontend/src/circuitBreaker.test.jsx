import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createCircuitBreaker } from './circuitBreaker'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('executes the function and resolves with its value while closed', async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 })
  const fn = vi.fn().mockResolvedValue('ok')

  await expect(breaker.execute(fn)).resolves.toBe('ok')
  expect(fn).toHaveBeenCalledTimes(1)
})

test('opens after failureThreshold consecutive failures and stops calling fn', async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 })
  const fn = vi.fn().mockRejectedValue(new Error('boom'))

  await expect(breaker.execute(fn)).rejects.toThrow('boom')
  await expect(breaker.execute(fn)).rejects.toThrow('boom')
  await expect(breaker.execute(fn)).rejects.toThrow('boom')
  expect(fn).toHaveBeenCalledTimes(3)

  await expect(breaker.execute(fn)).rejects.toThrow()
  expect(fn).toHaveBeenCalledTimes(3)
})

test('a success resets the consecutive failure count', async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 })
  const failing = vi.fn().mockRejectedValue(new Error('boom'))
  const succeeding = vi.fn().mockResolvedValue('ok')

  await expect(breaker.execute(failing)).rejects.toThrow()
  await expect(breaker.execute(failing)).rejects.toThrow()
  await expect(breaker.execute(succeeding)).resolves.toBe('ok')
  await expect(breaker.execute(failing)).rejects.toThrow()
  await expect(breaker.execute(failing)).rejects.toThrow()

  expect(failing).toHaveBeenCalledTimes(4)
})

test('probes again after cooldown elapses and closes on a successful probe', async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 })
  const failing = vi.fn().mockRejectedValue(new Error('boom'))

  await expect(breaker.execute(failing)).rejects.toThrow()
  await expect(breaker.execute(failing)).rejects.toThrow()
  await expect(breaker.execute(failing)).rejects.toThrow()

  await expect(breaker.execute(failing)).rejects.toThrow('circuit open')
  expect(failing).toHaveBeenCalledTimes(3)

  vi.advanceTimersByTime(30000)

  const succeeding = vi.fn().mockResolvedValue('recovered')
  await expect(breaker.execute(succeeding)).resolves.toBe('recovered')
  expect(succeeding).toHaveBeenCalledTimes(1)

  await expect(breaker.execute(failing)).rejects.toThrow('boom')
  expect(failing).toHaveBeenCalledTimes(4)
})

test('a failed probe re-opens the circuit and restarts the cooldown', async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 })
  const failing = vi.fn().mockRejectedValue(new Error('boom'))

  await expect(breaker.execute(failing)).rejects.toThrow()
  await expect(breaker.execute(failing)).rejects.toThrow()
  await expect(breaker.execute(failing)).rejects.toThrow()

  vi.advanceTimersByTime(30000)

  await expect(breaker.execute(failing)).rejects.toThrow('boom')
  expect(failing).toHaveBeenCalledTimes(4)

  vi.advanceTimersByTime(29999)
  await expect(breaker.execute(failing)).rejects.toThrow('circuit open')
  expect(failing).toHaveBeenCalledTimes(4)

  vi.advanceTimersByTime(1)
  await expect(breaker.execute(failing)).rejects.toThrow('boom')
  expect(failing).toHaveBeenCalledTimes(5)
})

test('getState reflects closed, open, and closed-again transitions', async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 30000 })
  const failing = vi.fn().mockRejectedValue(new Error('boom'))
  const succeeding = vi.fn().mockResolvedValue('ok')

  expect(breaker.getState()).toBe('closed')

  await expect(breaker.execute(failing)).rejects.toThrow()
  await expect(breaker.execute(failing)).rejects.toThrow()
  expect(breaker.getState()).toBe('closed')

  await expect(breaker.execute(failing)).rejects.toThrow()
  expect(breaker.getState()).toBe('open')

  vi.advanceTimersByTime(30000)
  await expect(breaker.execute(succeeding)).resolves.toBe('ok')
  expect(breaker.getState()).toBe('closed')
})
