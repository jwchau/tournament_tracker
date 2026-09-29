import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ancestorsOf, labelOf, placeholderLabel } from './trailModel'

const PageTrailContext = createContext(null)

/**
 * The trail from Home to the current page, plus the pages below it the
 * reader came up from. Moving to a page already on the trail (the arrows, a
 * crumb, or a link that happens to lead there) keeps it; any other page
 * starts a fresh trail through its own parents, dropping what was below.
 */
export function PageTrailProvider({ children }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // `pending` is the page whose parents are still being worked out (the trail
  // meanwhile is a guess), and `cameFrom` the page the reader left for it.
  const [trail, setTrail] = useState({ paths: [], index: -1, pending: null, cameFrom: null })
  const trailRef = useRef(trail)
  const [labels, setLabels] = useState({})

  function update(next) {
    trailRef.current = next
    setTrail(next)
  }

  useEffect(() => {
    const current = trailRef.current
    // The same move again (React re-runs effects in development) resumes it.
    const resuming = current.pending === pathname
    if (!resuming && !current.pending) {
      const at = current.paths.indexOf(pathname)
      if (at !== -1) {
        update({ ...current, index: at })
        return undefined
      }
    }
    const cameFrom = resuming ? current.cameFrom : current.paths[current.index]
    if (!resuming) {
      // Until its parents are known, guess the common case: a link down from
      // the page the reader was on (or, on first load, straight under Home).
      const guess = current.index >= 0 ? current.paths.slice(0, current.index + 1) : ['/']
      const provisional = pathname === '/' ? ['/'] : [...guess, pathname]
      update({ paths: provisional, index: provisional.length - 1, pending: pathname, cameFrom })
    }
    let cancelled = false
    ancestorsOf(pathname, cameFrom).then((ancestors) => {
      if (cancelled) return
      update({ paths: [...ancestors, pathname], index: ancestors.length, pending: null, cameFrom: null })
    })
    return () => {
      cancelled = true
    }
  }, [pathname])

  // Names come from cached page data, so refreshing them on every move is cheap
  // and picks up a rename.
  useEffect(() => {
    let cancelled = false
    for (const path of trail.paths) {
      labelOf(path).then((label) => {
        if (!cancelled) setLabels((current) => (current[path] === label ? current : { ...current, [path]: label }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [trail.paths, pathname])

  const crumbs = trail.paths.map((path) => ({ path, label: labels[path] ?? placeholderLabel(path) }))
  const up = trail.index > 0 ? crumbs[trail.index - 1] : null
  const down = trail.index >= 0 && trail.index < crumbs.length - 1 ? crumbs[trail.index + 1] : null

  return (
    <PageTrailContext.Provider
      value={{
        crumbs,
        index: trail.index,
        up,
        down,
        goUp: () => up && navigate(up.path),
        goDown: () => down && navigate(down.path),
      }}
    >
      {children}
    </PageTrailContext.Provider>
  )
}

export function usePageTrail() {
  return useContext(PageTrailContext)
}
