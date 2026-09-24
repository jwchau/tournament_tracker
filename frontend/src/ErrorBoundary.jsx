import { Component } from 'react'

// A render error anywhere would otherwise leave a blank page; this offers a
// reload instead, which refetches everything from the server.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="error-boundary">
        <h2>Something went wrong</h2>
        <p>The page hit an error. Reloading usually fixes it; scores already saved are safe.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
