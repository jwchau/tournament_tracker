import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { listTournaments } from './api'
import { useAuth } from './auth'
import { IN_PLAY, groupTournaments, heldOn, shortDate, tournamentName } from './homeModel'
import Loading from './Loading'
import { useNotifyFailure } from './useNotifyFailure'
import { stageLabel } from './stage'
import TournamentForm from './TournamentForm'

// A tournament's stage as a chip, lit while it's being played.
function StageChip({ stage }) {
  return (
    <span className="home-stage" data-live={IN_PLAY.has(stage) ? '' : undefined}>
      {stageLabel(stage ?? 'draft')}
    </span>
  )
}

const teamCount = (count) => `${count ?? 0} ${count === 1 ? 'team' : 'teams'}`

function Champion({ name }) {
  return (
    <span className="home-champion">
      Champion <strong>{name}</strong>
    </span>
  )
}

// Today's tournaments, one tap from their board. One being played leads as
// a full-width row marked live, with its courts at the end; drafts and
// finished ones follow smaller, a finished one naming its champion.
function TodayCard({ tournament }) {
  const live = IN_PLAY.has(tournament.stage)
  return (
    <li className="today-card" data-live={live ? '' : undefined}>
      <div className="today-main">
        <Link to={`/tournaments/${tournament.id}`} className="today-name">
          {tournamentName(tournament)}
        </Link>
        <p className="home-meta">
          <StageChip stage={tournament.stage} />
          <span>{teamCount(tournament.team_count)}</span>
        </p>
      </div>
      {live && (
        <Link to={`/tournaments/${tournament.id}/courts`} className="today-courts">
          Courts
        </Link>
      )}
      {tournament.champion_name && (
        <p className="today-champion">{tournament.champion_name} win the tournament</p>
      )}
    </li>
  )
}

// Tournaments from earlier days: one compact row each.
function DatedRow({ tournament }) {
  const date = heldOn(tournament)
  return (
    <li className="dated-row">
      <Link to={`/tournaments/${tournament.id}`} className="dated-name">
        {tournamentName(tournament)}
      </Link>
      <StageChip stage={tournament.stage} />
      <span className="dated-teams">{teamCount(tournament.team_count)}</span>
      {date ? (
        <time className="dated-date" dateTime={date.toISOString()}>
          {shortDate(date)}
        </time>
      ) : (
        <span className="dated-date" />
      )}
      {tournament.champion_name ? <Champion name={tournament.champion_name} /> : <span />}
    </li>
  )
}

/**
 * The fixtures board: today's tournaments first and large, then this week's
 * and earlier ones as dated rows naming who won. Signed in, New tournament
 * opens the form under the band.
 */
export default function MainPage() {
  // null until the first load, so an empty list is never mistaken for no tournaments.
  const [tournaments, setTournaments] = useState(null)
  const [creating, setCreating] = useState(false)
  const { user } = useAuth()
  const notifyFailure = useNotifyFailure()

  useEffect(() => {
    listTournaments()
      .then(setTournaments)
      .catch((error) => {
        setTournaments([])
        notifyFailure(error, "Couldn't load the tournaments")
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCreated(tournament) {
    setTournaments((current) => [...(current ?? []), { team_count: 0, ...tournament }])
    setCreating(false)
  }

  const groups = tournaments ? groupTournaments(tournaments) : []

  return (
    <div className="home-page">
      <header className="court-strip home-band">
        <h2>Tournaments</h2>
        {user && !creating && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            New tournament
          </button>
        )}
      </header>

      {user && creating && (
        <section className="home-create" aria-labelledby="new-tournament-heading">
          <h3 id="new-tournament-heading">New tournament</h3>
          <TournamentForm onCreated={handleCreated} onCancel={() => setCreating(false)} />
        </section>
      )}

      {tournaments === null ? (
        <Loading label="Loading tournaments" rows={4} />
      ) : groups.length === 0 ? (
        <p className="setup-note">
          No tournaments yet.{user && !creating ? ' Start one with New tournament.' : ''}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="home-group" aria-labelledby={`home-${group.key}`}>
            <h3 id={`home-${group.key}`}>{group.label}</h3>
            {group.key === 'today' ? (
              <ul className="today-list">
                {group.tournaments.map((tournament) => (
                  <TodayCard key={tournament.id} tournament={tournament} />
                ))}
              </ul>
            ) : (
              <ul className="dated-list">
                {group.tournaments.map((tournament) => (
                  <DatedRow key={tournament.id} tournament={tournament} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  )
}
