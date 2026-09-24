import { Link, useLocation } from 'react-router-dom'

import { loginPath, useAuth } from './auth'
import { useNavigationHistory } from './NavigationHistoryContext'

function Chevron({ direction }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        d={direction === 'back' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function NavBar() {
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory()
  const { user, loading, signOut } = useAuth()
  const location = useLocation()

  return (
    <nav className="nav-bar">
      <button
        type="button"
        className="icon-button"
        onClick={goBack}
        disabled={!canGoBack}
        aria-label="Go back"
      >
        <Chevron direction="back" />
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={goForward}
        disabled={!canGoForward}
        aria-label="Go forward"
      >
        <Chevron direction="forward" />
      </button>
      <Link to="/" className="nav-home">
        Home
      </Link>
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
