import { useEffect, useRef, useState } from 'react'

// Taps within this long of each other are sent as one running score.
export const SAVE_DELAY_MS = 600

export const sameScores = (a, b) => a.team1 === b.team1 && a.team2 === b.team2

/**
 * A score kept rally by rally and saved as it goes: each change is sent
 * (debounced) with send(scores, version), which returns the updated match.
 * onSaved gets that match so the caller can take its new version.
 *
 * state is 'idle' (nothing changed here yet), 'dirty', 'saving', 'saved',
 * 'error' or 'conflict'; synced is true in idle and saved, when a newer score
 * from another device may replace this one.
 */
export function useRunningScore({ initial, version, send, onSaved }) {
  const [scores, setScores] = useState(initial)
  const [state, setState] = useState('idle')
  // What's on the board now, for a save that returns after more taps.
  const latest = useRef(scores)
  useEffect(() => {
    latest.current = scores
  }, [scores])

  useEffect(() => {
    if (state !== 'dirty') return undefined
    const timer = setTimeout(async () => {
      const sent = latest.current
      setState('saving')
      try {
        const updated = await send(sent, version)
        onSaved?.(updated)
        // Points tapped while this save was out go in the next one.
        setState(sameScores(latest.current, sent) ? 'saved' : 'dirty')
      } catch (error) {
        setState(error?.status === 409 ? 'conflict' : 'error')
      }
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // send and onSaved are fresh each render; the save only depends on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, scores, version])

  function change(next) {
    setScores(next)
    if (state !== 'conflict') setState((current) => (current === 'saving' ? current : 'dirty'))
  }

  // Take a score from elsewhere (another device, a refetch, a new game) as the saved one.
  function adopt(next) {
    setScores(next)
    setState('idle')
  }

  return {
    scores,
    state,
    synced: state === 'idle' || state === 'saved',
    change,
    adopt,
    retry: () => setState('dirty'),
  }
}
