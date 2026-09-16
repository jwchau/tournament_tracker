const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    return Promise.reject(response)
  }
  return response.json()
}

async function getJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    return Promise.reject(response)
  }
  return response.json()
}

export function createTournament({ name }) {
  return postJson('/tournaments', { name })
}

export function listTournaments() {
  return getJson('/tournaments')
}

export function createTeam(tournamentId, { name, seed }) {
  return postJson(`/tournaments/${tournamentId}/teams`, { name, seed })
}

export function listTeams(tournamentId) {
  return getJson(`/tournaments/${tournamentId}/teams`)
}

export function createPlayer(teamId, { name }) {
  return postJson(`/teams/${teamId}/players`, { name })
}

export function listPlayers(teamId) {
  return getJson(`/teams/${teamId}/players`)
}
