import { useEffect, useState } from 'react'

import { getBracketDispatch, getPlayoffBracketMatches, holdMatch, setMatchRef } from './api'
import { createCircuitBreaker } from './circuitBreaker'
import { refUpdate } from './refModel'
import { withTimeout } from './withTimeout'

// How often a bracket is read, by how live it is: quickly while a match is on a
// court (its scores are moving), slowly while matches wait for one, and rarely
// once every match is finished (only a correction can change it).
export const LIVE_POLL_MS = 4000
export const WAITING_POLL_MS = 10000
export const DONE_POLL_MS = 30000
const REQUEST_TIMEOUT_MS = 5000
const FAILURE_THRESHOLD = 3
export const COOLDOWN_MS = 30000

export function pollInterval(matches) {
  if (matches.length === 0) return LIVE_POLL_MS
  if (matches.every((match) => match.status === 'complete')) return DONE_POLL_MS
  const onACourt = matches.some((match) => match.court != null && match.status !== 'complete')
  return onACourt ? LIVE_POLL_MS : WAITING_POLL_MS
}

/**
 * A playoff bracket's matches and court queue, polled, with the changes an
 * organizer makes to them. Polling backs off after repeated failures
 * (connectionLost) and resumes after a cooldown, slows as the bracket gets
 * less live (see pollInterval), and stops while the tab is hidden.
 */
export function useBracketMatches(playoffBracketId) {
  const [matches, setMatches] = useState([])
  // False until the first load, so nothing shows up empty.
  const [loaded, setLoaded] = useState(false)
  const [dispatch, setDispatch] = useState(null)
  const [holdError, setHoldError] = useState(null)
  const [refError, setRefError] = useState(null)
  const [connectionLost, setConnectionLost] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer = null
    // What the last read found, for how soon to read again.
    let latest = []
    const breaker = createCircuitBreaker({
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
    })

    function schedule() {
      clearTimeout(timer)
      if (cancelled || document.hidden) return
      timer = setTimeout(refresh, pollInterval(latest))
    }

    function refresh() {
      clearTimeout(timer)
      breaker
        .execute(() => withTimeout(getPlayoffBracketMatches(playoffBracketId), REQUEST_TIMEOUT_MS))
        .then((data) => {
          if (cancelled) return
          latest = data
          setMatches(data)
          setLoaded(true)
        })
        .catch(() => {})
        .finally(() => {
          if (cancelled) return
          setConnectionLost(breaker.getState() === 'open')
          schedule()
        })
      // Queue places only; the bracket still works without them.
      getBracketDispatch(playoffBracketId)
        .then((data) => {
          if (!cancelled) setDispatch(data)
        })
        .catch(() => {})
    }

    // Nobody is looking at a hidden tab, so stop polling until it is shown again.
    function handleVisibilityChange() {
      if (document.hidden) clearTimeout(timer)
      else refresh()
    }

    refresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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

  // A hand-set ref can take a team off another court's automatic ref, so reload.
  async function setRef(match, choice) {
    try {
      replaceMatch(await setMatchRef(match.id, { ...refUpdate(choice), version: match.version }))
      setRefError(null)
    } catch (failure) {
      const body = await failure?.json?.().catch(() => null)
      setRefError(body?.detail ?? "Couldn't change the ref. Please refresh and try again.")
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

  return {
    matches,
    loaded,
    dispatch,
    connectionLost,
    holdError,
    refError,
    replaceMatch,
    hold,
    setRef,
    corrected,
  }
}
