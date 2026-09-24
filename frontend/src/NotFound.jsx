import { Link } from 'react-router-dom'

// For an address that matches no page, or a page whose id doesn't exist
// (deleted, or a mistyped link). `thing` names it, e.g. "Team".
export default function NotFound({ thing = 'Page' }) {
  return (
    <section>
      <h2>{thing} not found</h2>
      <p>It may have been deleted, or the link may be wrong.</p>
      <Link to="/">Back to all tournaments</Link>
    </section>
  )
}
