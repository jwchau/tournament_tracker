import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 10000
const REFRESH_THROTTLE_MS = 3000

/**
 * Call `load` now and again 10s after each fetch while mounted, handing each
 * result to `onData`. Failed polls are ignored; the next tick simply tries
 * again. `key` restarts polling when it changes (e.g. a different pool); the
 * latest `load`/`onData` are always used without restarting.
 *
 * Returns `{ refresh }`: fetch right away, which also restarts the 10s wait
 * so an automatic fetch doesn't follow right behind a manual one. Manual
 * refreshes are throttled to one per 3s; `canRefresh` is false meanwhile.
 *
 * With `auto: false` nothing is scheduled: it loads when `key` changes or on
 * a manual refresh, for data that only changes when something else does.
 *
 * `onError` hears about each failed fetch, e.g. to notice a missing id.
 */
export function usePolling(load, onData, key, { auto = true, onError } = {}) {
  const latest = useRef({ load, onData, onError })
  useEffect(() => {
    latest.current = { load, onData, onError }
  })
  const refreshRef = useRef(() => Promise.resolve())

  useEffect(() => {
    let cancelled = false
    let timer = null

    function refresh() {
      clearTimeout(timer)
      if (auto) {
        timer = setTimeout(() => {
          if (!document.hidden) refresh()
        }, POLL_INTERVAL_MS)
      }
      return latest.current
        .load()
        .then((data) => {
          if (!cancelled) latest.current.onData(data)
        })
        .catch((error) => {
          if (!cancelled) latest.current.onError?.(error)
        })
    }

    // Nobody is looking at a hidden tab, so stop polling until it's shown.
    function handleVisibilityChange() {
      if (document.hidden) {
        clearTimeout(timer)
      } else {
        refresh()
      }
    }

    refreshRef.current = refresh
    refresh()
    if (auto) document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [key, auto])

  const [canRefresh, setCanRefresh] = useState(true)
  const throttle = useRef({ blocked: false, timer: null })
  useEffect(() => () => clearTimeout(throttle.current.timer), [])

  const refresh = useCallback(() => {
    if (throttle.current.blocked) return Promise.resolve()
    throttle.current.blocked = true
    setCanRefresh(false)
    throttle.current.timer = setTimeout(() => {
      throttle.current.blocked = false
      setCanRefresh(true)
    }, REFRESH_THROTTLE_MS)
    return refreshRef.current()
  }, [])

  return { refresh, canRefresh }
}
