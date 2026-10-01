import { useState } from 'react'

import ConfirmModal from './ConfirmModal'
import { previewSettings, updateTournament } from './api'
import { useNotify } from './NotificationContext'
import { usePending } from './usePending'

const asNumber = (value) => Number(value)

// One row per setting: how the form holds it, how it goes to the server, and
// the line under it saying what it does.
const GROUPS = [
  {
    title: 'Pool play',
    fields: [
      {
        key: 'target_pool_size',
        label: 'Number of teams per pool',
        type: 'number',
        min: '2',
        note: 'Teams per pool when pools are auto-assigned.',
      },
      {
        key: 'games_per_pairing',
        label: 'Games per pairing',
        type: 'number',
        min: '1',
        note: 'Times each pair of teams plays in pool play.',
      },
      {
        key: 'pool_point_cap',
        label: 'Pool point cap',
        type: 'number',
        min: '1',
        optional: true,
        placeholder: 'No cap',
        note: 'The most points a team can score in a pool game. Blank is no cap. Games already scored are kept as they are.',
      },
    ],
  },
  {
    title: 'Playoffs',
    fields: [
      {
        key: 'playoff_bracket_count',
        label: 'Playoff bracket count',
        type: 'number',
        min: '1',
        note: 'Pool play fills these brackets, best teams first.',
      },
      {
        key: 'advance_per_pool',
        label: 'Advance per pool',
        type: 'number',
        min: '1',
        optional: true,
        placeholder: 'Automatic',
        note: 'Teams from each pool into bracket 1, then bracket 2. Blank splits each pool evenly, with the extras going to the later brackets.',
      },
      {
        key: 'playoff_best_of',
        label: 'Playoff best-of',
        type: 'select',
        options: [1, 3, 5, 7],
        note: 'Games each playoff match is played to. In double elimination, the winners bracket.',
      },
      {
        key: 'playoff_best_of_losers',
        label: 'Losers bracket best-of',
        type: 'select',
        options: [0, 1, 3, 5, 7],
        zeroLabel: 'Same as winners',
        note: 'Double elimination only.',
      },
      {
        key: 'playoff_best_of_final',
        label: 'Grand final best-of',
        type: 'select',
        options: [0, 1, 3, 5, 7],
        zeroLabel: 'Same as winners',
        note: 'Double elimination only. Includes the bracket reset match.',
      },
    ],
  },
  {
    title: 'Courts',
    fields: [
      {
        key: 'court_count',
        label: 'Court count',
        type: 'number',
        min: '1',
        note: 'Courts available to pools and playoffs.',
      },
    ],
  },
]

// The playoff point caps are held as one string, a number per set with blanks
// for no cap ("21,,15"), without trailing blanks so an untouched box isn't a change.
const capsText = (boxes) => {
  const kept = [...boxes]
  while (kept.length > 0 && (kept.at(-1) === '' || Number(kept.at(-1)) === 0)) kept.pop()
  return kept.join(',')
}

// The point cap rows: the winners bracket (and single elimination), then the
// losers bracket and grand final, which follow the winners until switched to
// caps of their own (their value is null while they follow). A row has one box
// per set of its section's best-of.
const winnersSets = (form) => Number(form.playoff_best_of) || 1
const CAP_ROWS = [
  {
    key: 'playoff_point_caps',
    heading: 'Winners bracket',
    group: 'Winners bracket point caps',
    idPrefix: 'playoff-point-cap',
    boxLabel: (number) => `Set ${number} point cap`,
    sets: winnersSets,
  },
  {
    key: 'playoff_point_caps_losers',
    heading: 'Losers bracket',
    group: 'Losers bracket point caps',
    idPrefix: 'playoff-point-cap-losers',
    boxLabel: (number) => `Losers bracket set ${number} point cap`,
    same: 'Losers bracket: same as winners',
    sets: (form) => Number(form.playoff_best_of_losers) || winnersSets(form),
  },
  {
    key: 'playoff_point_caps_final',
    heading: 'Grand final',
    group: 'Grand final point caps',
    idPrefix: 'playoff-point-cap-final',
    boxLabel: (number) => `Grand final set ${number} point cap`,
    same: 'Grand final: same as winners',
    sets: (form) => Number(form.playoff_best_of_final) || winnersSets(form),
  },
]

