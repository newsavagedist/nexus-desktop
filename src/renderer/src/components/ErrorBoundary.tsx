import { Component, type ReactNode } from "react"

interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full mx-6 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-lg font-semibold text-foreground mb-2">Algo correu mal</h1>
          <p className="text-sm text-muted-foreground mb-1 font-mono bg-muted/40 rounded-xl px-4 py-2 text-left break-all">
            {this.state.error?.message || "Erro desconhecido"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-3 mb-6">
            Os teus dados estão seguros — estão guardados localmente e não foram perdidos.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            Recarregar a app
          </button>
        </div>
      </div>
    )
  }
}
