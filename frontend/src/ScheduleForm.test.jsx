import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import ScheduleForm from './ScheduleForm'

afterEach(() => {
  vi.restoreAllMocks()
})

const match = {
  id: 7,
  round: 1,
  position: 2,
  court: 2,
  scheduled_time: '2026-10-03T10:30:00',
  status: 'ready',
}

test('shows the current court and time and saves edits', async () => {
  const saved = { ...match, scheduled_time: '2026-10-03T11:00:00' }
  const scheduleMatch = vi.spyOn(api, 'scheduleMatch').mockResolvedValue(saved)
  const onSaved = vi.fn()

  render(<ScheduleForm match={match} courtCount={3} onSaved={onSaved} />)

  const court = screen.getByLabelText(/court/i)
  const time = screen.getByLabelText(/time/i)
  expect(court).toHaveValue('2')
  expect(time).toHaveValue('2026-10-03T10:30')

  fireEvent.change(time, { target: { value: '2026-10-03T11:00' } })
  fireEvent.click(screen.getByRole('button', { name: /save schedule/i }))

  await waitFor(() =>
    expect(scheduleMatch).toHaveBeenCalledWith(7, {
      court: 2,
      scheduledTime: '2026-10-03T11:00',
    }),
  )
  expect(onSaved).toHaveBeenCalledWith(saved)
})

test('offers one option per court plus none', () => {
  render(<ScheduleForm match={match} courtCount={3} />)

  const options = screen.getAllByRole('option').map((option) => option.textContent)
  expect(options).toEqual(['No court', 'Court 1', 'Court 2', 'Court 3'])
})

test('clearing both fields saves nulls', async () => {
  const scheduleMatch = vi
    .spyOn(api, 'scheduleMatch')
    .mockResolvedValue({ ...match, court: null, scheduled_time: null })

  render(<ScheduleForm match={match} courtCount={3} />)

  fireEvent.change(screen.getByLabelText(/court/i), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText(/time/i), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /save schedule/i }))

  await waitFor(() =>
    expect(scheduleMatch).toHaveBeenCalledWith(7, { court: null, scheduledTime: null }),
  )
})

test('shows an error when saving fails', async () => {
  vi.spyOn(api, 'scheduleMatch').mockRejectedValue({ status: 400 })

  render(<ScheduleForm match={match} courtCount={3} />)
  fireEvent.click(screen.getByRole('button', { name: /save schedule/i }))

  expect(await screen.findByText(/couldn.t save/i)).toBeInTheDocument()
})
