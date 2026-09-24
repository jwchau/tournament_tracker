import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import AccountPage from './AccountPage'
import * as api from './api'
import { NotificationProvider } from './NotificationContext'
import { fireEvent, render, screen } from './testUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAccount(options) {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <NotificationProvider>
        <AccountPage />
      </NotificationProvider>
    </MemoryRouter>,
    options,
  )
}

function changePassword(current, next, again = next) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('New password again'), { target: { value: again } })
  fireEvent.click(screen.getByRole('button', { name: /change password/i }))
}

test('changes the password', async () => {
  const change = vi.spyOn(api, 'changePassword').mockResolvedValue(null)

  renderAccount()
  expect(screen.getByText(/signed in as organizer/i)).toBeInTheDocument()
  changePassword('old-fake-password', 'new-fake-password')

  expect(await screen.findByText('Password changed')).toBeInTheDocument()
  expect(change).toHaveBeenCalledWith({
    currentPassword: 'old-fake-password',
    newPassword: 'new-fake-password',
  })
  expect(screen.getByLabelText('Current password')).toHaveValue('')
})

test('a wrong current password is shown inline', async () => {
  vi.spyOn(api, 'changePassword').mockRejectedValue({
    status: 400,
    json: () => Promise.resolve({ detail: 'current password is incorrect' }),
  })

  renderAccount()
  changePassword('wrong-password', 'new-fake-password')

  expect(await screen.findByText('current password is incorrect')).toBeInTheDocument()
})

test('the new password has to be typed the same twice', async () => {
  const change = vi.spyOn(api, 'changePassword')

  renderAccount()
  changePassword('old-fake-password', 'new-fake-password', 'different-password')

  expect(await screen.findByText("The new passwords don't match.")).toBeInTheDocument()
  expect(change).not.toHaveBeenCalled()
})

test('signed out, it asks the user to sign in', () => {
  renderAccount({ user: null })

  expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
    'href',
    '/login?next=%2Faccount',
  )
  expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
})
