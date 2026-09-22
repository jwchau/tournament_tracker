import { useEffect, useRef } from 'react'

const POLL_INTERVAL_MS = 4000

/**
 * Call `load` now and every 4s while mounted, handing each result to
 * `onData`. Failed polls are ignored; the next tick simply tries again.
 * `key` restarts polling when it changes (e.g. a different pool); the
 * latest `load`/`onData` are always used without restarting.
 */
export function usePolling(load, onData, key) {
  const latest = useRef({ load, onData })
  useEffect(() => {
    latest.current = { load, onData }
  })

  useEffect(() => {
    let cancelled = false
    function refresh() {
      latest.current
        .load()
        .then((data) => {
          if (!cancelled) latest.current.onData(data)
        })
        .catch(() => {})
    }
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [key])
}
