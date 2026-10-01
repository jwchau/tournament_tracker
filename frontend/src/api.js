const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

// Every request sends the session cookie; the API is on another origin.
function request(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, { ...options, credentials: 'include' })
}

// Called when a write is refused for want of a session (signed out, or it
// expired), so the app can send the user to sign in.
let onUnauthorized = null

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

// Signing in and out answer 401 for their own reasons (wrong password, already
// signed out), so they skip the sign-in redirect.
async function sendJson(method, path, body, { redirectIfSignedOut = true } = {}) {
  const response = await request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  clearApiCache()
  if (!response.ok) {
    if (response.status === 401 && redirectIfSignedOut) onUnauthorized?.()
    return Promise.reject(response)
  }
  return response.status === 204 ? null : response.json()
}

function postJson(path, body) {
  return sendJson('POST', path, body)
}

function patchJson(path, body) {
  return sendJson('PATCH', path, body)
}

async function getJson(path) {
  const response = await request(path)
  if (!response.ok) {
    return Promise.reject(response)
  }
  return response.json()
}

// Page data (tournaments, teams, players, pools) keyed by path, so moving
// between pages reuses what was already loaded instead of refetching it.
// Every write clears it (once the server has answered), since one change can
// show up in many cached reads, e.g. a new team changes team counts too.
// Entries expire after a few seconds, because other phones' writes never reach
// this cache; without that a phone would show old data until its own next write.
// Loaded data is also kept in sessionStorage so a reload of the same tab
// starts warm. Storage can be unavailable (private mode, blocked site data),
// in which case this is just an in-memory cache.
const cache = new Map()
const STORAGE_PREFIX = 'api-cache:'
const MAX_AGE_MS = 5000

function readStored(path) {
  try {
    const stored = sessionStorage.getItem(STORAGE_PREFIX + path)
    if (stored === null) return undefined
    const { at, data } = JSON.parse(stored)
    return Date.now() - at < MAX_AGE_MS ? data : undefined
  } catch {
    return undefined
  }
}

function writeStored(path, data) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + path, JSON.stringify({ at: Date.now(), data }))
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
      const entry = Promise.resolve(stored)
      cache.set(path, entry)
      setTimeout(() => {
        if (cache.get(path) === entry) cache.delete(path)
      }, MAX_AGE_MS)
      return entry
    }
    const request = getJson(path)
    cache.set(path, request)
    setTimeout(() => {
      if (cache.get(path) === request) cache.delete(path)
    }, MAX_AGE_MS)
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
  const response = await request(path, { method: 'DELETE' })
  clearApiCache()
  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.()
    return Promise.reject(response)
  }
}

export function login({ username, password }) {
  return sendJson('POST', '/auth/login', { username, password }, { redirectIfSignedOut: false })
}

export function logout() {
  return sendJson('POST', '/auth/logout', {}, { redirectIfSignedOut: false })
}

// The signed-in user, or null for a spectator.
export async function getMe() {
  const response = await request('/auth/me')
  if (response.status === 401) return null
  if (!response.ok) return Promise.reject(response)
  return response.json()
}

