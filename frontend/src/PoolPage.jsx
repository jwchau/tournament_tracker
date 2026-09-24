import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { deletePool, getPool, listTeams } from './api'
import { useAuth } from './auth'
import ConfirmModal from './ConfirmModal'
import Loading from './Loading'
import NotFound from './NotFound'
import { useNotify } from './NotificationContext'
import PoolSchedule from './PoolSchedule'
import PoolStandings from './PoolStandings'
import { useLoad } from './useLoad'

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
  const [matchesKey, setMatchesKey] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const navigate = useNavigate()
  const notify = useNotify()
  const { user } = useAuth()

  const status = useLoad(
    async () => {
      const loaded = await getPool(poolId)
      return [loaded, await listTeams(loaded.tournament_id)]
    },
    poolId,
    {
      onData: ([loaded, loadedTeams]) => {
        setPool(loaded)
        setTeams(loadedTeams)
      },
      failureMessage: "Couldn't load the pool",
    },
  )

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

  if (status === 'not-found') return <NotFound thing="Pool" />
  if (status !== 'ready') return <Loading label="Loading pool" rows={5} />

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
