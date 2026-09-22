import { useState } from 'react'

import { getPoolStandings } from './api'
import { usePolling } from './usePolling'

function signed(value) {
  return value > 0 ? `+${value}` : String(value)
}

export default function PoolStandings({ poolId }) {
  const [rows, setRows] = useState([])

  usePolling(() => getPoolStandings(poolId), setRows, poolId)

  return (
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
  )
}
