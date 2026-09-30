import { useEffect, useState } from 'react'

import { getRefOptions } from './api'
import { bestOfFor, bothTeamsKnown, slotLabel, teamName } from './bracketModel'
import CorrectionForm from './CorrectionForm'
import { CourtLink, MatchStatus, MatchTeams } from './MatchCard'
import { matchName } from './matchName'
import RefSelect from './RefSelect'
import ScheduleForm from './ScheduleForm'

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
    </svg>
  )
}

/**
 * One match of the bracket, opened from its card or box: its teams and
 * score, where it stands, and a link to its court. Signed in, the
 * organizer's tools for it: court and time, hold or release, correct.
 */
export default function MatchPanel({
  match,
  label,
  teamsById,
  bestOf,
  queuePosition,
  overflow,
  tournamentId,
  courtCount,
  signedIn,
  holdError,
  onHold,
  refError,
  onRef,
  onSaved,
  onCorrected,
  onClose,
}) {
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const name = label ?? matchName(match)
  const teams = `${slotLabel(teamsById, match.team1_id, match.status)} vs ${slotLabel(teamsById, match.team2_id, match.status)}`
  const playable = bothTeamsKnown(match) && match.status !== 'complete'
  // Only a match nobody has started can be held; a held one is released before it's scored.
  const holdable = playable && !match.on_hold && match.team1_score == null && match.team2_score == null
  const correctable = bothTeamsKnown(match) && match.status === 'complete'
  // A ref can be set once both teams are known, and changed after the match.
  const reffable = signedIn && bothTeamsKnown(match)

  // Who could ref depends on who is on a court, so ask again as the match changes.
  const [refOptions, setRefOptions] = useState([])
  const [savingRef, setSavingRef] = useState(false)
  useEffect(() => {
    if (!reffable) return undefined
    let cancelled = false
    getRefOptions(match.id)
      .then((options) => {
        if (!cancelled) setRefOptions(options)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reffable, match.id, match.version, match.court, match.ref_team_id])

  async function handleRef(changed, choice) {
    setSavingRef(true)
    try {
      await onRef(changed, choice)
    } finally {
      setSavingRef(false)
    }
  }

  return (
    <>
      <div className="match-panel-scrim" onClick={onClose} />
      <aside className="match-panel" role="dialog" aria-label={name}>
        <header className="match-panel-head">
          <div>
            <h3>{name}</h3>
            <p className="section-note">{teams}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="match-panel-score">
          <MatchTeams match={match} teamsById={teamsById} bestOf={bestOf} />
        </div>
        <p className="round-card-meta">
          <MatchStatus
            match={match}
            teamsById={teamsById}
            queuePosition={queuePosition}
            overflow={overflow}
          />
          <CourtLink match={match} tournamentId={tournamentId} signedIn={signedIn} />
        </p>

        {signedIn && playable && (
          <section className="match-panel-tools" aria-label="Court and time">
            <h4>Court and time</h4>
            <ScheduleForm
              key={`${match.id}-${match.court}-${match.scheduled_time}`}
              match={match}
              courtCount={courtCount}
              onSaved={onSaved}
            />
          </section>
        )}

        {reffable && (
          <section className="match-panel-tools" aria-label="Ref">
            <h4>Ref</h4>
            <RefSelect
              match={match}
              options={refOptions}
              nameOf={(teamId) => teamName(teamsById, teamId)}
              label={`Ref for ${teams}`}
              disabled={savingRef}
              onChange={handleRef}
            />
            {refError && <p className="finish-note">{refError}</p>}
          </section>
        )}

        {signedIn && (holdable || match.on_hold) && (
          <section className="match-panel-tools" aria-label="Hold">
            <p className="section-note">
              {match.on_hold
                ? 'On hold: kept off the courts until it’s released.'
                : 'Holding keeps this match off the courts, for example while a team is missing.'}
            </p>
            <button type="button" onClick={() => onHold(match, !match.on_hold)}>
              {match.on_hold ? `Release ${name}` : `Hold ${name}`}
            </button>
            {holdError && <p className="finish-note">{holdError}</p>}
          </section>
        )}

        {signedIn && correctable && (
          <section className="match-panel-tools" aria-label="Correct">
            <CorrectionForm
              key={`${match.id}-${match.version}`}
              match={match}
              bestOf={bestOfFor(bestOf, match)}
              team1Name={teamName(teamsById, match.team1_id)}
              team2Name={teamName(teamsById, match.team2_id)}
              onCorrected={onCorrected}
            />
          </section>
        )}
      </aside>
    </>
  )
}
