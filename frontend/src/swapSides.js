import { createContext, useState } from 'react'

// Whether a court's scoreboard shows the second team on the left, for a
// scorekeeper standing on the other side of the net. Scores stay with their
// teams; only the order on screen changes.
export const SwapSidesContext = createContext(false)

function storageKey(tournamentId, court) {
  return `court-sides:${tournamentId}:${court}`
}

// Remembered per court on this device; storage can be unavailable (a private
// window), in which case the choice just lasts for this visit.
export function useSwapSides(tournamentId, court) {
  const key = storageKey(tournamentId, court)
  const [swapped, setSwapped] = useState(() => {
    try {
      return localStorage.getItem(key) === 'swapped'
    } catch {
      return false
    }
  })

  function toggle() {
    const next = !swapped
    setSwapped(next)
    try {
      if (next) localStorage.setItem(key, 'swapped')
      else localStorage.removeItem(key)
    } catch {
      // Not remembered, but still swapped for now.
    }
  }

  return [swapped, toggle]
}
