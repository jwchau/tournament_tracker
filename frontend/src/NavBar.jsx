import { Link, useLocation } from 'react-router-dom'

import { loginPath, useAuth } from './auth'
import { useNavigationHistory } from './NavigationHistoryContext'

export default function NavBar() {
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory()
  const { user, loading, signOut } = useAuth()
  const location = useLocation()

  return (
    <nav className="nav-bar">
      <button type="button" onClick={goBack} disabled={!canGoBack} aria-label="Go back">
        ← Back
      </button>
      <Link to="/">Home</Link>
      <button type="button" onClick={goForward} disabled={!canGoForward} aria-label="Go forward">
        Forward →
      </button>
      {!loading &&
        (user ? (
          <>
            <Link to="/account">{user.username}</Link>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          location.pathname !== '/login' && <Link to={loginPath(location.pathname)}>Sign in</Link>
        ))}
    </nav>
  )
}
