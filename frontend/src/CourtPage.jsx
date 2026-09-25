import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { listCourts } from './api'
import { loginPath, useAuth } from './auth'
import { boardScores } from './boardScores'
import { courtLabel } from './courtLabel'
import { isNotFound } from './failure'
import FlipBoard from './FlipBoard'
import LiveScore from './LiveScore'
import Loading from './Loading'
import NotFound from './NotFound'
import SeriesForm from './SeriesForm'
import { SwapSidesContext, useSwapSides } from './swapSides'
import { usePolling } from './usePolling'

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        d="M7 7h12m0 0-3.5-3.5M19 7l-3.5 3.5M17 17H5m0 0 3.5 3.5M5 17l3.5-3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function teams(match) {
  return `${match.team1_name ?? 'TBD'} vs ${match.team2_name ?? 'TBD'}`
}

/**
 * One court for the scorekeeper standing at it: the match on it now as a
 * scoreboard, and what comes after. Polls, and refetches right after each
 * finished match, so the next match comes on without a reload.
 */
export default function CourtPage() {
  const { tournamentId, court: courtNumber } = useParams()
  // null until the first load, so "not found" doesn't flash.
  const [courts, setCourts] = useState(null)
  const { user } = useAuth()
  const location = useLocation()

  const [notFound, setNotFound] = useState(false)

  const { refresh } = usePolling(() => listCourts(tournamentId), setCourts, tournamentId, {
    onError: (error) => setNotFound(isNotFound(error)),
  })
  const [swapped, toggleSwapped] = useSwapSides(tournamentId, courtNumber)

  if (notFound) return <NotFound thing="Tournament" />
  if (courts === null) return <Loading label="Loading court" />
  const court = courts.find((entry) => entry.court === Number(courtNumber))
  if (!court) return <NotFound thing="Court" />
  const { current } = court

  return (
    <div className="court-page">
      <header className="court-strip court-strip-narrow">
        <div className="court-strip-title">
          <h2>Court {court.court}</h2>
          {court.label && <p className="court-strip-label">{courtLabel(court)}</p>}
        </div>
        <div className="court-strip-actions">
          {current && (
            <button
              type="button"
              className="swap-sides"
              aria-pressed={swapped}
              onClick={toggleSwapped}
            >
              <SwapIcon />
              <span className="swap-sides-label">Swap sides</span>
            </button>
          )}
          <Link to={`/tournaments/${tournamentId}/courts`} className="court-strip-link">
            All courts
          </Link>
        </div>
      </header>

      {current ? (
        <SwapSidesContext.Provider value={swapped}>
        <section aria-labelledby="now-playing" className="now-playing">
          <h3 id="now-playing" className="visually-hidden">
            Now playing
          </h3>
          {/* Keyed by match, so the next match starts on a fresh board. */}
          {!user ? (
            <>
              <p className="court-match">
                {teams(current)} · <Link to={loginPath(location.pathname)}>Sign in</Link> to
                keep score.
              </p>
              {current.best_of > 1 && (
                <p className="series-tally">
                  Best of {current.best_of} · games {current.team1_score ?? 0}–
                  {current.team2_score ?? 0}
                </p>
              )}
              <FlipBoard
                readOnly
                team1Name={current.team1_name ?? 'TBD'}
                team2Name={current.team2_name ?? 'TBD'}
                scores={boardScores(current)}
              />
            </>
          ) : current.best_of > 1 ? (
            <SeriesForm
              key={current.id}
              board
              match={current}
              bestOf={current.best_of}
              team1Name={current.team1_name}
              team2Name={current.team2_name}
              onScored={refresh}
            />
          ) : (
            <LiveScore
              key={current.id}
              match={current}
              team1Name={current.team1_name}
              team2Name={current.team2_name}
              onScored={refresh}
            />
          )}
        </section>
        </SwapSidesContext.Provider>
      ) : (
        <p className="setup-note">Nothing left to play on this court right now.</p>
      )}

      {court.up_next.length > 0 && (
        <section aria-labelledby="up-next" className="up-next">
          <h3 id="up-next">Up next</h3>
          {court.use === 'playoff' && (
            <p className="section-note">
              These go to the next free {court.label} court, which may not be this one.
            </p>
          )}
          <ol className="up-next-list">
            {court.up_next.map((match) => (
              <li key={match.id}>{teams(match)}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
