import { useEffect, useRef, useState } from 'react'

import { currentRound } from './bracketModel'
import { BracketCard } from './MatchCard'

// The gap between round pages, matching .round-pages in index.css.
const PAGE_GAP = 12

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The bracket on a phone, one round per page: tabs name the rounds, the
 * pages swipe sideways with the next one peeking in (and the tabs follow),
 * and each match is a card that opens it.
 */
export default function RoundPages({
  rounds,
  labels,
  teamsById,
  bestOf,
  queued,
  overflow,
  tournamentId,
  signedIn,
  selectedId,
  onSelect,
}) {
  const [active, setActive] = useState(() => currentRound(rounds))
  const pagesRef = useRef(null)
  const pageRefs = useRef({})
  const tabsRef = useRef(null)
  const tabRefs = useRef({})
  // Set while a tab click scrolls the pages, so rounds passed on the way
  // don't flash in the tabs.
  const jumping = useRef(false)

  function show(key, smooth = true) {
    setActive(key)
    const page = pageRefs.current[key]
    const pages = pagesRef.current
    if (!page || !pages?.scrollTo) return
    jumping.current = smooth
    pages.scrollTo({ left: page.offsetLeft - pages.offsetLeft, behavior: smooth ? 'smooth' : 'auto' })
    // Where scrollend never fires, let swipes drive the tabs again soon after.
    if (smooth) setTimeout(() => (jumping.current = false), 800)
  }

  // Open on the round being played.
  useEffect(() => {
    show(currentRound(rounds), false)
    // Only on first show; after that the reader's own swiping decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the active tab in view in the tab strip, without moving the page.
  useEffect(() => {
    const tab = tabRefs.current[active]
    const tabs = tabsRef.current
    if (!tab || !tabs?.scrollTo) return
    tabs.scrollTo({ left: tab.offsetLeft - tabs.offsetLeft - 16, behavior: 'smooth' })
  }, [active])

  // A swipe moves the tabs along with it.
  function handleScroll() {
    if (jumping.current) return
    const pages = pagesRef.current
    const first = pages?.firstElementChild
    if (!first) return
    const stride = first.getBoundingClientRect().width + PAGE_GAP
    const index = Math.round(pages.scrollLeft / (stride || 1))
    const round = rounds[Math.min(index, rounds.length - 1)]
    if (round && round.key !== active) setActive(round.key)
  }

  return (
    <div className="round-view">
      <nav aria-label="Rounds" className="round-tabs" ref={tabsRef}>
        {rounds.map((round) => (
          <button
            key={round.key}
            type="button"
            aria-pressed={round.key === active}
            ref={(element) => {
              tabRefs.current[round.key] = element
            }}
            onClick={() => show(round.key)}
          >
            {round.name}
          </button>
        ))}
      </nav>
      <div
        className="round-pages"
        ref={pagesRef}
        onScroll={handleScroll}
        onScrollEnd={() => {
          jumping.current = false
        }}
      >
        {rounds.map((round, index) => {
          const next = rounds[index + 1]
          return (
            <section
              key={round.key}
              className="round-page"
              aria-label={round.name}
              ref={(element) => {
                pageRefs.current[round.key] = element
              }}
            >
              <ul className="round-cards">
                {round.matches.map((match) => (
                  <BracketCard
                    key={match.id}
                    match={match}
                    label={labels[match.id]}
                    teamsById={teamsById}
                    bestOf={bestOf}
                    queuePosition={queued[match.id]}
                    overflow={overflow}
                    tournamentId={tournamentId}
                    signedIn={signedIn}
                    selected={match.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
              {next && (
                <button type="button" className="round-next" onClick={() => show(next.key)}>
                  Next: {next.name}
                  <Chevron />
                </button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
