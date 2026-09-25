// The line under a scoreboard saying whether its running score is saved.
export default function SaveStatus({ state, onRetry, onRefetch }) {
  return (
    <p className="save-status" role="status" aria-label="Save status" data-state={state}>
      {state === 'saved' && 'Saved'}
      {(state === 'dirty' || state === 'saving') && 'Saving…'}
      {state === 'error' && (
        <>
          Couldn’t save the score. Check your connection.{' '}
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </>
      )}
      {state === 'conflict' && (
        <>
          Someone else updated this match.{' '}
          <button type="button" onClick={onRefetch}>
            Refetch latest
          </button>
        </>
      )}
    </p>
  )
}
