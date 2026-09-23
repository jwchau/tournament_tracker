import { BrowserRouter, Route, Routes } from 'react-router-dom'

import BracketPage from './BracketPage'
import HealthCheck from './HealthCheck'
import MainPage from './MainPage'
import NavBar from './NavBar'
import { NavigationHistoryProvider } from './NavigationHistoryContext'
import { NotificationProvider } from './NotificationContext'
import PoolPage from './PoolPage'
import TeamPage from './TeamPage'
import TournamentPage from './TournamentPage'

function App() {
  return (
    <BrowserRouter>
      <NotificationProvider>
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
          </Routes>
        </NavigationHistoryProvider>
      </NotificationProvider>
    </BrowserRouter>
  )
}

export default App
