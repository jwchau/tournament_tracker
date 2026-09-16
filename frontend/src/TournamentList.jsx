import { useEffect, useState } from 'react'

import { listPlayers, listTeams, listTournaments } from './api'
import PlayerForm from './PlayerForm'

function Roster({ teamId }) {
  const [players, setPlayers] = useState([])

  useEffect(() => {
    listPlayers(teamId).then(setPlayers)
  }, [teamId])

  return (
    <ul>
      {players.map((player) => (
        <li key={player.id}>{player.name}</li>
      ))}
    </ul>
  )
}

function TeamWithRoster({ team }) {
  const [rosterKey, setRosterKey] = useState(0)

  return (
    <li>
      {team.name}
      <Roster key={rosterKey} teamId={team.id} />
      <PlayerForm
        teamId={team.id}
        onCreated={() => setRosterKey((key) => key + 1)}
      />
    </li>
  )
}

function TournamentWithTeams({ tournament }) {
  const [teams, setTeams] = useState([])

  useEffect(() => {
    listTeams(tournament.id).then(setTeams)
  }, [tournament.id])

  return (
    <li>
      {tournament.name}
      <ul>
        {teams.map((team) => (
          <TeamWithRoster key={team.id} team={team} />
        ))}
      </ul>
    </li>
  )
}

export default function TournamentList() {
  const [tournaments, setTournaments] = useState([])

  useEffect(() => {
    listTournaments().then(setTournaments)
  }, [])

  return (
    <ul>
      {tournaments.map((tournament) => (
        <TournamentWithTeams key={tournament.id} tournament={tournament} />
      ))}
    </ul>
  )
}
