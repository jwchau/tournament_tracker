import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { autoAssignPools, createPool, listPools, updateTeam } from './api'
import { useAuth } from './auth'
import Loading from './Loading'
import { useNotifyFailure } from './useNotifyFailure'

function courtsLabel(courts) {
  if (courts.length === 0) return 'No court yet (add courts in the settings)'
  return `${courts.length === 1 ? 'Court' : 'Courts'} ${courts.join(', ')}`
}

// Each pool as a card on the board, with `renderPool` filling it (the
// tournament page puts the standings there). Signed in, the pool tools
// fold away under "Edit pools" so they don't crowd the board.
export default function PoolsPanel({
  tournamentId,
  teams,
  onTeamsChanged,
  onPoolsChanged,
  renderPool,
}) {
  // null until the first load, so "no pools yet" never shows while loading.
  const [pools, setPoolsState] = useState(null)
  const [newPoolName, setNewPoolName] = useState('')
  const notifyFailure = useNotifyFailure()
  const { user } = useAuth()

  function setPools(next) {
    setPoolsState(next)
    onPoolsChanged?.(next)
  }

  useEffect(() => {
    listPools(tournamentId)
      .then((loaded) => {
        setPoolsState(loaded)
        onPoolsChanged?.(loaded)
      })
      .catch((error) => {
        setPoolsState([])
        notifyFailure(error, "Couldn't load the pools")
      })
    // Only reload when the tournament changes, not when the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  async function handleAddPool(event) {
    event.preventDefault()
    await createPool(tournamentId, { name: newPoolName })
    setNewPoolName('')
    setPools(await listPools(tournamentId))
  }

  // Auto-assign also picks how many pools there should be, creating or
  // removing pools, so the pool list is reloaded too.
  async function handleAutoAssign() {
    onTeamsChanged?.(await autoAssignPools(tournamentId))
    setPools(await listPools(tournamentId))
  }

  async function handleMoveTeam(team, value) {
    const updated = await updateTeam(team.id, { poolId: value === '' ? null : Number(value) })
    onTeamsChanged?.(teams.map((t) => (t.id === team.id ? { ...t, ...updated } : t)))
  }

  if (pools === null) return <Loading label="Loading pools" rows={4} />

  return (
    <>
      {pools.length === 0 ? (
        <p className="setup-note">
          {user
            ? 'No pools yet. Open Edit pools to auto-assign the teams or add pools by hand.'
            : 'The pools haven’t been drawn yet.'}
        </p>
      ) : (
        <ul className="pool-grid">
          {pools.map((pool) => (
            <li key={pool.id} className="pool-card">
              <div className="pool-card-head">
                <h4>{pool.name}</h4>
                <Link to={`/pools/${pool.id}`}>Open {pool.name}</Link>
              </div>
              <p className="pool-courts">{courtsLabel(pool.courts)}</p>
              {renderPool?.(pool)}
            </li>
          ))}
        </ul>
      )}

      {user && (
        <details className="disclosure">
          <summary>Edit pools</summary>
          <div className="disclosure-body">
            <button type="button" className="btn-primary" onClick={handleAutoAssign}>
              Auto-assign teams (snake seeding)
            </button>
            <form onSubmit={handleAddPool}>
              <label htmlFor="new-pool-name">New pool name</label>
              <input
                id="new-pool-name"
                required
                value={newPoolName}
                onChange={(event) => setNewPoolName(event.target.value)}
              />
              <button type="submit">Add pool</button>
            </form>
            {pools.length > 0 && (
              <ul className="assign-list">
                {teams.map((team) => (
                  <li key={team.id}>
                    <label htmlFor={`pool-for-${team.id}`}>Pool for {team.name}</label>
                    <select
                      id={`pool-for-${team.id}`}
                      value={team.pool_id ?? ''}
                      onChange={(event) => handleMoveTeam(team, event.target.value)}
                    >
                      <option value="">No pool</option>
                      {pools.map((pool) => (
                        <option key={pool.id} value={pool.id}>
                          {pool.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </>
  )
}
