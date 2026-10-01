import { createContext, useContext } from 'react'

// Who is signed in. Outside an AuthProvider nobody is, so pages are read-only.
// Kept apart from AuthProvider.jsx so that file only exports a component.
export const AuthContext = createContext({
  user: null,
  loading: false,
  signIn: async () => {},
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// Each role can do what the ones below it can.
const ROLE_RANK = { scorekeeper: 0, organizer: 1, admin: 2 }

// Whether `user` has at least `role`. A spectator (no user) has none.
export function hasRole(user, role) {
  return Boolean(user) && (ROLE_RANK[user.role] ?? -1) >= ROLE_RANK[role]
}

// The sign-in page, coming back to `path` afterwards.
export function loginPath(path) {
  return `/login?next=${encodeURIComponent(path)}`
}

// Only a path on this site, so a crafted link can't send someone elsewhere
// after they sign in.
export function safeNextPath(next) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/'
}
