import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPool, listTeams } from './api'
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

  useEffect(() => {
    getPool(poolId)
      .then((loaded) => {
        setPool(loaded)
        return listTeams(loaded.tournament_id).then(setTeams)
      })
      .catch(() => setNotFound(true))
  }, [poolId])

  if (notFound) return <p>Pool not found.</p>
  if (!pool) return null

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
    </>
  )
}
