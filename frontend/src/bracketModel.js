// What a playoff bracket's matches mean, shared by the diagram, the round
// pages and the match panel.

export function teamName(teamsById, teamId) {
  return teamsById[teamId]?.name ?? `Team ${teamId}`
}

export function slotLabel(teamsById, teamId, status) {
  if (teamId != null) return teamName(teamsById, teamId)
  return status === 'complete' ? 'BYE' : 'TBD'
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Match id -> place in line for a court (1 = next), from the bracket's
// dispatch queue. A bracket's line can include overflow brackets' matches
// (brackets without courts of their own), which count toward the place.
export function queuePositions(dispatch) {
  return Object.fromEntries((dispatch?.queue ?? []).map((id, index) => [id, index + 1]))
}

// "Court 2 · Sat 10:30", "Waiting for a court · #2" while queued (or
// "Waiting (any court)" in an overflow bracket), or "On hold". Times are
// venue-local with no timezone: parsing an ISO string without an offset
// yields that same wall-clock time everywhere.
export function scheduleLabel(match, queuePosition, overflow) {
  const parts = []
  if (match.on_hold) parts.push('On hold')
  // A finished match has left its court, which may now hold another match.
  if (match.court != null && match.status !== 'complete') parts.push(`Court ${match.court}`)
  if (queuePosition != null) {
    parts.push(`${overflow ? 'Waiting (any court)' : 'Waiting for a court'} · #${queuePosition}`)
  }
  if (match.scheduled_time) {
    const time = new Date(match.scheduled_time)
    const clock = match.scheduled_time.slice(11, 16)
    parts.push(`${WEEKDAYS[time.getDay()]} ${clock}`)
  }
  return parts.join(' · ')
}

// What to show beside a team: a series' games won once it's under way, or a
// single game's final score. Byes and unfinished games show nothing.
export function slotScore(match, index, bestOf) {
  const teamId = [match.team1_id, match.team2_id][index]
  const score = [match.team1_score, match.team2_score][index]
  if (teamId == null || score == null) return null
  if (bestOf > 1) return score
  const bothTeams = match.team1_id != null && match.team2_id != null
  return match.status === 'complete' && bothTeams ? score : null
}

export function sectionOf(match) {
  return match.bracket ?? 'winners'
}

export const bothTeamsKnown = (match) => match.team1_id != null && match.team2_id != null

// Where the match stands, in words: on a court, in line, on hold, finished.
export function matchStatus(match, queuePosition, overflow) {
  if (match.status === 'complete') return 'Finished'
  if (!bothTeamsKnown(match)) return 'Waiting for both teams'
  return scheduleLabel(match, queuePosition, overflow) || 'Not on a court yet'
}

/**
 * Single elimination: whoever wins the final. Double elimination: the
 * winners champion (slot 1) winning grand final 1, or else whoever wins the
 * reset match — the losers champion winning game one decides nothing yet.
 */
export function findChampionId(matches) {
  const grandFinals = matches
    .filter((match) => sectionOf(match) === 'grand_final')
    .sort((a, b) => a.round - b.round)
  if (grandFinals.length === 0) {
    const final = matches.find(
      (match) => sectionOf(match) === 'winners' && match.winner_next_match_id == null,
    )
    return final?.status === 'complete' ? final.winner_id : null
  }
  const [gameOne, reset] = grandFinals
  if (reset) return reset.status === 'complete' ? reset.winner_id : null
  return gameOne.status === 'complete' && gameOne.winner_id === gameOne.team1_id
    ? gameOne.winner_id
    : null
}

const SECTION_LABEL_HEIGHT = 24
const SECTION_GAP = 30

/**
 * Where each match goes in the tree, for boxes of a given size: geometry is
 * { matchWidth, roundGap, rowUnit } (rowUnit being a first-round match's
 * height plus the space under it). A single-elimination bracket is just the
 * winners section. Double elimination stacks the losers bracket under the
 * winners bracket (its rounds come in pairs of equal size, so each pair
 * shares a spacing), with the grand final to the right of both, level with
 * the winners final. The first round starts at the top; each later match
 * sits level with the middle of the two it follows.
 */
export function layoutBracket(matches, { matchWidth, roundGap, rowUnit }) {
  const columnWidth = matchWidth + roundGap
  const matchY = (round, position) => {
    const spacing = rowUnit * 2 ** (round - 1)
    return spacing * (position - 1) + (spacing - rowUnit) / 2
  }
  const positions = {}
  const labels = []
  const inSection = (section) => matches.filter((match) => sectionOf(match) === section)
  const winners = inSection('winners')
  const losers = inSection('losers')
  const grandFinals = inSection('grand_final')
  const isDouble = losers.length > 0 || grandFinals.length > 0
  const top = isDouble ? SECTION_LABEL_HEIGHT : 0

  for (const match of winners) {
    positions[match.id] = {
      x: (match.round - 1) * columnWidth,
      y: top + matchY(match.round, match.position),
    }
  }
  const winnersRounds = Math.max(0, ...winners.map((match) => match.round))
  const winnersBottom = top + Math.max(0, ...winners.map((m) => matchY(m.round, m.position)))

  if (isDouble) {
    labels.push({ text: 'Winners bracket', x: 0, y: SECTION_LABEL_HEIGHT / 2 })

    const losersTop = winnersBottom + rowUnit + SECTION_GAP
    if (losers.length) labels.push({ text: 'Losers bracket', x: 0, y: losersTop })
    for (const match of losers) {
      positions[match.id] = {
        x: (match.round - 1) * columnWidth,
        y: losersTop + SECTION_LABEL_HEIGHT / 2 + matchY(Math.ceil(match.round / 2), match.position),
      }
    }

    const losersRounds = Math.max(0, ...losers.map((match) => match.round))
    const grandFinalX = Math.max(winnersRounds, losersRounds) * columnWidth
    labels.push({ text: 'Grand final', x: grandFinalX, y: SECTION_LABEL_HEIGHT / 2 })
    for (const match of grandFinals) {
      positions[match.id] = {
        x: grandFinalX + (match.round - 1) * columnWidth,
        y: top + matchY(winnersRounds, 1),
      }
    }
  }

  const placed = Object.values(positions)
  return {
    positions,
    labels,
    isDouble,
    columnWidth,
    width: placed.length ? Math.max(...placed.map((p) => p.x)) + columnWidth : 0,
    height: placed.length ? Math.max(...placed.map((p) => p.y)) + rowUnit : 0,
  }
}

// A match named the way the round tabs name it: "Final", or "Semis ·
// match 2" when its round has more than one.
export function matchLabels(rounds) {
  const labels = {}
  for (const round of rounds) {
    for (const match of round.matches) {
      labels[match.id] =
        round.matches.length > 1 ? `${round.name} · match ${match.position}` : round.name
    }
  }
  return labels
}

const SECTION_ORDER = { winners: 0, losers: 1, grand_final: 2 }

// A round's name as people say it: the last winners rounds are the Final,
// Semis and Quarters; double elimination prefixes its two brackets.
function roundName(section, round, lastRound, isDouble) {
  if (section === 'grand_final') return round === 1 ? 'Grand final' : 'Reset'
  if (section === 'losers') return round === lastRound ? 'Losers final' : `Losers ${round}`
  const fromEnd = lastRound - round
  const name = ['Final', 'Semis', 'Quarters'][fromEnd] ?? `Round ${round}`
  return isDouble ? (fromEnd === 0 ? 'Winners final' : `Winners ${name}`) : name
}

/**
 * The bracket as a list of rounds in playing order, each { key, name,
 * matches }: winners rounds, then losers rounds, then the grand final(s).
 */
export function roundsOf(matches) {
  const isDouble = matches.some((match) => sectionOf(match) !== 'winners')
  const groups = new Map()
  for (const match of matches) {
    const key = `${sectionOf(match)}-${match.round}`
    if (!groups.has(key)) groups.set(key, { section: sectionOf(match), round: match.round, matches: [] })
    groups.get(key).matches.push(match)
  }
  const lastRound = (section) =>
    Math.max(0, ...matches.filter((m) => sectionOf(m) === section).map((m) => m.round))
  return [...groups.entries()]
    .sort(
      ([, a], [, b]) => SECTION_ORDER[a.section] - SECTION_ORDER[b.section] || a.round - b.round,
    )
    .map(([key, group]) => ({
      key,
      name: roundName(group.section, group.round, lastRound(group.section), isDouble),
      matches: group.matches.sort((a, b) => a.position - b.position),
    }))
}

// The round to open on: the first with a match both teams can play now, or
// else the last one that's been played.
export function currentRound(rounds) {
  const playing = rounds.find((round) =>
    round.matches.some((match) => bothTeamsKnown(match) && match.status !== 'complete'),
  )
  if (playing) return playing.key
  const played = [...rounds].reverse().find((round) => round.matches.some((m) => m.status === 'complete'))
  return (played ?? rounds[0])?.key
}
