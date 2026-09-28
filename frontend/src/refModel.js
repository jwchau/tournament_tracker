// The Ref dropdown's value: automatic, or what an organizer chose by hand.
export const refChoice = (match) =>
  match.ref_set_at == null ? 'auto' : match.ref_team_id == null ? 'na' : String(match.ref_team_id)

// "Aces", or "N/A" for a match without a ref.
export const refName = (match, nameOf) => (match.ref_team_id == null ? 'N/A' : nameOf(match.ref_team_id))

// What the dropdown's choice means for the server.
export function refUpdate(choice) {
  return {
    automatic: choice === 'auto',
    refTeamId: choice === 'auto' || choice === 'na' ? null : Number(choice),
  }
}
