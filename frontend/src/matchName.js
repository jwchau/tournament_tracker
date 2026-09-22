export function matchName(match) {
  if (match.bracket === 'grand_final') {
    return match.round === 1 ? 'Grand final' : 'Grand final reset'
  }
  const round = match.bracket === 'losers' ? 'Losers round' : 'Round'
  return `${round} ${match.round} match ${match.position}`
}
