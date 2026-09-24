import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { autoAssignPools, createPool, listPools, updateTeam } from './api'
import { useAuth } from './auth'
import { useNotifyFailure } from './useNotifyFailure'

function courtsLabel(courts) {
  if (courts.length === 0) return 'no court (add courts in settings)'
  return `${courts.length === 1 ? 'court' : 'courts'} ${courts.join(', ')}`
}

export default function PoolsPanel({
  tournamentId,
  teams,
  onTeamsChanged,
  onPoolsChanged,
  renderPool,
}) {
  const [pools, setPoolsState] = useState([])
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
      .catch((error) => notifyFailure(error, "Couldn't load the pools"))
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

  return (
    <>
      <ul>
        {pools.map((pool) => (
          <li key={pool.id}>
            <p>
              {pool.name} — {courtsLabel(pool.courts)}
            </p>
            <Link to={`/pools/${pool.id}`}>Open {pool.name}</Link>
            {renderPool?.(pool)}
          </li>
        ))}
      </ul>

      {user && (
        <>
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

          <button type="button" onClick={handleAutoAssign}>
            Auto-assign teams (snake seeding)
          </button>
          {pools.length > 0 && (
            <>
              <ul>
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
            </>
          )}
        </>
      )}
    </>
  )
}
