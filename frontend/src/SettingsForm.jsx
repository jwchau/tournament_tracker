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
        label: 'Target pool size',
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
        note: 'Games each playoff match is played to.',
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
    court_count: String(tournament.court_count ?? 1),
  }
}

// What goes to the server for a form value: numbers as numbers, empty as null.
function toServer(key, value) {
  if (key === 'name') return value
  if (key === 'date' || key === 'venue') return value.trim() === '' ? null : value.trim()
  if (key === 'advance_per_pool') return value === '' ? null : asNumber(value)
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
                        {option}
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
