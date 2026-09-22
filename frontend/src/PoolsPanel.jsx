import { useEffect, useState } from 'react'

import { autoAssignPools, createPool, listPools, updateTeam } from './api'

function courtsLabel(courts) {
  if (courts.length === 0) return 'no court (add courts in settings)'
  return `${courts.length === 1 ? 'court' : 'courts'} ${courts.join(', ')}`
}

export default function PoolsPanel({ tournamentId, teams, onTeamsChanged, renderPool }) {
  const [pools, setPools] = useState([])
  const [newPoolName, setNewPoolName] = useState('')

  useEffect(() => {
    listPools(tournamentId)
      .then(setPools)
      .catch(() => {})
  }, [tournamentId])

  async function handleAddPool(event) {
    event.preventDefault()
    await createPool(tournamentId, { name: newPoolName })
    setNewPoolName('')
    setPools(await listPools(tournamentId))
  }

  async function handleAutoAssign() {
    onTeamsChanged?.(await autoAssignPools(tournamentId))
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
            {renderPool?.(pool)}
          </li>
        ))}
      </ul>

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
        <>
          <button type="button" onClick={handleAutoAssign}>
            Auto-assign teams (snake seeding)
          </button>
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
  )
}
