import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { useAuth } from './auth'
import AuthProvider from './AuthProvider'
import { NotificationProvider } from './NotificationContext'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function WhoAmI() {
  const { user, loading } = useAuth()
  if (loading) return <p>Checking sign-in</p>
  return <p>{user ? `Signed in as ${user.username}` : 'Signed out'}</p>
}

function AddTeamButton() {
  return (
    <button type="button" onClick={() => api.createTeam(1, { name: 'Ice Wolves' }).catch(() => {})}>
      Add team
    </button>
  )
}

function LoginLocation() {
  const location = useLocation()
  return <p>Login page {location.search}</p>
}

function renderApp(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <NotificationProvider>
        <AuthProvider>
          <WhoAmI />
          <Routes>
            <Route path="/tournaments/:id" element={<AddTeamButton />} />
            <Route path="/login" element={<LoginLocation />} />
          </Routes>
        </AuthProvider>
      </NotificationProvider>
    </MemoryRouter>,
  )
}

test('loads who is signed in on start', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue({ id: 1, username: 'organizer' })

  renderApp('/tournaments/1')

  expect(await screen.findByText('Signed in as organizer')).toBeInTheDocument()
})

test('a spectator is signed out', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)

  renderApp('/tournaments/1')

  expect(await screen.findByText('Signed out')).toBeInTheDocument()
})

test('a write refused with 401 sends the user to sign in, then back', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const signedIn = url.endsWith('/auth/me')
      const body = signedIn ? { id: 1, username: 'organizer' } : { detail: 'sign in to make changes' }
      const status = signedIn ? 200 : 401
      return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
    }),
  )

  renderApp('/tournaments/1')
  await screen.findByText('Signed in as organizer')
  fireEvent.click(screen.getByRole('button', { name: 'Add team' }))

  expect(await screen.findByText('Login page ?next=%2Ftournaments%2F1')).toBeInTheDocument()
  expect(screen.getByText('Sign in to make changes')).toBeInTheDocument()
  // The session was gone, so the app no longer thinks anyone is signed in.
  expect(screen.getByText('Signed out')).toBeInTheDocument()
})
