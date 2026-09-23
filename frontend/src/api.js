const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

async function sendJson(method, path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  clearApiCache()
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

// Page data (tournaments, teams, players, pools) keyed by path, so moving
// between pages reuses what was already loaded instead of refetching it.
// Every write clears it (once the server has answered), since one change can
// show up in many cached reads, e.g. a new team changes team counts too.
// Loaded data is also kept in sessionStorage so a reload of the same tab
// starts warm. Storage can be unavailable (private mode, blocked site data),
// in which case this is just an in-memory cache.
const cache = new Map()
const STORAGE_PREFIX = 'api-cache:'

function readStored(path) {
  try {
    const stored = sessionStorage.getItem(STORAGE_PREFIX + path)
    return stored === null ? undefined : JSON.parse(stored)
  } catch {
    return undefined
  }
}

function writeStored(path, data) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + path, JSON.stringify(data))
  } catch {
    // Full or unavailable storage only costs a refetch after a reload.
  }
}

export function clearApiCache() {
  cache.clear()
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key)
    }
  } catch {
    // Nothing stored to clear.
  }
}

function getCachedJson(path) {
  if (!cache.has(path)) {
    const stored = readStored(path)
    if (stored !== undefined) {
      cache.set(path, Promise.resolve(stored))
      return cache.get(path)
    }
    const request = getJson(path)
    cache.set(path, request)
    request.then(
      (data) => {
        if (cache.get(path) === request) writeStored(path, data)
      },
      () => {
        if (cache.get(path) === request) cache.delete(path)
      },
    )
  }
  return cache.get(path)
}

async function deleteRequest(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' })
  clearApiCache()
  if (!response.ok) {
    return Promise.reject(response)
  }
}

export function createTournament({ name }) {
  return postJson('/tournaments', { name })
}

export function listTournaments() {
  return getCachedJson('/tournaments')
}

export function getTournament(tournamentId) {
  return getCachedJson(`/tournaments/${tournamentId}`)
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
  return getCachedJson(`/tournaments/${tournamentId}/teams`)
}

export function getTeam(teamId) {
  return getCachedJson(`/teams/${teamId}`)
}

export function updateTeam(teamId, { name, poolId }) {
  const body = {}
  if (name !== undefined) body.name = name
  if (poolId !== undefined) body.pool_id = poolId
  return patchJson(`/teams/${teamId}`, body)
}

export function createPlayer(teamId, { name }) {
  return postJson(`/teams/${teamId}/players`, { name })
}

export function listPlayers(teamId) {
  return getCachedJson(`/teams/${teamId}/players`)
}

export function deletePlayer(teamId, playerId) {
  return deleteRequest(`/teams/${teamId}/players/${playerId}`)
}

export function generateBracket(tournamentId, { format } = {}) {
  return postJson(`/tournaments/${tournamentId}/bracket/generate`, format ? { format } : {})
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

export function listPools(tournamentId) {
  return getCachedJson(`/tournaments/${tournamentId}/pools`)
}

export function getPool(poolId) {
  return getCachedJson(`/pools/${poolId}`)
}

export function createPool(tournamentId, { name }) {
  return postJson(`/tournaments/${tournamentId}/pools`, { name })
}

export function autoAssignPools(tournamentId) {
  return postJson(`/tournaments/${tournamentId}/pools/auto-assign`, {})
}

// Games per pairing comes from the tournament's settings.
export function generatePoolSchedule(poolId) {
  return postJson(`/pools/${poolId}/generate-schedule`, {})
}

export function deletePool(poolId) {
  return deleteRequest(`/pools/${poolId}`)
}

export function getPoolMatches(poolId) {
  return getJson(`/pools/${poolId}/matches`)
}

export function getPoolStandings(poolId) {
  return getJson(`/pools/${poolId}/standings`)
}

export function advanceToPlayoffs(tournamentId, { format }) {
  return postJson(`/tournaments/${tournamentId}/advance-to-playoffs`, { format })
}

export function resetPlayoffBrackets(tournamentId) {
  return deleteRequest(`/tournaments/${tournamentId}/playoff-brackets`)
}

export function getPlayoffBracket(bracketId) {
  return getJson(`/playoff-brackets/${bracketId}`)
}

export function getPlayoffReadiness(tournamentId) {
  return getJson(`/tournaments/${tournamentId}/playoff-readiness`)
}

export function listPlayoffBrackets(tournamentId) {
  return getCachedJson(`/tournaments/${tournamentId}/playoff-brackets`)
}

export function getPlayoffBracketMatches(bracketId) {
  return getJson(`/playoff-brackets/${bracketId}/matches`)
}

export function scheduleMatch(matchId, { court, scheduledTime }) {
  return patchJson(`/matches/${matchId}/schedule`, {
    court,
    scheduled_time: scheduledTime,
  })
}
