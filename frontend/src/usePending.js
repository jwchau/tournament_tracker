import { useRef, useState } from 'react'

/**
 * Wraps an async `action` so it runs at most once at a time: calls made while
 * it's pending are ignored, so a double tap can't send a request twice.
 * Returns `[run, pending]`; `pending` is for disabling the button meanwhile.
 */
export function usePending(action) {
  // A ref, not just state: two taps can land before the re-render that
  // disables the button.
  const running = useRef(false)
  const [pending, setPending] = useState(false)

  async function run(...args) {
    if (running.current) return undefined
    running.current = true
    setPending(true)
    try {
      return await action(...args)
    } finally {
      running.current = false
      setPending(false)
    }
  }

  return [run, pending]
}
