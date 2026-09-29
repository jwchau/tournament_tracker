import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { safeNextPath, useAuth } from './auth'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { signIn } = useAuth()

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    try {
      await signIn({ username, password })
      navigate(safeNextPath(searchParams.get('next')))
    } catch (failure) {
      const body = await failure?.json?.().catch(() => null)
      setError(body?.detail ?? "Couldn't sign in.")
    }
  }

  return (
    <div className="form-page">
      <header className="court-strip court-strip-narrow">
        <div className="court-strip-title">
          <h2>Sign in</h2>
        </div>
      </header>
      <form onSubmit={handleSubmit} className="form-panel">
        <span className="field">
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </span>
        <span className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </span>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  )
}
