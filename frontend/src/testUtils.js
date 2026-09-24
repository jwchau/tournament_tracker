import { render as renderWithoutAuth } from '@testing-library/react'
import { createElement } from 'react'

import { AuthContext } from './auth'

export * from '@testing-library/react'

export const TEST_USER = { id: 1, username: 'organizer' }

// Renders signed in as TEST_USER, since pages hide their write controls from
// spectators. Pass `{ user: null }` to render signed out.
export function render(ui, { user = TEST_USER, ...options } = {}) {
  const auth = { user, loading: false, signIn: async () => {}, signOut: async () => {} }
  return renderWithoutAuth(ui, {
    wrapper: ({ children }) => createElement(AuthContext.Provider, { value: auth }, children),
    ...options,
  })
}
