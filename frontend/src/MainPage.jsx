import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { listTournaments } from './api'
import { useAuth } from './auth'
import { stageLabel } from './stage'
import TournamentForm from './TournamentForm'

export default function MainPage() {
  const [tournaments, setTournaments] = useState([])
  const { user } = useAuth()

  useEffect(() => {
    listTournaments().then(setTournaments)
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
