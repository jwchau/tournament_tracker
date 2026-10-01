import { Link, useLocation } from 'react-router-dom'

import { hasRole, loginPath, useAuth } from './auth'
import PageTrail from './PageTrail'

// The app bar's controls: the page trail, then the account links.
export default function NavBar() {
  const { user, loading, signOut } = useAuth()
  const location = useLocation()

  return (
    <>
      <PageTrail />
      <nav className="nav-bar" aria-label="Account">
        {!loading &&
          (user ? (
            <>
              {hasRole(user, 'admin') && <Link to="/users">Users</Link>}
              <Link to="/account">{user.username}</Link>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            location.pathname !== '/login' && <Link to={loginPath(location.pathname)}>Sign in</Link>
          ))}
      </nav>
    </>
  )
}
