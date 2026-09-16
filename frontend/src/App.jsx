import { useState } from 'react'

import HealthCheck from './HealthCheck'
import TeamForm from './TeamForm'
import TournamentForm from './TournamentForm'
import TournamentList from './TournamentList'

function App() {
  const [selectedTournamentId, setSelectedTournamentId] = useState(null)
  const [listKey, setListKey] = useState(0)

  return (
    <>
      <h1>Tournament Tracker</h1>
      <HealthCheck />

      <section>
        <h2>Create a tournament</h2>
        <TournamentForm
          onCreated={(tournament) => {
            setSelectedTournamentId(tournament.id)
            setListKey((key) => key + 1)
          }}
        />
      </section>

      {selectedTournamentId && (
        <section>
          <h2>Add a team</h2>
          <TeamForm
            tournamentId={selectedTournamentId}
            onCreated={() => setListKey((key) => key + 1)}
          />
        </section>
      )}

      <section>
        <h2>Tournaments</h2>
        <TournamentList key={listKey} />
      </section>
    </>
  )
}

export default App
