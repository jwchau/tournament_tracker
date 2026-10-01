// "Aces vs Kings", with TBD for a team not known yet.
export function matchTeams(match) {
  return `${match.team1_name ?? 'TBD'} vs ${match.team2_name ?? 'TBD'}`
}

// Whether two things belong to the same bracket or the same pool.
function sameGroup(court, match) {
  if (court.playoff_bracket_id != null) return match.playoff_bracket_id === court.playoff_bracket_id
  if (court.pool_id != null) return match.pool_id === court.pool_id
  return false
}

/**
 * Where an idle court's own bracket or pool plays next, for a scorekeeper
 * standing at an empty court. Playoff matches go to whichever court is free,
 * including one lent by a finished bracket, and a pool match can be moved to
 * another court by hand, so the match a court was waiting for may be playing
 * somewhere else.
 *
 * Returns null when the court has a match of its own (or nothing is coming);
 * { kind: 'on-court', court, match } for the lowest numbered other court that
 * is playing a match of the same bracket or pool; or { kind: 'waiting', match }
 * for a match queued for this court that has no court yet.
 */
export function nextMatchFor(courts, courtNumber) {
  const here = courts.find((entry) => entry.court === courtNumber)
  if (!here || here.current) return null

  const elsewhere = courts
    .filter((entry) => entry.court !== courtNumber && entry.current && sameGroup(here, entry.current))
    .sort((a, b) => a.court - b.court)[0]
  if (elsewhere) return { kind: 'on-court', court: elsewhere.court, match: elsewhere.current }

  const waiting = here.up_next?.[0]
  return waiting ? { kind: 'waiting', match: waiting } : null
}
