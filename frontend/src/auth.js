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

// The sign-in page, coming back to `path` afterwards.
export function loginPath(path) {
  return `/login?next=${encodeURIComponent(path)}`
}

// Only a path on this site, so a crafted link can't send someone elsewhere
// after they sign in.
export function safeNextPath(next) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/'
}
