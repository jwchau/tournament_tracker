import { fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import AuthProvider from './AuthProvider'
import { NavigationHistoryProvider } from './NavigationHistoryContext'
import NavBar from './NavBar'
import { NotificationProvider } from './NotificationContext'

afterEach(() => {
  vi.restoreAllMocks()
})

function HomePage() {
  return (
    <>
      <h2>Home page</h2>
      <Link to="/tournaments/1">Go to tournament</Link>
    </>
  )
}

function TournamentPage() {
  return <h2>Tournament page</h2>
}

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NotificationProvider>
        <AuthProvider>
          <NavigationHistoryProvider>
            <NavBar />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/tournaments/:id" element={<TournamentPage />} />
            </Routes>
          </NavigationHistoryProvider>
        </AuthProvider>
      </NotificationProvider>
    </MemoryRouter>,
  )
}

test('back and forward buttons track pages visited', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  renderApp()

  expect(screen.getByRole('button', { name: /go back/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: /go forward/i })).toBeDisabled()

  fireEvent.click(screen.getByRole('link', { name: /go to tournament/i }))
  expect(await screen.findByText('Tournament page')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /go back/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /go forward/i })).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: /go back/i }))
  expect(await screen.findByText('Home page')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /go back/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: /go forward/i })).toBeEnabled()

  fireEvent.click(screen.getByRole('button', { name: /go forward/i }))
  expect(await screen.findByText('Tournament page')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /go forward/i })).toBeDisabled()
})

test('signed out, the nav bar offers to sign in and come back to this page', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)

  renderApp('/tournaments/1')

  const link = await screen.findByRole('link', { name: 'Sign in' })
  expect(link).toHaveAttribute('href', '/login?next=%2Ftournaments%2F1')
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

test('signed in, the nav bar shows the username and signs out', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue({ id: 1, username: 'organizer' })
  const logout = vi.spyOn(api, 'logout').mockResolvedValue(null)

  renderApp()

  expect(await screen.findByRole('link', { name: 'organizer' })).toHaveAttribute('href', '/account')
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

  expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  expect(logout).toHaveBeenCalled()
  expect(screen.queryByRole('link', { name: 'organizer' })).not.toBeInTheDocument()
})
