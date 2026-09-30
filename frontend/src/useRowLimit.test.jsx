import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { roundsInView } from './scheduleView'
import { useRowLimit } from './useRowLimit'

afterEach(() => {
  vi.restoreAllMocks()
})

const ROW = 40

// A list whose rows are ROW px tall, stacked from the top of the box.
function List({ count, limit }) {
  const ref = useRef(null)
  const { style, limited, more } = useRowLimit(ref, 'li', limit, count)
  return (
    <ul ref={ref} style={style} data-limited={limited ? '' : undefined} data-more={more ? '' : undefined}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} data-index={index}>
          Row {index + 1}
        </li>
      ))}
    </ul>
  )
}

function stubLayout(count) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function box() {
    const index = this.dataset?.index
    if (index === undefined) return { top: 0, bottom: count * ROW, left: 0, right: 300, width: 300, height: count * ROW }
    const top = Number(index) * ROW
    return { top, bottom: top + ROW, left: 0, right: 300, width: 300, height: ROW }
  })
  // The capped box is shorter than its content, so more waits below.
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(count * ROW)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(8 * ROW)
}

test('caps the box just under the last row that fits the limit, with a peek of the next', () => {
  stubLayout(12)

  const { container } = render(<List count={12} limit={8} />)

  const list = container.querySelector('ul')
  expect(list).toHaveAttribute('data-limited')
  expect(list.style.maxHeight).toBe(`${8 * ROW + 16}px`)
  expect(list.style.overflowY).toBe('auto')
  expect(list).toHaveAttribute('data-more')
})

test('leaves a box with the limit or fewer rows alone', () => {
  stubLayout(8)

  const { container } = render(<List count={8} limit={8} />)

  const list = container.querySelector('ul')
  expect(list).not.toHaveAttribute('data-limited')
  expect(list.style.maxHeight).toBe('')
})

test('the schedule shows one round on three courts, two on two, three on one', () => {
  expect(roundsInView(3)).toBe(1)
  expect(roundsInView(4)).toBe(1)
  expect(roundsInView(2)).toBe(2)
  expect(roundsInView(1)).toBe(3)
  expect(roundsInView(0)).toBe(3)
})
