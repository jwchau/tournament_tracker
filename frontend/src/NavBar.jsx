import { Link } from 'react-router-dom'

import { useNavigationHistory } from './NavigationHistoryContext'

export default function NavBar() {
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory()

  return (
    <nav className="nav-bar">
      <button type="button" onClick={goBack} disabled={!canGoBack} aria-label="Go back">
        ← Back
      </button>
      <Link to="/">Home</Link>
      <button type="button" onClick={goForward} disabled={!canGoForward} aria-label="Go forward">
        Forward →
      </button>
    </nav>
  )
}
