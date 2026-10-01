import { useEffect, useState } from 'react'

import { changeUserRole, createUser, listUsers } from './api'
import { hasRole, useAuth } from './auth'
import { failureMessage } from './failure'
import Loading from './Loading'
import { useNotify } from './NotificationContext'
import { useNotifyFailure } from './useNotifyFailure'

const ROLES = ['scorekeeper', 'organizer', 'admin']
const MIN_PASSWORD_LENGTH = 8

// Admins only. Anyone else is told so without anything being loaded; the server
// refuses them too.
export default function UsersPage() {
  const { user } = useAuth()
  if (hasRole(user, 'admin')) return <UserAdmin user={user} />
  return (
    <div className="form-page">
      <header className="court-strip court-strip-narrow">
        <div className="court-strip-title">
          <h2>Users</h2>
        </div>
      </header>
      <p className="setup-note">Only admins can manage users.</p>
    </div>
  )
}

// Who has an account and what they can do. Your own row is read-only, so an
// admin can't take away their own access.
function UserAdmin({ user }) {
  const [users, setUsers] = useState(null)
  const notifyFailure = useNotifyFailure()
  const notify = useNotify()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('scorekeeper')
  const [createError, setCreateError] = useState(null)

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((error) => {
        setUsers([])
        notifyFailure(error, "Couldn't load the users")
      })
    // Only on first show; notifyFailure is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(event) {
    event.preventDefault()
    setCreateError(null)
    try {
      const created = await createUser({ username, password, role })
      setUsers((current) => [...current, created])
      setUsername('')
      setPassword('')
      setRole('scorekeeper')
      notify(`Added ${created.username}`)
    } catch (error) {
      setCreateError(await failureMessage(error, "Couldn't add the user."))
    }
  }

  // The row follows the server's answer, so a refused change leaves the old role showing.
  async function handleRoleChange(account, role) {
    try {
      const updated = await changeUserRole(account.id, role)
      setUsers((current) => current.map((u) => (u.id === updated.id ? updated : u)))
      notify(`${updated.username} is now ${role === 'scorekeeper' ? 'a' : 'an'} ${role}`)
    } catch (error) {
      notifyFailure(error, "Couldn't change the role")
    }
  }

  return (
    <div className="form-page">
      <header className="court-strip court-strip-narrow">
        <div className="court-strip-title">
          <h2>Users</h2>
        </div>
      </header>
      {users === null ? (
        <Loading label="Loading users" rows={3} />
      ) : (
        <section className="board-section" aria-labelledby="users-heading">
          <h3 id="users-heading">Accounts</h3>
          <ul className="user-list">
            {users.map((account) => (
              <li key={account.id}>
                <span className="user-name">{account.username}</span>
                {account.id === user.id ? (
                  <span className="user-role">{account.role}</span>
                ) : (
                  <select
                    aria-label={`Role for ${account.username}`}
                    value={account.role}
                    onChange={(event) => handleRoleChange(account, event.target.value)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="board-section" aria-labelledby="add-user-heading">
        <h3 id="add-user-heading">Add a user</h3>
        <form onSubmit={handleCreate} className="form-panel">
          <span className="field">
            <label htmlFor="new-user-name">Username</label>
            <input
              id="new-user-name"
              autoComplete="off"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </span>
          <span className="field">
            <label htmlFor="new-user-password">Initial password</label>
            <input
              id="new-user-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </span>
          <span className="field">
            <label htmlFor="new-user-role">Role</label>
            <select id="new-user-role" value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </span>
          {createError && <p role="alert">{createError}</p>}
          <button type="submit">Add user</button>
        </form>
        <p className="section-note">
          Tell them the password yourself; they can change it from their account page.
        </p>
      </section>
    </div>
  )
}
