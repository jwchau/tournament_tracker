import { useState } from 'react'

import { getPoolStandings } from './api'
import Loading from './Loading'
import { usePolling } from './usePolling'

function signed(value) {
  return value > 0 ? `+${value}` : String(value)
}

// Without `refreshKey` the standings poll on their own. With one, they only
// reload when it changes, e.g. when the pool's matches do.
export default function PoolStandings({ poolId, refreshKey }) {
  // null until the first load; later reloads keep the current table on screen.
  const [rows, setRows] = useState(null)

  const { refresh, canRefresh } = usePolling(
    () => getPoolStandings(poolId),
    setRows,
    refreshKey === undefined ? poolId : `${poolId}:${refreshKey}`,
    { auto: refreshKey === undefined },
  )

  return (
    <>
      <button type="button" onClick={refresh} disabled={!canRefresh}>
        Refresh standings
      </button>
      {rows === null ? (
        <Loading label="Loading standings" rows={4} />
      ) : (
        <table aria-label="Standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>L</th>
              <th>Pts</th>
              <th>Diff</th>
              <th>PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team_id}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.points}</td>
                <td>{signed(row.point_diff)}</td>
                <td>{row.points_for}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
