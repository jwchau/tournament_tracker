import { BrowserRouter, Route, Routes } from 'react-router-dom'

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
              <h1>Tournament Tracker</h1>
              <HealthCheck />
              <NavBar />

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
            </NavigationHistoryProvider>
          </AuthProvider>
        </NotificationProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
