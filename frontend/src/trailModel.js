import { getPlayoffBracket, getPool, getTeam, getTournament, listCourts } from './api'

/**
 * The app's pages as a tree, for the trail in the app bar:
 *
 *   Home
 *   └── Tournament
 *       ├── Pool      ── Court
 *       ├── Bracket   ── Court
 *       ├── Courts    ── Court
 *       └── Team
 *
 * A court's parent is the page it was opened from (its pool, its bracket or
 * the courts list). Opened any other way, it's whatever is using the court
 * now, else the courts list. Pages outside the tree sit under Home.
 */

const PATTERNS = [
  [/^\/$/, () => ({ kind: 'home' })],
  [/^\/tournaments\/([^/]+)$/, ([id]) => ({ kind: 'tournament', tournamentId: id })],
  [/^\/tournaments\/([^/]+)\/courts$/, ([id]) => ({ kind: 'courts', tournamentId: id })],
  [
    /^\/tournaments\/([^/]+)\/courts\/([^/]+)$/,
    ([id, court]) => ({ kind: 'court', tournamentId: id, court }),
  ],
  [/^\/pools\/([^/]+)$/, ([id]) => ({ kind: 'pool', id })],
  [/^\/brackets\/([^/]+)$/, ([id]) => ({ kind: 'bracket', id })],
  [/^\/teams\/([^/]+)$/, ([id]) => ({ kind: 'team', id })],
  [/^\/account$/, () => ({ kind: 'account' })],
  [/^\/login$/, () => ({ kind: 'login' })],
]

export function pageOf(path) {
  for (const [pattern, page] of PATTERNS) {
    const match = pattern.exec(path)
    if (match) return page(match.slice(1))
  }
  return { kind: 'other' }
}

const tournamentPath = (id) => `/tournaments/${id}`

// The tournament a pool, bracket or team belongs to, or null if it can't be loaded.
async function tournamentOf(page) {
  const load = { pool: getPool, bracket: getPlayoffBracket, team: getTeam }[page.kind]
  if (!load) return null
  try {
    return String((await load(page.id)).tournament_id)
  } catch {
    return null
  }
}

async function courtParent(page, cameFrom) {
  const from = cameFrom ? pageOf(cameFrom) : null
  if (from?.kind === 'courts' && from.tournamentId === page.tournamentId) return cameFrom
  if (
    (from?.kind === 'pool' || from?.kind === 'bracket') &&
    (await tournamentOf(from)) === page.tournamentId
  ) {
    return cameFrom
  }
  const courts = await listCourts(page.tournamentId).catch(() => [])
  const court = courts.find((entry) => String(entry.court) === page.court)
  if (court?.pool_id != null) return `/pools/${court.pool_id}`
  if (court?.playoff_bracket_id != null) return `/brackets/${court.playoff_bracket_id}`
  return `${tournamentPath(page.tournamentId)}/courts`
}

/**
 * The pages above `path`, from Home down to its parent. `cameFrom` is the
 * page the reader was on, which decides a court's parent.
 */
export async function ancestorsOf(path, cameFrom) {
  const page = pageOf(path)
  switch (page.kind) {
    case 'home':
      return []
    case 'tournament':
      return ['/']
    case 'courts':
      return ['/', tournamentPath(page.tournamentId)]
    case 'court': {
      const parent = await courtParent(page, cameFrom)
      return [...(await ancestorsOf(parent)), parent]
    }
    case 'pool':
    case 'bracket':
    case 'team': {
      const tournamentId = await tournamentOf(page)
      return tournamentId == null ? ['/'] : ['/', tournamentPath(tournamentId)]
    }
    default:
      return ['/']
  }
}

// A page's name before (or without) its data: what the trail shows meanwhile.
export function placeholderLabel(path) {
  const page = pageOf(path)
  return {
    home: 'Home',
    tournament: 'Tournament',
    courts: 'Courts',
    court: `Court ${page.court}`,
    pool: 'Pool',
    bracket: 'Bracket',
    team: 'Team',
    account: 'Account',
    login: 'Sign in',
    other: 'Not found',
  }[page.kind]
}

// A page's name in the trail: the tournament's, pool's or team's own name, "Bracket 2", "Court 3".
export async function labelOf(path) {
  const page = pageOf(path)
  try {
    let name = null
    if (page.kind === 'tournament') name = (await getTournament(page.tournamentId)).name
    if (page.kind === 'pool') name = (await getPool(page.id)).name
    if (page.kind === 'team') name = (await getTeam(page.id)).name
    if (page.kind === 'bracket') name = `Bracket ${(await getPlayoffBracket(page.id)).tier}`
    // A blank name (it's allowed) would leave an empty crumb.
    if (name?.trim()) return name
  } catch {
    // Keep the placeholder; the page itself says what went wrong.
  }
  return placeholderLabel(path)
}
