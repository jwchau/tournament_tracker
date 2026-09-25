import { useEffect, useState } from 'react'

import { getBracketDispatch, getPlayoffBracketMatches, holdMatch } from './api'
import { createCircuitBreaker } from './circuitBreaker'
import { withTimeout } from './withTimeout'

const POLL_INTERVAL_MS = 4000
const REQUEST_TIMEOUT_MS = 5000
const FAILURE_THRESHOLD = 3
export const COOLDOWN_MS = 30000

/**
 * A playoff bracket's matches and court queue, polled, with the changes an
 * organizer makes to them. Polling backs off after repeated failures
 * (connectionLost) and resumes after a cooldown.
 */
export function useBracketMatches(playoffBracketId) {
  const [matches, setMatches] = useState([])
  // False until the first load, so nothing shows up empty.
  const [loaded, setLoaded] = useState(false)
  const [dispatch, setDispatch] = useState(null)
  const [holdError, setHoldError] = useState(null)
  const [connectionLost, setConnectionLost] = useState(false)

  useEffect(() => {
    let cancelled = false
    const breaker = createCircuitBreaker({
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
    })

    function refresh() {
      breaker
        .execute(() => withTimeout(getPlayoffBracketMatches(playoffBracketId), REQUEST_TIMEOUT_MS))
        .then((data) => {
          if (cancelled) return
          setMatches(data)
          setLoaded(true)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setConnectionLost(breaker.getState() === 'open')
        })
      // Queue places only; the bracket still works without them.
      getBracketDispatch(playoffBracketId)
        .then((data) => {
          if (!cancelled) setDispatch(data)
        })
        .catch(() => {})
    }

    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [playoffBracketId])

  function replaceMatch(updated) {
    setMatches((current) =>
      current.map((match) => (match.id === updated.id ? updated : match)),
    )
  }

  function reload() {
    getPlayoffBracketMatches(playoffBracketId)
      .then(setMatches)
      .catch(() => {})
    getBracketDispatch(playoffBracketId)
      .then(setDispatch)
      .catch(() => {})
  }

  // Holding or releasing moves other matches on and off courts, so reload both.
  async function hold(match, onHold) {
    try {
      replaceMatch(await holdMatch(match.id, { onHold, version: match.version }))
      setHoldError(null)
    } catch (failure) {
      const body = await failure?.json?.().catch(() => null)
      setHoldError(body?.detail ?? "Couldn't change the hold. Please refresh and try again.")
    }
    reload()
  }

  function corrected({ match: correctedMatch, reset_matches: resetMatches }) {
    const updatedById = Object.fromEntries(
      [correctedMatch, ...resetMatches].map((match) => [match.id, match]),
    )
    setMatches((current) => current.map((match) => updatedById[match.id] ?? match))
    // A correction can delete or create the grand final reset match, which
    // the response can't express as an update, so reload the whole bracket.
    reload()
  }

  return { matches, loaded, dispatch, connectionLost, holdError, replaceMatch, hold, corrected }
}