// A row's boxes: one per set, the ones not filled in blank.
function capBoxesOf(text, sets) {
  const held = text.split(',')
  return Array.from({ length: sets }, (_, i) => held[i] ?? '')
}

const capList = (value) => {
  if (value === null) return null
  return value === '' ? [] : value.split(',').map(asNumber)
}

// What the form holds (strings, so a box can be empty) from what the server has.
function toForm(tournament) {
  return {
    name: tournament.name ?? '',
    date: tournament.date ?? '',
    venue: tournament.venue ?? '',
    target_pool_size: String(tournament.target_pool_size ?? 4),
    games_per_pairing: String(tournament.games_per_pairing ?? 1),
    playoff_bracket_count: String(tournament.playoff_bracket_count ?? 1),
    advance_per_pool: tournament.advance_per_pool == null ? '' : String(tournament.advance_per_pool),
    playoff_best_of: String(tournament.playoff_best_of ?? 1),
    playoff_best_of_losers: String(tournament.playoff_best_of_losers ?? 0),
    playoff_best_of_final: String(tournament.playoff_best_of_final ?? 0),
    pool_point_cap: tournament.pool_point_cap ? String(tournament.pool_point_cap) : '',
    playoff_point_caps: capsText((tournament.playoff_point_caps ?? []).map(String)),
    // null: the same as the winners bracket's
    playoff_point_caps_losers:
      tournament.playoff_point_caps_losers == null
        ? null
        : capsText(tournament.playoff_point_caps_losers.map(String)),
    playoff_point_caps_final:
      tournament.playoff_point_caps_final == null
        ? null
        : capsText(tournament.playoff_point_caps_final.map(String)),
    court_count: String(tournament.court_count ?? 1),
  }
}

// What goes to the server for a form value: numbers as numbers, empty as null.
function toServer(key, value) {
  if (key === 'name') return value
  if (key === 'date' || key === 'venue') return value.trim() === '' ? null : value.trim()
  if (key === 'advance_per_pool') return value === '' ? null : asNumber(value)
  if (key.startsWith('playoff_point_caps')) return capList(value)
  return asNumber(value)
}

/**
 * The tournament's settings, grouped by what they run. Saving sends only what
 * changed. Anything that would move teams between brackets, re-dispatch matches
 * or leave an existing schedule as it is is listed in a dialog first, to save
 * or cancel; a setting that has locked is disabled with the reason.
 */
