import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'

import AccountPage from './AccountPage'
import AuthProvider from './AuthProvider'
import BracketPage from './BracketPage'
import CourtPage from './CourtPage'
import CourtsPage from './CourtsPage'
import ErrorBoundary from './ErrorBoundary'
import HealthCheck from './HealthCheck'
import LoginPage from './LoginPage'
import MainPage from './MainPage'
import NavBar from './NavBar'
import { NavigationHistoryProvider } from './NavigationHistoryContext'
import NotFound from './NotFound'
import { NotificationProvider } from './NotificationContext'
import PoolPage from './PoolPage'
import TeamPage from './TeamPage'
import TournamentPage from './TournamentPage'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <NotificationProvider>
          <AuthProvider>
            <NavigationHistoryProvider>
              <header className="app-bar">
                <div className="app-bar-inner">
                  <h1>
                    <Link to="/" className="brand">
                      <span className="brand-mark" aria-hidden="true">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 3h4v4h4v6" strokeLinejoin="round" />
                          <path d="M2 13h4V9" strokeLinejoin="round" />
                          <circle cx="13" cy="7" r="1.6" fill="currentColor" stroke="none" />
                        </svg>
                      </span>
                      <span className="brand-text">Tournament Tracker</span>
                    </Link>
                  </h1>
                  <NavBar />
                  <HealthCheck />
                </div>
              </header>

              <main className="app-main">
                <Routes>
                  <Route path="/" element={<MainPage />} />
                  <Route path="/tournaments/:tournamentId" element={<TournamentPage />} />
                  <Route path="/teams/:teamId" element={<TeamPage />} />
                  <Route path="/pools/:poolId" element={<PoolPage />} />
                  <Route path="/brackets/:bracketId" element={<BracketPage />} />
                  <Route path="/tournaments/:tournamentId/courts" element={<CourtsPage />} />
                  <Route path="/tournaments/:tournamentId/courts/:court" element={<CourtPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
            </NavigationHistoryProvider>
          </AuthProvider>
        </NotificationProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
