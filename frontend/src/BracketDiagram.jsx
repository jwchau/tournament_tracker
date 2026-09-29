import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from './auth'
import { findChampionId, matchLabels, queuePositions, roundsOf, teamName } from './bracketModel'
import CardTree from './CardTree'
import Loading from './Loading'
import RoundPages from './RoundPages'
import { COOLDOWN_MS, useBracketMatches } from './useBracketMatches'
import { useMediaQuery } from './useMediaQuery'

// A note shown while the bracket can't be reached.
export function ConnectionNote() {
  return (
    <p role="status" className="finish-note">
      Connection lost — retrying automatically (checks again every {COOLDOWN_MS / 1000}s).
    </p>
  )
}

export function OverflowNote() {
  return (
    <p className="pool-courts">
      This bracket has no courts of its own: its matches take any court that frees up, in turn
      with the other brackets.
    </p>
  )
}

// The bracket's winner, said as a sentence: no label above it.
export function ChampionBanner({ name }) {
  return (
    <section aria-label="Champion" className="champion">
      <p className="champion-name">{name} win the bracket</p>
    </section>
  )
}

/**
 * A bracket, polled, drawn exactly as the bracket page draws it (the tree of
 * match cards on a wide screen, round pages on a phone) with its champion once
 * decided. Here a card leads to the bracket page instead of opening its tools.
 */
export default function BracketDiagram({
  playoffBracketId,
  tournamentId,
  teams = [],
  bestOf = 1,
  onChampionChange,
}) {
  const { matches, loaded, dispatch, connectionLost } = useBracketMatches(playoffBracketId)
  const { user } = useAuth()
  const navigate = useNavigate()
  const wide = useMediaQuery('(min-width: 900px)')
  const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]))
  const championId = findChampionId(matches)
  const openBracket = useCallback(
    () => navigate(`/brackets/${playoffBracketId}`),
    [navigate, playoffBracketId],
  )

  // Deciding (or un-deciding, by a correction) the champion can change the
  // tournament's stage, which the page around this diagram may show.
  useEffect(() => {
    onChampionChange?.(championId)
  }, [championId, onChampionChange])

  if (!loaded) {
    return (
      <>
        {connectionLost && <ConnectionNote />}
        <Loading label="Loading matches" rows={6} />
      </>
    )
  }

  const queued = queuePositions(dispatch)
  const overflow = dispatch?.overflow ?? false
  const rounds = roundsOf(matches)
  const labels = matchLabels(rounds)
  const shared = {
    teamsById,
    bestOf,
    overflow,
    tournamentId,
    signedIn: Boolean(user),
    onSelect: openBracket,
  }

  return (
    <>
      {connectionLost && <ConnectionNote />}
      {overflow && <OverflowNote />}
      {championId != null && <ChampionBanner name={teamName(teamsById, championId)} />}
      {wide ? (
        <div className="bracket-scroll">
          <CardTree
            matches={matches}
            rounds={rounds}
            labels={labels}
            cardProps={(match) => ({ ...shared, queuePosition: queued[match.id] })}
          />
        </div>
      ) : (
        <RoundPages rounds={rounds} labels={labels} queued={queued} {...shared} />
      )}
    </>
  )
}
