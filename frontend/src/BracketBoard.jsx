import { useCallback, useEffect, useState } from 'react'

import { useAuth } from './auth'
import { ChampionBanner, ConnectionNote, OverflowNote } from './BracketDiagram'
import { findChampionId, matchLabels, queuePositions, roundsOf, teamName } from './bracketModel'
import CardTree from './CardTree'
import Loading from './Loading'
import MatchPanel from './MatchPanel'
import RoundPages from './RoundPages'
import { useBracketMatches } from './useBracketMatches'
import { useMediaQuery } from './useMediaQuery'

/**
 * A playoff tier on its own page: round by round on a phone, the whole tree
 * of match cards on a wider screen, and any match opens in a panel with its
 * court and, for the organizer, its court and time, hold and correction.
 * Scoring happens on the court's scoreboard.
 */
export default function BracketBoard({
  playoffBracketId,
  tournamentId,
  teams = [],
  bestOf = 1,
  courtCount = 1,
  onChampionChange,
}) {
  const bracket = useBracketMatches(playoffBracketId)
  const { matches, loaded, dispatch, connectionLost } = bracket
  const { user } = useAuth()
  const wide = useMediaQuery('(min-width: 900px)')
  const [selectedId, setSelectedId] = useState(null)
  const close = useCallback(() => setSelectedId(null), [])

  const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]))
  const championId = findChampionId(matches)

  // Deciding (or un-deciding, by a correction) the champion can change the
  // tournament's stage, which the page shows.
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
  const selected = matches.find((match) => match.id === selectedId)
  const shared = {
    teamsById,
    bestOf,
    overflow,
    tournamentId,
    signedIn: Boolean(user),
    onSelect: setSelectedId,
  }

  return (
    <>
      {connectionLost && <ConnectionNote />}
      {overflow && <OverflowNote />}
      {championId != null && <ChampionBanner name={teamName(teamsById, championId)} />}

      {wide ? (
        <div className="bracket-scroll bracket-board-tree">
          <CardTree
            matches={matches}
            rounds={rounds}
            labels={labels}
            cardProps={(match) => ({
              ...shared,
              queuePosition: queued[match.id],
              selected: match.id === selectedId,
            })}
          />
        </div>
      ) : (
        <RoundPages
          rounds={rounds}
          labels={labels}
          queued={queued}
          selectedId={selectedId}
          {...shared}
        />
      )}

      {selected && (
        <MatchPanel
          match={selected}
          label={labels[selected.id]}
          teamsById={teamsById}
          bestOf={bestOf}
          queuePosition={queued[selected.id]}
          overflow={overflow}
          tournamentId={tournamentId}
          courtCount={courtCount}
          signedIn={Boolean(user)}
          holdError={bracket.holdError}
          onHold={bracket.hold}
          onSaved={bracket.replaceMatch}
          onCorrected={bracket.corrected}
          onClose={close}
        />
      )}
    </>
  )
}
