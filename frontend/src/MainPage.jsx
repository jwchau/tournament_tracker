import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { listTournaments } from './api'
import { useAuth } from './auth'
import { useNotifyFailure } from './useNotifyFailure'
import { stageLabel } from './stage'
import TournamentForm from './TournamentForm'

export default function MainPage() {
  const [tournaments, setTournaments] = useState([])
  const { user } = useAuth()
  const notifyFailure = useNotifyFailure()

  useEffect(() => {
    listTournaments()
      .then(setTournaments)
      .catch((error) => notifyFailure(error, "Couldn't load the tournaments"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCreated(tournament) {
    setTournaments((current) => [...current, { ...tournament, team_count: 0 }])
  }

  return (
    <>
      {user && (
        <section>
          <h2>Create a tournament</h2>
          <TournamentForm onCreated={handleCreated} />
        </section>
      )}

      <section>
        <h2>Tournaments</h2>
        <ul>
          {tournaments.map((tournament) => (
            <li key={tournament.id}>
              <Link to={`/tournaments/${tournament.id}`}>{tournament.name}</Link>
              {' — '}
              {tournament.team_count} teams
              {tournament.stage && ` · ${stageLabel(tournament.stage)}`}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
