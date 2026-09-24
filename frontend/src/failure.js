// fetch rejects with a TypeError when the server can't be reached at all.
export function isNetworkFailure(error) {
  return error instanceof TypeError
}

// A request the server answered with an error, as api.js rejects it.
export function isRequestFailure(error) {
  return typeof error?.status === 'number' || isNetworkFailure(error)
}

// A missing id (404), or one that isn't an id at all (422).
export function isNotFound(error) {
  return error?.status === 404 || error?.status === 422
}

// What went wrong, in words for a notification: the server's reason if it
// gave one, else `fallback`.
export async function failureMessage(error, fallback) {
  if (isNetworkFailure(error)) {
    return "Couldn't reach the server. Check your connection and try again."
  }
  const body = await error?.json?.().catch(() => null)
  return typeof body?.detail === 'string' ? body.detail : fallback
}
