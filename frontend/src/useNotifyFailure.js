import { failureMessage } from './failure'
import { useNotify } from './NotificationContext'

// For a `.catch`: shows why the request failed, or `fallback` if it can't tell.
export function useNotifyFailure() {
  const notify = useNotify()
  return async (error, fallback) => {
    notify(await failureMessage(error, fallback), { type: 'error' })
  }
}
