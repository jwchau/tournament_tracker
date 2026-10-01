import { fireEvent, render, screen, userWithRole, waitFor, within } from './testUtils'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { NotificationProvider } from './NotificationContext'
import UsersPage from './UsersPage'

afterEach(() => {
  vi.restoreAllMocks()
})

const ME = { id: 2, username: 'root', role: 'admin' }
const USERS = [
  { id: 1, username: 'keeper', role: 'scorekeeper' },
  ME,
  { id: 3, username: 'boss', role: 'organizer' },
]

function renderPage(user = ME) {
  return render(
    <MemoryRouter>
      <NotificationProvider>
        <UsersPage />
      </NotificationProvider>
    </MemoryRouter>,
    { user },
  )
}

test('choosing another role changes it, and a refusal puts the old one back with the reason', async () => {
  vi.spyOn(api, 'listUsers').mockResolvedValue(USERS)
  const changeUserRole = vi
    .spyOn(api, 'changeUserRole')
    .mockResolvedValueOnce({ id: 1, username: 'keeper', role: 'organizer' })
    .mockRejectedValueOnce({ json: () => Promise.resolve({ detail: 'you can’t change your own role' }) })

  renderPage()

  const keeper = await screen.findByRole('combobox', { name: 'Role for keeper' })
  fireEvent.change(keeper, { target: { value: 'organizer' } })
  expect(await screen.findByText('keeper is now an organizer')).toBeInTheDocument()
  expect(changeUserRole).toHaveBeenCalledWith(1, 'organizer')
  expect(keeper).toHaveValue('organizer')

  const boss = screen.getByRole('combobox', { name: 'Role for boss' })
  fireEvent.change(boss, { target: { value: 'admin' } })
  expect(await screen.findByText('you can’t change your own role')).toBeInTheDocument()
  await waitFor(() => expect(boss).toHaveValue('organizer'))
})

test('an admin can add a user with a role, and a taken username shows why', async () => {
  vi.spyOn(api, 'listUsers').mockResolvedValue(USERS)
  const createUser = vi
    .spyOn(api, 'createUser')
    .mockRejectedValueOnce({ json: () => Promise.resolve({ detail: "there is already a user 'newkeeper'" }) })
    .mockResolvedValueOnce({ id: 9, username: 'newkeeper', role: 'organizer' })

  renderPage()

  await screen.findByRole('combobox', { name: 'Role for keeper' })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newkeeper' } })
  fireEvent.change(screen.getByLabelText('Initial password'), { target: { value: 'a-long-enough-one' } })
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'organizer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add user' }))

  expect(await screen.findByRole('alert')).toHaveTextContent("there is already a user 'newkeeper'")
  expect(screen.getByLabelText('Username')).toHaveValue('newkeeper')

  fireEvent.click(screen.getByRole('button', { name: 'Add user' }))

  expect(await screen.findByRole('combobox', { name: 'Role for newkeeper' })).toHaveValue('organizer')
  expect(createUser).toHaveBeenLastCalledWith({
    username: 'newkeeper',
    password: 'a-long-enough-one',
    role: 'organizer',
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Username')).toHaveValue('')
  expect(screen.getByLabelText('Initial password')).toHaveValue('')
})

test.each([
  ['an organizer', userWithRole('organizer')],
  ['a scorekeeper', userWithRole('scorekeeper')],
  ['a spectator', null],
])('%s is told the page is for admins and nothing is loaded', async (_who, user) => {
  const listUsers = vi.spyOn(api, 'listUsers').mockResolvedValue(USERS)

  renderPage(user)

  expect(await screen.findByText(/only admins can manage users/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add user' })).not.toBeInTheDocument()
  expect(listUsers).not.toHaveBeenCalled()
})

test('an admin sees every user with a role to change, except their own', async () => {
  vi.spyOn(api, 'listUsers').mockResolvedValue(USERS)

  renderPage()

  const keeper = await screen.findByRole('combobox', { name: 'Role for keeper' })
  expect(keeper).toHaveValue('scorekeeper')
  expect(screen.getByRole('combobox', { name: 'Role for boss' })).toHaveValue('organizer')
  // Your own role is shown, but you can't change it.
  expect(screen.queryByRole('combobox', { name: 'Role for root' })).not.toBeInTheDocument()
  expect(within(screen.getByText('root').closest('li')).getByText('admin')).toBeInTheDocument()
})
