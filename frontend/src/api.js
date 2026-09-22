const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

async function sendJson(method, path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    return Promise.reject(response)
  }
  return response.json()
}

function postJson(path, body) {
  return sendJson('POST', path, body)
}

function patchJson(path, body) {
  return sendJson('PATCH', path, body)
}

async function getJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    return Promise.reject(response)
  }
  return response.json()
}

async function deleteRequest(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' })
  if (!response.ok) {
    return Promise.reject(response)
  }
}

export function createTournament({ name }) {
  return postJson('/tournaments', { name })
}

export function listTournaments() {
  return getJson('/tournaments')
}

export function getTournament(tournamentId) {
  return getJson(`/tournaments/${tournamentId}`)
}

export function updateTournament(tournamentId, updates) {
  return patchJson(`/tournaments/${tournamentId}`, updates)
}

export function deleteTournament(tournamentId) {
  return deleteRequest(`/tournaments/${tournamentId}`)
}

export function createTeam(tournamentId, { name, seed }) {
  return postJson(`/tournaments/${tournamentId}/teams`, { name, seed })
}

export function listTeams(tournamentId) {
  return getJson(`/tournaments/${tournamentId}/teams`)
}

export function getTeam(teamId) {
  return getJson(`/teams/${teamId}`)
}

export function updateTeam(teamId, { name }) {
  return patchJson(`/teams/${teamId}`, { name })
}

export function createPlayer(teamId, { name }) {
  return postJson(`/teams/${teamId}/players`, { name })
}

export function listPlayers(teamId) {
  return getJson(`/teams/${teamId}/players`)
}

export function deletePlayer(teamId, playerId) {
  return deleteRequest(`/teams/${teamId}/players/${playerId}`)
}

export function generateBracket(tournamentId, { format } = {}) {
  return postJson(`/tournaments/${tournamentId}/bracket/generate`, format ? { format } : {})
}

export function getBracket(tournamentId) {
  return getJson(`/tournaments/${tournamentId}/bracket`)
}

export function getMatch(matchId) {
  return getJson(`/matches/${matchId}`)
}

export function submitScore(matchId, { team1Score, team2Score, version, complete }) {
  return patchJson(`/matches/${matchId}/score`, {
    team1_score: team1Score,
    team2_score: team2Score,
    version,
    complete,
  })
}

export function previewCorrection(matchId, { team1Score, team2Score }) {
  return postJson(`/matches/${matchId}/correct/preview`, {
    team1_score: team1Score,
    team2_score: team2Score,
  })
}

export function correctScore(matchId, { team1Score, team2Score, version }) {
  return patchJson(`/matches/${matchId}/correct`, {
    team1_score: team1Score,
    team2_score: team2Score,
    version,
  })
}
