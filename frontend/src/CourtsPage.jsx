import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { listCourts } from './api'
import { boardScores } from './boardScores'
import { courtLabel } from './courtLabel'
import { isNotFound } from './failure'
import Loading from './Loading'
import NotFound from './NotFound'
import { usePolling } from './usePolling'

// One team's line on a court's tile: its name and a small flip-card score.
function TeamLine({ name, score }) {
  return (
    <span className="court-link-team">
      <span className="court-link-name">{name ?? 'TBD'}</span>
      <span className="court-link-chip">{score ?? 0}</span>
    </span>
  )
}

// Every court as a big tap target, so a scorekeeper can find theirs on a phone.
export default function CourtsPage() {
  const { tournamentId } = useParams()
  // null until the first load; polls after that keep the list on screen.
  const [courts, setCourts] = useState(null)
  const [notFound, setNotFound] = useState(false)

  usePolling(() => listCourts(tournamentId), setCourts, tournamentId, {
    onError: (error) => setNotFound(isNotFound(error)),
  })

  if (notFound) return <NotFound thing="Tournament" />

  return (
    <div className="court-page">
      <header className="court-strip">
        <div className="court-strip-title">
          <h2>Courts</h2>
        </div>
        <Link to={`/tournaments/${tournamentId}`} className="court-strip-link">
          Back to tournament
        </Link>
      </header>
      {courts === null ? (
        <Loading label="Loading courts" rows={4} />
      ) : (
        <ul className="court-list">
          {courts.map(({ court, label, current, ...rest }) => (
            <li key={court}>
              <Link
                className="court-link"
                data-free={current ? undefined : ''}
                to={`/tournaments/${tournamentId}/courts/${court}`}
              >
                <span className="court-link-head">
                  <strong>Court {court}</strong>
                  {label && (
                    <span className="court-link-label">{courtLabel({ court, label, ...rest })}</span>
                  )}
                  {!current && <span className="court-link-free">Free</span>}
                </span>
                {current && (
                  <>
                    {current.best_of > 1 && (
                      <span className="court-link-label">
                        Best of {current.best_of} · Games {current.team1_score ?? 0}–
                        {current.team2_score ?? 0}
                      </span>
                    )}
                    <TeamLine name={current.team1_name} score={boardScores(current).team1} />
                    <TeamLine name={current.team2_name} score={boardScores(current).team2} />
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
