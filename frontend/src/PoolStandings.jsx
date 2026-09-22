import { useState } from 'react'

import { getPoolStandings } from './api'
import { usePolling } from './usePolling'

function signed(value) {
  return value > 0 ? `+${value}` : String(value)
}

// Without `refreshKey` the standings poll on their own. With one, they only
// reload when it changes, e.g. when the pool's matches do.
export default function PoolStandings({ poolId, refreshKey }) {
  const [rows, setRows] = useState([])

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
    </>
  )
}
