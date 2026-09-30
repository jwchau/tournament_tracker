import { fireEvent, render, screen } from './testUtils'
import { expect, test, vi } from 'vitest'

import FlipBoard from './FlipBoard'

function board(props) {
  const onChange = vi.fn()
  render(
    <FlipBoard
      idPrefix="b"
      team1Name="Aces"
      team2Name="Kings"
      scores={{ team1: 20, team2: 21 }}
      onChange={onChange}
      {...props}
    />,
  )
  return onChange
}

test('a team at the point cap cannot be given another point', () => {
  board({ maxScore: 21 })

  expect(screen.getByRole('button', { name: 'Point to Kings' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Point to Aces' })).toBeEnabled()
})

test('a typed score above the cap is held at the cap', () => {
  const onChange = board({ maxScore: 21 })

  fireEvent.change(screen.getByLabelText('Aces score'), { target: { value: '30' } })

  expect(onChange).toHaveBeenCalledWith({ team1: 21, team2: 21 })
})

test('with no cap a score can go as high as it likes', () => {
  const onChange = board({})

  fireEvent.click(screen.getByRole('button', { name: 'Point to Kings' }))

  expect(onChange).toHaveBeenCalledWith({ team1: 20, team2: 22 })
})
