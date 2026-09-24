import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { getMe, login, logout, setUnauthorizedHandler } from './api'
import { AuthContext, loginPath } from './auth'
import { useNotify } from './NotificationContext'

// Loads who is signed in on start, and sends anyone whose write was refused
// (signed out, or their session expired) to sign in and then come back.
// Needs to sit inside the router and the NotificationProvider.
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const notify = useNotify()
  const currentPath = location.pathname

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      notify('Sign in to make changes', { type: 'error' })
      navigate(loginPath(currentPath))
    })
    return () => setUnauthorizedHandler(null)
    // notify is a new function every render; the handler only needs the latest path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, navigate])

  const signIn = useCallback(async (credentials) => {
    setUser(await login(credentials))
  }, [])

  const signOut = useCallback(async () => {
    // Signed out either way, even if the session had already expired.
    await logout().catch(() => {})
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