export default function SettingsForm({ tournamentId, tournament, onSaved }) {
  const [form, setForm] = useState(() => toForm(tournament))
  const [reviewing, setReviewing] = useState(null)
  const notify = useNotify()
  const locks = tournament.setting_locks ?? {}
  const saved = toForm(tournament)

  const changes = Object.fromEntries(
    Object.keys(form)
      .filter((key) => form[key] !== saved[key])
      .map((key) => [key, toServer(key, form[key])]),
  )
  const dirty = Object.keys(changes).length > 0

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const setCap = (row, index) => (event) =>
    setForm((current) => {
      const boxes = capBoxesOf(current[row.key], row.sets(current))
      boxes[index] = event.target.value
      return { ...current, [row.key]: capsText(boxes) }
    })
  // Switching a row to caps of its own starts it from the winners', so nothing is lost.
  const setSameAsWinners = (row, same) =>
    setForm((current) => ({ ...current, [row.key]: same ? null : current.playoff_point_caps }))

  async function explain(error, fallback) {
    const body = await error?.json?.().catch(() => null)
    notify(typeof body?.detail === 'string' ? body.detail : fallback, { type: 'error' })
  }

  const [save, saving] = usePending(async () => {
    setReviewing(null)
    try {
      const updated = await updateTournament(tournamentId, changes)
      setForm(toForm(updated))
      onSaved(updated)
      notify('Tournament settings saved')
    } catch (error) {
      await explain(error, 'Failed to save settings')
    }
  })

  const [review, checking] = usePending(async () => {
    try {
      const { effects } = await previewSettings(tournamentId, changes)
      if (effects.length === 0) await save()
      else setReviewing(effects)
    } catch (error) {
      await explain(error, 'Failed to check the settings')
    }
  })

  function handleSubmit(event) {
    event.preventDefault()
    if (dirty) review()
  }

  return (
    <form onSubmit={handleSubmit} className="settings-form">
      <fieldset>
        <legend>Tournament</legend>
        <span className="field">
          <label htmlFor="tournament-name">Tournament name</label>
          <input id="tournament-name" value={form.name} onChange={set('name')} />
        </span>
        <span className="field">
          <label htmlFor="tournament-date">Date</label>
          <input id="tournament-date" type="date" value={form.date} onChange={set('date')} />
        </span>
        <span className="field">
          <label htmlFor="tournament-venue">Venue</label>
          <input id="tournament-venue" value={form.venue} onChange={set('venue')} />
        </span>
      </fieldset>

      {GROUPS.map((group) => (
        <fieldset key={group.title}>
          <legend>{group.title}</legend>
          {group.fields.map((field) => {
            const id = field.key.replaceAll('_', '-')
            const lock = locks[field.key]
            const shared = {
              id,
              value: form[field.key],
              disabled: Boolean(lock),
              onChange: set(field.key),
              'aria-describedby': `${id}-note`,
            }
            return (
              <span key={field.key} className="field">
                <label htmlFor={id}>{field.label}</label>
                {field.type === 'select' ? (
                  <select {...shared}>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option === 0 ? field.zeroLabel : option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input {...shared} type="number" min={field.min} placeholder={field.placeholder} />
                )}
                <small id={`${id}-note`} className="field-note">
                  {lock ? `Locked: ${lock}.` : field.note}
                </small>
              </span>
            )
          })}
          {group.title === 'Playoffs' && (
            <div className="field cap-rows" role="group" aria-label="Playoff point caps">
              <span className="field-label">Playoff point cap, by set</span>
              {CAP_ROWS.map((row) => (
                <div key={row.key} className="cap-row">
                  <span className="field-label">{row.heading}</span>
                  {row.same && (
                    <label className="cap-same">
                      <input
                        type="checkbox"
                        aria-label={row.same}
                        checked={form[row.key] === null}
                        onChange={(event) => setSameAsWinners(row, event.target.checked)}
                      />
                      Same as winners
                    </label>
                  )}
                  {form[row.key] !== null && (
                    <span className="cap-boxes" role="group" aria-label={row.group}>
                      {capBoxesOf(form[row.key], row.sets(form)).map((value, index) => (
                        <span key={index} className="cap-box">
                          <label htmlFor={`${row.idPrefix}-${index + 1}`}>Set {index + 1}</label>
                          <input
                            id={`${row.idPrefix}-${index + 1}`}
                            aria-label={row.boxLabel(index + 1)}
                            type="number"
                            min="1"
                            placeholder="No cap"
                            value={value}
                            onChange={setCap(row, index)}
                            aria-describedby="playoff-point-caps-note"
                          />
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              ))}
              <small id="playoff-point-caps-note" className="field-note">
                The most points a team can score in each set; blank is no cap, and a set is won by
                reaching it. Sets already scored are kept as they are. The losers bracket and
                grand final use the winners bracket&apos;s caps unless switched to their own.
              </small>
            </div>
          )}
        </fieldset>
      ))}

      <button type="submit" disabled={!dirty || saving || checking}>
        Save
      </button>

      <ConfirmModal
        open={reviewing !== null}
        title="Review changes"
        message={
          <>
            <p>Saving these settings will:</p>
            <ul className="effects-list">
              {(reviewing ?? []).map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
          </>
        }
        confirmLabel="Save changes"
        cancelLabel="Keep editing"
        onConfirm={save}
        onCancel={() => setReviewing(null)}
      />
    </form>
  )
}
