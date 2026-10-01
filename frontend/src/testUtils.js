import { render as renderWithoutAuth } from '@testing-library/react'
import { createElement } from 'react'

import { AuthContext } from './auth'

export * from '@testing-library/react'

// An admin, so the tests that aren't about roles can use every control.
export const TEST_USER = { id: 1, username: 'organizer', role: 'admin' }

// A signed-in user with `role`, for `render(ui, { user: userWithRole('scorekeeper') })`.
export const userWithRole = (role) => ({ id: 2, username: role, role })

// What the bracket board read returns: a bracket's matches and, when a test cares, its dispatch.
export const boardOf = (matches, dispatch = null) => ({ matches, dispatch })

// Renders signed in as TEST_USER, since pages hide their write controls from
// spectators. Pass `{ user: null }` to render signed out.
export function render(ui, { user = TEST_USER, ...options } = {}) {
  const auth = { user, loading: false, signIn: async () => {}, signOut: async () => {} }
  return renderWithoutAuth(ui, {
    wrapper: ({ children }) => createElement(AuthContext.Provider, { value: auth }, children),
    ...options,
  })
}
