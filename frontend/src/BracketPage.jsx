import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPlayoffBracket, getTournament, getTournamentResults, listTeams } from './api'
import BracketBoard from './BracketBoard'
import Loading from './Loading'
import NotFound from './NotFound'
import { useLoad } from './useLoad'

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
    <section aria-labelledby="placings-heading" className="board-section">
      <h3 id="placings-heading">Placings</h3>
      {/* Each row names its own place, so no list numbers. */}
      <ul className="placings">
        {rows.map(([label, teams]) => (
          <li key={label}>
            <span className="placing-place">{label}</span>
            <span className="visually-hidden">: </span>
            <span className="placing-teams">{teams}</span>
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

  const status = useLoad(
    async () => {
      const loaded = await getPlayoffBracket(bracketId)
      return [
        loaded,
        ...(await Promise.all([
          getTournament(loaded.tournament_id),
          listTeams(loaded.tournament_id),
        ])),
      ]
    },
    bracketId,
    {
      onData: ([loaded, loadedTournament, loadedTeams]) => {
        setBracket(loaded)
        setTournament(loadedTournament)
        setTeams(loadedTeams)
      },
      failureMessage: "Couldn't load the bracket",
    },
  )

  if (status === 'not-found') return <NotFound thing="Bracket" />
  if (status !== 'ready') return <Loading label="Loading bracket" rows={6} />

  const bestOf = tournament.playoff_best_of ?? 1
  const format = bracket.format === 'double' ? 'Double elimination' : 'Single elimination'

  return (
    <div className="bracket-page">
      <header className="court-strip">
        <div className="court-strip-title">
          <h2>Bracket {bracket.tier}</h2>
          <p className="court-strip-label">
            {format}
            {bestOf > 1 && ` · best of ${bestOf}`}
          </p>
        </div>
        <Link to={`/tournaments/${bracket.tournament_id}`} className="court-strip-link">
          Back to tournament
        </Link>
      </header>
      {tournament.stage === 'complete' && (
        <Placings
          tournamentId={bracket.tournament_id}
          bracketId={bracket.id}
          championId={championId}
        />
      )}
      <BracketBoard
        playoffBracketId={bracket.id}
        tournamentId={bracket.tournament_id}
        teams={teams}
        courtCount={tournament.court_count}
        bestOf={bestOf}
        onChampionChange={handleChampionChange}
      />
    </div>
  )
}
