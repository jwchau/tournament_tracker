import { act, renderHook, waitFor } from './testUtils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import * as api from './api'
import { useBracketMatches } from './useBracketMatches'

let fetchMock

const board = {
  matches: [{ id: 1, status: 'ready', court: 1, version: 1 }],
  dispatch: { courts: [{ court: 1, match_id: 1 }], queue: [2, 3], overflow: false },
}

beforeEach(() => {
  api.clearApiCache()
  fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(board) }),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const requestedPaths = () => fetchMock.mock.calls.map(([path]) => path)

test('a bracket is read with one request for its matches and its dispatch', async () => {
  const { result } = renderHook(() => useBracketMatches(5))

  await waitFor(() => expect(result.current.loaded).toBe(true))

  expect(result.current.matches).toEqual(board.matches)
  expect(result.current.dispatch).toEqual(board.dispatch)
  expect(requestedPaths()).toHaveLength(1)
  expect(requestedPaths()[0]).toMatch(/\/playoff-brackets\/5\/board$/)
})

test('holding a match reloads the bracket with one request, not two', async () => {
  vi.spyOn(api, 'holdMatch').mockResolvedValue({ ...board.matches[0], on_hold: true, version: 2 })
  const { result } = renderHook(() => useBracketMatches(5))
  await waitFor(() => expect(result.current.loaded).toBe(true))
  fetchMock.mockClear()

  await act(() => result.current.hold(board.matches[0], true))

  await waitFor(() => expect(requestedPaths()).toHaveLength(1))
  expect(requestedPaths()[0]).toMatch(/\/playoff-brackets\/5\/board$/)
})

test('a board without a dispatch still shows the matches', async () => {
  fetchMock.mockImplementation(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ matches: board.matches }) }),
  )

  const { result } = renderHook(() => useBracketMatches(5))

  await waitFor(() => expect(result.current.loaded).toBe(true))
  expect(result.current.matches).toEqual(board.matches)
  expect(result.current.dispatch).toBeNull()
})
