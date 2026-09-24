import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { deletePool, getPool, listTeams } from './api'
import { useAuth } from './auth'
import ConfirmModal from './ConfirmModal'
import { isNotFound } from './failure'
import Loading from './Loading'
import NotFound from './NotFound'
import { useNotify } from './NotificationContext'
import { useNotifyFailure } from './useNotifyFailure'
import PoolSchedule from './PoolSchedule'
import PoolStandings from './PoolStandings'

function courtsLabel(courts) {
  if (courts.length === 0) return 'No court (add courts in the tournament settings)'
  return `${courts.length === 1 ? 'Court' : 'Courts'} ${courts.join(', ')}`
}

// Standings only change when a match is scored, which bumps its version.
function matchesSignature(matches) {
  return matches.map((match) => `${match.id}:${match.version}`).join(',')
}

export default function PoolPage() {
  const { poolId } = useParams()
  const [pool, setPool] = useState(null)
  const [teams, setTeams] = useState([])
  const [notFound, setNotFound] = useState(false)
  const [matchesKey, setMatchesKey] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const navigate = useNavigate()
  const notify = useNotify()
  const notifyFailure = useNotifyFailure()
  const { user } = useAuth()

  useEffect(() => {
    getPool(poolId)
      .then((loaded) => {
        setPool(loaded)
        return listTeams(loaded.tournament_id).then(setTeams)
      })
      .catch((error) =>
        isNotFound(error) ? setNotFound(true) : notifyFailure(error, "Couldn't load the pool"),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId])

  async function handleDelete() {
    setConfirmingDelete(false)
    try {
      await deletePool(pool.id)
      notify(`${pool.name} deleted`)
      navigate(`/tournaments/${pool.tournament_id}`)
    } catch (error) {
      const body = await error?.json?.().catch(() => null)
      notify(body?.detail ?? 'Failed to delete pool', { type: 'error' })
    }
  }

  if (notFound) return <NotFound thing="Pool" />
  if (!pool) return <Loading label="Loading pool" rows={5} />

  return (
    <>
      <Link to={`/tournaments/${pool.tournament_id}`}>Back to tournament</Link>
      <h2>{pool.name}</h2>
      <p>{courtsLabel(pool.courts)}</p>

      <section>
        <h3>Standings</h3>
        {matchesKey !== null && <PoolStandings poolId={pool.id} refreshKey={matchesKey} />}
      </section>

      <section>
        <h3>Schedule</h3>
        <PoolSchedule
          pool={pool}
          teams={teams}
          onMatchesChange={(matches) => setMatchesKey(matchesSignature(matches))}
        />
      </section>

      {user && (
        <section>
          <button type="button" onClick={() => setConfirmingDelete(true)}>
            Delete pool
          </button>
        </section>
      )}

      <ConfirmModal
        open={confirmingDelete}
        title="Delete pool"
        message={`Delete "${pool.name}"? Its teams become unassigned and its unplayed schedule is removed. A pool with scored matches can't be deleted.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  )
}
