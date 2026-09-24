// Stands in for content that's still loading, shaped like a list of `rows`,
// so a page never shows up empty and then suddenly fills in.
export default function Loading({ label, rows = 3 }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="loading">
      <span className="loading-bar loading-heading" />
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="loading-bar" />
      ))}
    </div>
  )
}
