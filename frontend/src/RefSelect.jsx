import { refChoice, refName } from './refModel'

/**
 * Choose a match's ref: Automatic (naming who the rules picked), the teams
 * free to ref it (`options`, { id, name }), or N/A. A hand-set ref that is
 * no longer free still shows as the current choice.
 */
export default function RefSelect({ match, options, nameOf, label, disabled, onChange }) {
  const current = refChoice(match)
  const listed =
    current !== 'auto' && current !== 'na' && !options.some((team) => String(team.id) === current)
      ? [{ id: match.ref_team_id, name: nameOf(match.ref_team_id) }, ...options]
      : options
  return (
    <select
      aria-label={label}
      value={current}
      disabled={disabled}
      onChange={(event) => onChange(match, event.target.value)}
    >
      <option value="auto">
        Automatic{match.ref_set_at == null ? ` (${refName(match, nameOf)})` : ''}
      </option>
      {listed.map((team) => (
        <option key={team.id} value={String(team.id)}>
          {team.name}
        </option>
      ))}
      <option value="na">N/A</option>
    </select>
  )
}
