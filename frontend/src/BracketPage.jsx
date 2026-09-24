import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPlayoffBracket, getTournament, getTournamentResults, listTeams } from './api'
import { useAuth } from './auth'
import BracketDiagram from './BracketDiagram'
import { isNotFound } from './failure'
import NotFound from './NotFound'
import { useNotifyFailure } from './useNotifyFailure'

function ordinal(place) {
  const teen = place % 100 >= 11 && place % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th')
  return `${place}${suffix}`
}

// Every team's finish in this tier once the tournament is complete. Teams
// that went out in the same round share a place.
// They're reloaded when the champion changes.
function Placings({ tournamentId, bracketId, championId }) {
  const [tier, setTier] = useState(null)

  useEffect(() => {
    getTournamentResults(tournamentId)
      .then((results) =>
        setTier(results.find((result) => result.playoff_bracket_id === bracketId) ?? null),
      )
      // Refused while the tournament isn't complete, e.g. just after a correction.
      .catch(() => setTier(null))
  }, [tournamentId, bracketId, championId])

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
      {/* Each row names its own place, so no list numbers. */}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {rows.map(([label, teams]) => (
          <li key={label}>
            {label}: {teams}
          </li>
        ))}
      </ul>
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
  const notifyFailure = useNotifyFailure()
  const { user } = useAuth()
  const [championId, setChampionId] = useState(null)
  const reportedChampion = useRef(undefined)

  // A score or correction here can finish the tournament or reopen it, so
  // the stage (and with it the placings) is re-read whenever the champion
  // changes. The diagram's first report is just what was already loaded.
  const handleChampionChange = useCallback(
    (newChampionId) => {
      const previous = reportedChampion.current
      reportedChampion.current = newChampionId
      if (previous === undefined || previous === newChampionId) return
      setChampionId(newChampionId)
      if (bracket) getTournament(bracket.tournament_id).then(setTournament)
    },
    [bracket],
  )

  useEffect(() => {
    getPlayoffBracket(bracketId)
      .then((loaded) => {
        setBracket(loaded)
        return Promise.all([
          getTournament(loaded.tournament_id).then(setTournament),
          listTeams(loaded.tournament_id).then(setTeams),
        ])
      })
      .catch((error) =>
        isNotFound(error) ? setNotFound(true) : notifyFailure(error, "Couldn't load the bracket"),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bracketId])

  if (notFound) return <NotFound thing="Bracket" />
  if (!bracket || !tournament) return null

  return (
    <>
      <Link to={`/tournaments/${bracket.tournament_id}`}>Back to tournament</Link>
      <h2>Bracket {bracket.tier}</h2>
      {tournament.stage === 'complete' && (
        <Placings
          tournamentId={bracket.tournament_id}
          bracketId={bracket.id}
          championId={championId}
        />
      )}
      <BracketDiagram
        playoffBracketId={bracket.id}
        teams={teams}
        courtCount={tournament.court_count}
        bestOf={tournament.playoff_best_of ?? 1}
        readOnly={!user}
        onChampionChange={handleChampionChange}
      />
    </>
  )
}
