import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

import { usePageTrail } from './PageTrailContext'

function Chevron({ direction }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        d={direction === 'back' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Where the reader is: Home › Spring Classic › Pool A › Court 2, between an
 * arrow up to the parent and one back down the way they came. Pages they
 * came up from stay on the trail after the current one, dimmed.
 */
export default function PageTrail() {
  const { crumbs, index, up, down, goUp, goDown } = usePageTrail()
  const listRef = useRef(null)
  const currentRef = useRef(null)

  // On a phone the trail scrolls; keep the current page in view, again once
  // the names load (they change the crumbs' widths).
  const names = crumbs.map((crumb) => crumb.label).join('\n')
  useEffect(() => {
    const list = listRef.current
    const current = currentRef.current
    if (!list || !current) return undefined
    function keepCurrentInView() {
      const listBox = list.getBoundingClientRect()
      const box = current.getBoundingClientRect()
      if (box.right > listBox.right) list.scrollLeft += box.right - listBox.right
      else if (box.left < listBox.left) list.scrollLeft -= listBox.left - box.left
      markScrolled()
    }
    keepCurrentInView()
    // Web fonts arriving (or the window resizing) widen the crumbs after the
    // names load, so check again whenever the current crumb changes size.
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(keepCurrentInView)
    observer.observe(current)
    observer.observe(list)
    return () => observer.disconnect()
  }, [index, names])

  // Fade the start of the trail while earlier crumbs are scrolled out of view.
  function markScrolled() {
    const list = listRef.current
    if (list) list.dataset.scrolled = list.scrollLeft > 0 ? 'true' : 'false'
  }

  return (
    <nav className="page-trail" aria-label="Breadcrumb">
      <button
        type="button"
        className="icon-button"
        onClick={goUp}
        disabled={!up}
        aria-label={up ? `Up to ${up.label}` : 'Up'}
      >
        <Chevron direction="back" />
      </button>
      <ol className="trail-list" ref={listRef} onScroll={markScrolled}>
        {crumbs.map((crumb, position) => (
          <li
            key={crumb.path}
            className={position > index ? 'trail-ahead' : undefined}
            ref={position === index ? currentRef : undefined}
          >
            {position > 0 && (
              <svg className="trail-sep" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {position === index ? (
              <span className="trail-current" aria-current="page" title={crumb.label}>
                {crumb.label}
              </span>
            ) : (
              <Link to={crumb.path} title={crumb.label}>
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="icon-button"
        onClick={goDown}
        disabled={!down}
        aria-label={down ? `Down to ${down.label}` : 'Down'}
      >
        <Chevron direction="forward" />
      </button>
    </nav>
  )
}
