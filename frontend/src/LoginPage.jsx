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
    <>
      <h2>Sign in</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit">Sign in</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </>
  )
}