export function changePassword({ currentPassword, newPassword }) {
  return postJson('/auth/password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
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

// What saving these settings would do to what already exists: `{ effects: [...] }`,
// empty when there is nothing to affect. Refused (400) for a setting that has locked.
export function previewSettings(tournamentId, changes) {
  return postJson(`/tournaments/${tournamentId}/settings/preview`, changes)
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

export function updateTeam(teamId, { name, seed, poolId }) {
  const body = {}
  if (name !== undefined) body.name = name
  if (seed !== undefined) body.seed = seed
  if (poolId !== undefined) body.pool_id = poolId
  return patchJson(`/teams/${teamId}`, body)
}

export function deleteTeam(teamId) {
  return deleteRequest(`/teams/${teamId}`)
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

export function generateBracket(tournamentId, { format, seeding } = {}) {
  return postJson(`/tournaments/${tournamentId}/bracket/generate`, {
    ...(format && { format }),
    ...(seeding && { seeding }),
  })
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

// A series is corrected by sending every game ({team1Score, team2Score}) instead of one score.
function correctionBody({ team1Score, team2Score, games }) {
  if (games) {
    return {
      games: games.map((game) => ({ team1_score: game.team1Score, team2_score: game.team2Score })),
    }
  }
  return { team1_score: team1Score, team2_score: team2Score }
}

export function previewCorrection(matchId, correction) {
  return postJson(`/matches/${matchId}/correct/preview`, correctionBody(correction))
}

export function correctScore(matchId, { version, ...correction }) {
  return patchJson(`/matches/${matchId}/correct`, { ...correctionBody(correction), version })
}

export function listGames(matchId) {
  return getJson(`/matches/${matchId}/games`)
}

export function addGame(matchId, { team1Score, team2Score, version }) {
  return postJson(`/matches/${matchId}/games`, {
    team1_score: team1Score,
    team2_score: team2Score,
    version,
  })
}

// The running score of a series' game in play, saved point by point.
export function saveGameInPlay(matchId, { team1Score, team2Score, version }) {
  return sendJson('PUT', `/matches/${matchId}/game-in-play`, {
    team1_score: team1Score,
    team2_score: team2Score,
    version,
  })
}

export function editGame(matchId, number, { team1Score, team2Score, version }) {
  return patchJson(`/matches/${matchId}/games/${number}`, {
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

export function advanceToPlayoffs(tournamentId, { format, seeding }) {
  return postJson(`/tournaments/${tournamentId}/advance-to-playoffs`, {
    format,
    ...(seeding && { seeding }),
  })
}

// The seed order each playoff bracket would start with, to review before creating them.
export function getPlayoffSeeding(tournamentId) {
  return getJson(`/tournaments/${tournamentId}/playoff-seeding`)
}

export function resetPlayoffBrackets(tournamentId) {
  return deleteRequest(`/tournaments/${tournamentId}/playoff-brackets`)
}

export function getPlayoffBracket(bracketId) {
  return getCachedJson(`/playoff-brackets/${bracketId}`)
}

export function getPlayoffReadiness(tournamentId) {
  return getJson(`/tournaments/${tournamentId}/playoff-readiness`)
}

export function listPlayoffBrackets(tournamentId) {
  return getCachedJson(`/tournaments/${tournamentId}/playoff-brackets`)
}

// Each tier's final placings; the backend refuses (400) until the tournament is complete.
export function getTournamentResults(tournamentId) {
  return getCachedJson(`/tournaments/${tournamentId}/results`)
}

// A bracket's matches and its dispatch (the courts and who is in line for
// them) in one read: { matches, dispatch }.
export function getBracketBoard(bracketId) {
  return getJson(`/playoff-brackets/${bracketId}/board`)
}

// Every court with its current match and what's next; live, so never cached.
export function listCourts(tournamentId) {
  return getJson(`/tournaments/${tournamentId}/courts`)
}

export function holdMatch(matchId, { onHold, version }) {
  return patchJson(`/matches/${matchId}/hold`, { on_hold: onHold, version })
}

// A pool match's ref: a team id, or null for N/A, both set by hand; or
// automatic, which hands it back to the server's assignment.
export function setMatchRef(matchId, { refTeamId = null, automatic = false, version }) {
  return patchJson(`/matches/${matchId}/ref`, { ref_team_id: refTeamId, automatic, version })
}

// The teams that could ref a match right now: [{ id, name }].
export function getRefOptions(matchId) {
  return getJson(`/matches/${matchId}/ref-options`)
}

export function scheduleMatch(matchId, { court, scheduledTime }) {
  return patchJson(`/matches/${matchId}/schedule`, {
    court,
    scheduled_time: scheduledTime,
  })
}
