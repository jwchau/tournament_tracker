// The main page's fixtures board: tournaments grouped by the day they were
// created, what's being played first within each group.

const DAY = 24 * 60 * 60 * 1000

// The server sends UTC timestamps without a zone ("2026-09-25T05:27:05").
export function createdAt(tournament) {
  const value = tournament.created_at
  if (!value) return null
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

export const IN_PLAY = new Set(['pool_play', 'playoffs'])
const STAGE_ORDER = { pool_play: 0, playoffs: 0, draft: 1, complete: 2 }

/**
 * Today, This week (the six days before today) and Earlier, leaving out any
 * that are empty. A tournament without a date (one just created) counts as
 * today. Within a group, tournaments in play come first, then drafts, then
 * finished ones, newest first.
 */
export function groupTournaments(tournaments, now = new Date()) {
  const today = startOfDay(now).getTime()
  const groups = [
    { key: 'today', label: 'Today', tournaments: [] },
    { key: 'week', label: 'This week', tournaments: [] },
    { key: 'earlier', label: 'Earlier', tournaments: [] },
  ]
  for (const tournament of tournaments) {
    const date = createdAt(tournament)
    const day = date ? startOfDay(date).getTime() : today
    const group = day >= today ? groups[0] : day > today - 7 * DAY ? groups[1] : groups[2]
    group.tournaments.push(tournament)
  }
  const newest = (tournament) => createdAt(tournament)?.getTime() ?? Infinity
  for (const group of groups) {
    group.tournaments.sort(
      (a, b) =>
        (STAGE_ORDER[a.stage] ?? 1) - (STAGE_ORDER[b.stage] ?? 1) || newest(b) - newest(a),
    )
  }
  return groups.filter((group) => group.tournaments.length > 0)
}

// "Sep 26", with the year when it isn't this one: "Sep 26, 2025".
export function shortDate(date, now = new Date()) {
  const options = { month: 'short', day: 'numeric' }
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric'
  return new Intl.DateTimeFormat(undefined, options).format(date)
}

// A tournament's name as shown, never blank.
export const tournamentName = (tournament) => tournament.name?.trim() || 'Untitled tournament'
