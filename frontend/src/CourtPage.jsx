import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { listCourts } from './api'
import { loginPath, useAuth } from './auth'
import ScoreEntryForm from './ScoreEntryForm'
import SeriesForm from './SeriesForm'
import { usePolling } from './usePolling'

function teams(match) {
  return `${match.team1_name ?? 'TBD'} vs ${match.team2_name ?? 'TBD'}`
}

/**
 * One court for the scorekeeper standing at it: the match on it now with its
 * score form, and what comes after. Polls, and refetches right after each
 * score, so a finished match is replaced by the next without a reload.
 */
export default function CourtPage() {
  const { tournamentId, court: courtNumber } = useParams()
  // null until the first load, so "not found" doesn't flash.
  const [courts, setCourts] = useState(null)
  const { user } = useAuth()
  const location = useLocation()

  const { refresh } = usePolling(() => listCourts(tournamentId), setCourts, tournamentId)

  if (courts === null) return null
  const court = courts.find((entry) => entry.court === Number(courtNumber))
  if (!court) return <p>Court not found.</p>
  const { current } = court

  return (
    <div className="court-page">
      <Link to={`/tournaments/${tournamentId}/courts`}>All courts</Link>
      <h2>Court {court.court}</h2>
      {court.label && <p>{court.label}</p>}

      {current ? (
        <section aria-labelledby="now-playing">
          <h3 id="now-playing">Now playing</h3>
          {/* Keyed by match, so the next match gets a fresh, empty form. */}
          {!user ? (
            <p>
              {teams(current)} · <Link to={loginPath(location.pathname)}>Sign in</Link> to
              enter scores.
            </p>
          ) : current.best_of > 1 ? (
            <SeriesForm
              key={current.id}
              match={current}
              bestOf={current.best_of}
              team1Name={current.team1_name}
              team2Name={current.team2_name}
              onScored={refresh}
            />
          ) : (
            <ScoreEntryForm
              key={current.id}
              match={current}
              team1Name={current.team1_name}
              team2Name={current.team2_name}
              onScored={refresh}
            />
          )}
        </section>
      ) : (
        <p>Nothing left to play on this court right now.</p>
      )}

      {court.up_next.length > 0 && (
        <section aria-labelledby="up-next">
          <h3 id="up-next">Up next</h3>
          {court.use === 'playoff' && (
            <p>These go to the next free {court.label} court, which may not be this one.</p>
          )}
          <ol>
            {court.up_next.map((match) => (
              <li key={match.id}>{teams(match)}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
