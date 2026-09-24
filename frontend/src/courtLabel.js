// "Pool A", "Bracket 1", or "Bracket 1 · now playing Bracket 2" while the
// court is lent to a bracket without courts of its own.
export function courtLabel(court) {
  if (!court.label) return null
  return court.now_playing ? `${court.label} · now playing ${court.now_playing}` : court.label
}
