export function createCircuitBreaker({ failureThreshold, cooldownMs }) {
  let consecutiveFailures = 0
  let open = false
  let openedAt = null

  function withinCooldown() {
    return Date.now() - openedAt < cooldownMs
  }

  async function execute(fn) {
    if (open && withinCooldown()) {
      throw new Error('circuit open')
    }

    try {
      const result = await fn()
      consecutiveFailures = 0
      open = false
      openedAt = null
      return result
    } catch (error) {
      consecutiveFailures += 1
      if (consecutiveFailures >= failureThreshold) {
        open = true
        openedAt = Date.now()
      }
      throw error
    }
  }

  function getState() {
    if (!open) return 'closed'
    return withinCooldown() ? 'open' : 'half-open'
  }

  return { execute, getState }
}
