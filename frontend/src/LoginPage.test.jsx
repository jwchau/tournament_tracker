import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import AuthProvider from './AuthProvider'
import LoginPage from './LoginPage'
import { NotificationProvider } from './NotificationContext'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderLogin(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <NotificationProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/brackets/:id" element={<h2>Bracket page</h2>} />
            <Route path="/" element={<h2>Home page</h2>} />
          </Routes>
        </AuthProvider>
      </NotificationProvider>
    </MemoryRouter>,
  )
}

function signIn(username, password) {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: username } })
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

test('signing in submits the details and goes on to the next page', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  const login = vi.spyOn(api, 'login').mockResolvedValue({ id: 1, username: 'organizer' })

  renderLogin('/login?next=/brackets/3')
  signIn('organizer', 'fake-password')

  expect(await screen.findByText('Bracket page')).toBeInTheDocument()
  expect(login).toHaveBeenCalledWith({ username: 'organizer', password: 'fake-password' })
})

test('without a next page, signing in goes home', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  vi.spyOn(api, 'login').mockResolvedValue({ id: 1, username: 'organizer' })

  renderLogin('/login')
  signIn('organizer', 'fake-password')

  expect(await screen.findByText('Home page')).toBeInTheDocument()
})

test('a next page on another site is ignored', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  vi.spyOn(api, 'login').mockResolvedValue({ id: 1, username: 'organizer' })

  renderLogin('/login?next=//evil.example.com')
  signIn('organizer', 'fake-password')

  expect(await screen.findByText('Home page')).toBeInTheDocument()
})

test('a failed sign-in shows the error inline and stays on the page', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(null)
  vi.spyOn(api, 'login').mockRejectedValue({
    status: 401,
    json: () => Promise.resolve({ detail: 'invalid username or password' }),
  })

  renderLogin('/login?next=/brackets/3')
  signIn('organizer', 'wrong-password')

  expect(await screen.findByText('invalid username or password')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  expect(screen.queryByText('Bracket page')).not.toBeInTheDocument()
})
