import { useState } from 'react'

import { scheduleMatch } from './api'

// Times are venue-local wall-clock times with no timezone, so the
// datetime-local input's "YYYY-MM-DDTHH:MM" is used as-is.
function toInputValue(scheduledTime) {
  return scheduledTime ? scheduledTime.slice(0, 16) : ''
}

export default function ScheduleForm({ match, title, courtCount = 1, onSaved }) {
  const [court, setCourt] = useState(match.court != null ? String(match.court) : '')
  const [time, setTime] = useState(toInputValue(match.scheduled_time))
  const [error, setError] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      const updated = await scheduleMatch(match.id, {
        court: court === '' ? null : Number(court),
        scheduledTime: time === '' ? null : time,
      })
      setError(false)
      onSaved?.(updated)
    } catch {
      setError(true)
    }
  }

  const courtId = `schedule-${match.id}-court`
  const timeId = `schedule-${match.id}-time`

  return (
    <form onSubmit={handleSubmit}>
      {title && <p>{title}</p>}
      <label htmlFor={courtId}>Court</label>
      <select id={courtId} value={court} onChange={(event) => setCourt(event.target.value)}>
        <option value="">No court</option>
        {Array.from({ length: courtCount }, (_, index) => (
          <option key={index + 1} value={String(index + 1)}>
            Court {index + 1}
          </option>
        ))}
      </select>
      <label htmlFor={timeId}>Time</label>
      <input
        id={timeId}
        type="datetime-local"
        value={time}
        onChange={(event) => setTime(event.target.value)}
      />
      <button type="submit">Save schedule</button>
      {error && <p>Couldn't save the schedule. Please try again.</p>}
    </form>
  )
}
