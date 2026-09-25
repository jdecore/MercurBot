import { Component, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useLocale } from '../lib/locale'

type Props = { children: ReactNode }

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { t } = useLocale()
  return (
    <div className="empty" role="alert" style={{ margin: 24 }}>
      <h3 style={{ margin: 0 }}><Icon name="alert" size={18} /> {t.ebTitle}</h3>
      <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: '8px 0 12px' }}>
        {error?.message ?? t.ebMsg}. {t.ebHint}
      </p>
      <button className="btn btn-secondary" onClick={onRetry} type="button">{t.ebRetry}</button>
    </div>
  )
}

type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) console.error('[MercurBot] ErrorBoundary', error)
  }
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ hasError: false, error: null })} />
    }
    return this.props.children
  }
}
