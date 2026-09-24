import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPlayoffBracket, getTournament, getTournamentResults, listTeams } from './api'
import BracketDiagram from './BracketDiagram'

function ordinal(place) {
  const teen = place % 100 >= 11 && place % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th')
  return `${place}${suffix}`
}

// Every team's finish in this tier once the tournament is complete. Teams
// that went out in the same round share a place.
function Placings({ tournamentId, bracketId }) {
  const [tier, setTier] = useState(null)

  useEffect(() => {
    getTournamentResults(tournamentId).then((results) =>
      setTier(results.find((result) => result.playoff_bracket_id === bracketId) ?? null),
    )
  }, [tournamentId, bracketId])

  if (!tier) return null
  const rows = [
    ['1st', tier.champion.name],
    ['2nd', tier.runner_up.name],
  ]
  let place = 3
  for (const group of tier.eliminated) {
    const round = `${group.bracket === 'losers' ? 'losers ' : ''}round ${group.round}`
    const names = group.teams.map((team) => team.name).join(', ')
    rows.push([ordinal(place), `${names} (out in ${round})`])
    place += group.teams.length
  }

  return (
    <section aria-labelledby="placings-heading">
      <h3 id="placings-heading">Placings</h3>
      <ol>
        {rows.map(([label, teams]) => (
          <li key={label}>
            {label}: {teams}
          </li>
        ))}
      </ol>
    </section>
  )
}

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
      {tournament.stage === 'complete' && (
        <Placings tournamentId={bracket.tournament_id} bracketId={bracket.id} />
      )}
      <BracketDiagram
        playoffBracketId={bracket.id}
        teams={teams}
        courtCount={tournament.court_count}
        bestOf={tournament.playoff_best_of ?? 1}
      />
    </>
  )
}
