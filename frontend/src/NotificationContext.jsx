import { createContext, useContext, useEffect, useRef, useState } from 'react'

import { failureMessage, isRequestFailure } from './failure'

const NotificationContext = createContext(() => {})

const DISMISS_AFTER_MS = 5000

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const nextId = useRef(0)
  const timeoutIds = useRef([])

  useEffect(() => {
    const ids = timeoutIds.current
    return () => {
      ids.forEach(clearTimeout)
    }
  }, [])

  // A request that failed with nothing to catch it would otherwise fail
  // silently. A 401 is left out: the sign-in redirect already says so.
  useEffect(() => {
    async function handleUnhandled(event) {
      const { reason } = event
      if (!isRequestFailure(reason) || reason.status === 401) return
      notify(await failureMessage(reason, 'Something went wrong. Please try again.'), {
        type: 'error',
      })
    }
    window.addEventListener('unhandledrejection', handleUnhandled)
    return () => window.removeEventListener('unhandledrejection', handleUnhandled)
  })

  function notify(message, { type = 'info' } = {}) {
    const id = nextId.current++
    setNotifications((current) => [{ id, message, type }, ...current])
    const timeoutId = setTimeout(() => {
      setNotifications((current) => current.filter((notification) => notification.id !== id))
    }, DISMISS_AFTER_MS)
    timeoutIds.current.push(timeoutId)
  }

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <div className="notification-stack">
        {notifications.map((notification, index) => (
          <div
            key={notification.id}
            role={notification.type === 'error' ? 'alert' : 'status'}
            className={`notification notification-${notification.type}`}
            style={{ '--stack-index': index, zIndex: notifications.length - index }}
          >
            {notification.message}
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotify() {
  return useContext(NotificationContext)
}
