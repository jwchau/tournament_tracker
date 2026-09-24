import { useState } from 'react'
import { Link } from 'react-router-dom'

import { changePassword } from './api'
import { loginPath, useAuth } from './auth'
import { useNotify } from './NotificationContext'

const MIN_PASSWORD_LENGTH = 8

export default function AccountPage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordAgain, setNewPasswordAgain] = useState('')
  const [error, setError] = useState(null)
  const notify = useNotify()

  if (!user) {
    return (
      <p>
        <Link to={loginPath('/account')}>Sign in</Link> to manage your account.
      </p>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (newPassword !== newPasswordAgain) {
      setError("The new passwords don't match.")
      return
    }
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordAgain('')
      notify('Password changed')
    } catch (failure) {
      const body = await failure?.json?.().catch(() => null)
      setError(typeof body?.detail === 'string' ? body.detail : "Couldn't change the password.")
    }
  }

  const fields = [
    ['Current password', 'current-password', currentPassword, setCurrentPassword, 'current-password'],
    ['New password', 'new-password', newPassword, setNewPassword, 'new-password'],
    ['New password again', 'new-password-again', newPasswordAgain, setNewPasswordAgain, 'new-password'],
  ]

  return (
    <>
      <h2>Account</h2>
      <p>Signed in as {user.username}.</p>
      <form onSubmit={handleSubmit}>
        {fields.map(([label, id, value, setValue, autoComplete]) => (
          <span key={id}>
            <label htmlFor={id}>{label}</label>
            <input
              id={id}
              type="password"
              autoComplete={autoComplete}
              required
              minLength={id === 'current-password' ? undefined : MIN_PASSWORD_LENGTH}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </span>
        ))}
        <button type="submit">Change password</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <p>Changing your password signs you out on every other device.</p>
    </>
  )
}
