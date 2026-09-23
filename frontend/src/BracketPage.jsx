import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPlayoffBracket, getTournament, listTeams } from './api'
import BracketDiagram from './BracketDiagram'

// One playoff tier with everything needed to run it: scores, schedule, and
// corrections. The tournament page only shows these diagrams read-only.
export default function BracketPage() {
  const { bracketId } = useParams()
  const [bracket, setBracket] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [teams, setTeams] = useState([])
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    getPlayoffBracket(bracketId)
      .then((loaded) => {
        setBracket(loaded)
        return Promise.all([
          getTournament(loaded.tournament_id).then(setTournament),
          listTeams(loaded.tournament_id).then(setTeams),
        ])
      })
      .catch(() => setNotFound(true))
  }, [bracketId])

  if (notFound) return <p>Bracket not found.</p>
  if (!bracket || !tournament) return null

  return (
    <>
      <Link to={`/tournaments/${bracket.tournament_id}`}>Back to tournament</Link>
      <h2>Bracket {bracket.tier}</h2>
      <BracketDiagram
        playoffBracketId={bracket.id}
        teams={teams}
        courtCount={tournament.court_count}
      />
    </>
  )
}
