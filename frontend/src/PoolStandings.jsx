import { useRef, useState } from 'react'

import { getPoolStandings } from './api'
import Loading from './Loading'
import { usePolling } from './usePolling'
import { useRowLimit } from './useRowLimit'

function signed(value) {
  return value > 0 ? `+${value}` : String(value)
}

// Without `refreshKey` the standings poll on their own. With one, they only
// reload when it changes, e.g. when the pool's matches do.
// `advancing` is how many places go through to the playoffs; those rows are marked.
// Past eight teams the table scrolls under its pinned header.
export default function PoolStandings({ poolId, refreshKey, advancing = 0 }) {
  // null until the first load; later reloads keep the current table on screen.
  const [rows, setRows] = useState(null)
  const scrollRef = useRef(null)
  const limit = useRowLimit(scrollRef, 'tbody tr', 8, rows?.length)

  const { refresh, canRefresh } = usePolling(
    () => getPoolStandings(poolId),
    setRows,
    refreshKey === undefined ? poolId : `${poolId}:${refreshKey}`,
    { auto: refreshKey === undefined },
  )

  const refreshButton = (
    <button type="button" className="standings-refresh" onClick={refresh} disabled={!canRefresh}>
      Refresh standings
    </button>
  )

  return (
    <>
      {rows === null ? (
        <Loading label="Loading standings" rows={4} />
      ) : (
        <div
          ref={scrollRef}
          className="standings-scroll"
          style={limit.style}
          data-more={limit.more ? '' : undefined}
          tabIndex={limit.limited ? 0 : undefined}
          role={limit.limited ? 'region' : undefined}
          aria-label={limit.limited ? 'Standings, scroll for more' : undefined}
        >
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
              <tr key={row.team_id} className={row.rank <= advancing ? 'advancing' : undefined}>
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
        </div>
      )}
      <div className="standings-foot">
        {rows !== null && advancing > 0 && (
          <p className="advance-note">Top {advancing} advance to the playoffs</p>
        )}
        {refreshButton}
      </div>
    </>
  )
}
