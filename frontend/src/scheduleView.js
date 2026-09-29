// How many slots the pool schedule shows before it scrolls: about three
// matches' worth, so one slot on three or more courts, two on two, three on one.
export function slotsInView(matchesPerSlot) {
  return Math.ceil(3 / Math.max(1, matchesPerSlot))
}
