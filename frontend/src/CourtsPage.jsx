import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { listCourts } from './api'
import { courtLabel } from './courtLabel'
import { usePolling } from './usePolling'

// Every court as a big tap target, so a scorekeeper can find theirs on a phone.
export default function CourtsPage() {
  const { tournamentId } = useParams()
  const [courts, setCourts] = useState([])

  usePolling(() => listCourts(tournamentId), setCourts, tournamentId)

  return (
    <div className="court-page">
      <Link to={`/tournaments/${tournamentId}`}>Back to tournament</Link>
      <h2>Courts</h2>
      <ul className="court-list">
        {courts.map((court) => (
          <li key={court.court}>
            <Link className="court-link" to={`/tournaments/${tournamentId}/courts/${court.court}`}>
              <strong>Court {court.court}</strong>
              {court.label && <span>{courtLabel(court)}</span>}
              <span>
                {court.current
                  ? `${court.current.team1_name} vs ${court.current.team2_name}`
                  : 'Free'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
