import { Component, type ReactNode } from 'react'
import { Icon } from './Icon'

type Props = { children: ReactNode }
type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) console.error('[Copixi] ErrorBoundary', error)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="empty" role="alert" style={{ margin: 24 }}>
          <h3 style={{ margin: 0 }}><Icon name="alert" size={18} /> Algo salió mal</h3>
          <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: '8px 0 12px' }}>
            {this.state.error?.message ?? 'Error desconocido'}. Recarga la página o vuelve a subir el PDF.
          </p>
          <button className="btn btn-secondary" onClick={() => this.setState({ hasError: false, error: null })} type="button">Reintentar</button>
        </div>
      )
    }
    return this.props.children
  }
}
