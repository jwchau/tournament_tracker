import { useLayoutEffect, useState } from 'react'

// How much of the next item shows under the last full one, so a cut-off list
// reads as scrollable rather than finished.
const PEEK = 16

/**
 * Caps a scrolling box at its first `limit` items (matched by `selector`),
 * measured as rendered, so the cut falls exactly under the last whole item at
 * any width. Returns the box's style and whether more is waiting below (which
 * turns on a fade at the bottom until the reader scrolls to the end). With
 * `limit` items or fewer there is no cap. `watch` is anything that changes
 * when the items do (their count, say), so a box filled after mount is measured.
 */
export function useRowLimit(ref, selector, limit, watch) {
  const [maxHeight, setMaxHeight] = useState(null)
  const [more, setMore] = useState(false)

  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return undefined

    function measure() {
      const items = box.querySelectorAll(selector)
      if (items.length <= limit) {
        setMaxHeight(null)
        setMore(false)
        return
      }
      const boxTop = box.getBoundingClientRect().top - box.scrollTop
      const lastBottom = items[limit - 1].getBoundingClientRect().bottom - boxTop
      setMaxHeight(Math.ceil(lastBottom + PEEK))
      setMore(box.scrollTop + box.clientHeight < box.scrollHeight - 1)
    }

    function onScroll() {
      setMore(box.scrollTop + box.clientHeight < box.scrollHeight - 1)
    }

    measure()
    box.addEventListener('scroll', onScroll, { passive: true })
    if (typeof ResizeObserver === 'undefined') {
      return () => box.removeEventListener('scroll', onScroll)
    }
    // Rows arriving, fonts loading or the width changing all move the cut.
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    if (box.firstElementChild) observer.observe(box.firstElementChild)
    return () => {
      observer.disconnect()
      box.removeEventListener('scroll', onScroll)
    }
  }, [ref, selector, limit, watch])

  const style = maxHeight == null ? undefined : { maxHeight, overflowY: 'auto' }
  return { style, limited: maxHeight != null, more }
}
