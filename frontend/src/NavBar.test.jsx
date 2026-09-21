import { fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'

import { NavigationHistoryProvider } from './NavigationHistoryContext'
import NavBar from './NavBar'

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

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <NavigationHistoryProvider>
        <NavBar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tournaments/:id" element={<TournamentPage />} />
        </Routes>
      </NavigationHistoryProvider>
    </MemoryRouter>,
  )
}

test('back and forward buttons track pages visited', async () => {
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
