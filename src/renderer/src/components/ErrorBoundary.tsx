import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches render-time crashes so one bad document never takes down the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer crash:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="error-boundary">
        <div className="error-card">
          <div className="error-emoji">😵</div>
          <h1>Something went wrong</h1>
          <p>The reader hit an unexpected error. Your files and notes are safe on disk.</p>
          <pre className="error-detail">{error.message}</pre>
          <div className="error-actions">
            <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
              Reload
            </button>
            <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
              Try to continue
            </button>
          </div>
        </div>
      </div>
    )
  }
}
