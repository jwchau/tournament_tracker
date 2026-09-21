import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const NavigationHistoryContext = createContext(null)

export function NavigationHistoryProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [history, setHistory] = useState(() => ({ stack: [location.pathname], index: 0 }))
  const skipNextRecord = useRef(false)

  useEffect(() => {
    if (skipNextRecord.current) {
      skipNextRecord.current = false
      return
    }
    setHistory((current) => {
      if (current.stack[current.index] === location.pathname) {
        return current
      }
      const truncated = current.stack.slice(0, current.index + 1)
      return { stack: [...truncated, location.pathname], index: truncated.length }
    })
  }, [location.pathname])

  function goBack() {
    if (history.index === 0) return
    skipNextRecord.current = true
    navigate(history.stack[history.index - 1])
    setHistory({ ...history, index: history.index - 1 })
  }

  function goForward() {
    if (history.index === history.stack.length - 1) return
    skipNextRecord.current = true
    navigate(history.stack[history.index + 1])
    setHistory({ ...history, index: history.index + 1 })
  }

  return (
    <NavigationHistoryContext.Provider
      value={{
        canGoBack: history.index > 0,
        canGoForward: history.index < history.stack.length - 1,
        goBack,
        goForward,
      }}
    >
      {children}
    </NavigationHistoryContext.Provider>
  )
}

export function useNavigationHistory() {
  return useContext(NavigationHistoryContext)
}
