import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { deletePool, getPool, getTournament, listTeams } from './api'
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

/**
 * A pool as its round-robin sheet: standings, then the results grid, then
 * the schedule slot by slot.
 */
export default function PoolPage() {
  const { poolId } = useParams()
  const [pool, setPool] = useState(null)
  const [teams, setTeams] = useState([])
  const [advancing, setAdvancing] = useState(0)
  const [matchesKey, setMatchesKey] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const navigate = useNavigate()
  const notify = useNotify()
  const { user } = useAuth()

  const status = useLoad(
    async () => {
      const loaded = await getPool(poolId)
      const [loadedTeams, tournament] = await Promise.all([
        listTeams(loaded.tournament_id),
        // Only for marking the places that advance; the pool shows without it.
        getTournament(loaded.tournament_id).catch(() => null),
      ])
      return [loaded, loadedTeams, tournament]
    },
    poolId,
    {
      onData: ([loaded, loadedTeams, tournament]) => {
        setPool(loaded)
        setTeams(loadedTeams)
        setAdvancing(tournament?.advance_per_pool ?? 0)
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
    <div className="pool-page">
      <header className="court-strip">
        <div className="court-strip-title">
          <h2>{pool.name}</h2>
          <p className="court-strip-label">{courtsLabel(pool.courts)}</p>
        </div>
        <Link to={`/tournaments/${pool.tournament_id}`} className="court-strip-link">
          Back to tournament
        </Link>
      </header>

      <div className="pool-sheet">
        <section aria-labelledby="standings-heading" className="board-section pool-standings">
          <h3 id="standings-heading">Standings</h3>
          {matchesKey === null ? (
            // Standings follow the schedule, so they start loading once it has.
            <Loading label="Loading standings" rows={4} />
          ) : (
            <PoolStandings poolId={pool.id} refreshKey={matchesKey} advancing={advancing} />
          )}
        </section>

        <PoolSchedule
          pool={pool}
          teams={teams}
          onMatchesChange={(matches) => setMatchesKey(matchesSignature(matches))}
        />
      </div>

      {user && (
        <section className="danger-zone pool-manage">
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
    </div>
  )
}
