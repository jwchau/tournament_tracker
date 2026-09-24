import { useEffect, useRef, useState } from 'react'

import { isNotFound } from './failure'
import { useNotifyFailure } from './useNotifyFailure'

/**
 * A page's first load: calls `load` whenever `key` changes and hands the
 * result to `onData`, so the page keeps its own state and can update it after
 * writes. Returns the load's status: 'loading', 'ready', 'not-found' (a
 * missing or malformed id), or 'failed', which also shows a notification
 * saying `failureMessage`. An answer for an old `key` is ignored.
 */
export function useLoad(load, key, { onData, failureMessage }) {
  // Each result remembers its key, so a new key reads as loading until its own
  // result arrives, without resetting state in the effect.
  const [result, setResult] = useState({ key, status: 'loading' })
  const setStatus = (status) => setResult({ key, status })
  const notifyFailure = useNotifyFailure()
  const latest = useRef({ load, onData, notifyFailure, failureMessage })
  useEffect(() => {
    latest.current = { load, onData, notifyFailure, failureMessage }
  })

  useEffect(() => {
    let cancelled = false
    latest.current
      .load()
      .then((data) => {
        if (cancelled) return
        latest.current.onData(data)
        setStatus('ready')
      })
      .catch((error) => {
        if (cancelled) return
        if (isNotFound(error)) {
          setStatus('not-found')
        } else {
          setStatus('failed')
          latest.current.notifyFailure(error, latest.current.failureMessage)
        }
      })
    return () => {
      cancelled = true
    }
    // setStatus only closes over `key`, which is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return result.key === key ? result.status : 'loading'
}
