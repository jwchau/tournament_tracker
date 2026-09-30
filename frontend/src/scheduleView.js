/**
 * A pool's matches as rounds. The backend numbers a pool's matches in play
 * order (`match.round`, a slot), and a pairing plays `gamesPerPairing`
 * consecutive slots on one court. A round is those slots together, so a
 * pairing's games sit side by side: [{round, pairings: [{position, games}],
 * matches}], each game carrying its `gameNumber` in the pairing.
 */
export function groupByRound(matches, gamesPerPairing) {
  const perPairing = Math.max(1, gamesPerPairing || 1)
  const rounds = new Map()
  for (const match of matches) {
    const round = Math.ceil(match.round / perPairing)
    const game = { ...match, gameNumber: match.round - (round - 1) * perPairing }
    if (!rounds.has(round)) rounds.set(round, new Map())
    const pairings = rounds.get(round)
    if (!pairings.has(match.position)) pairings.set(match.position, [])
    pairings.get(match.position).push(game)
  }
  return [...rounds.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, pairings]) => {
      const ordered = [...pairings.entries()]
        .sort(([a], [b]) => a - b)
        .map(([position, games]) => ({
          position,
          games: games.sort((a, b) => a.gameNumber - b.gameNumber),
        }))
      return { round, pairings: ordered, matches: ordered.flatMap((pairing) => pairing.games) }
    })
}

// How many rounds the pool schedule shows before it scrolls: about three
// matches' worth, so one round of three or more matches, two of two, three of one.
export function roundsInView(matchesPerRound) {
  return Math.ceil(3 / Math.max(1, matchesPerRound))
}
