import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * The last thing between a bug and a blank screen.
 *
 * A React render error unmounts the whole tree, so without this a single bad
 * value anywhere shows a white page with no explanation and no way out — and
 * the player has no idea whether their season was saved. It was, as it happens:
 * results are written before the result screen renders.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept to the console rather than sent anywhere: there is no telemetry in
    // this game, and adding some silently would be a poor way to introduce it.
    console.error('SPIN XI crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="w-full max-w-[360px] text-center">
          <div className="display text-[22px] text-leather">STUMPS</div>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-moss">
            Something broke mid-over. Your record is safe — it lives on the server, not in this
            page.
          </p>
          <p className="mt-2 break-words text-[10.5px] leading-snug text-moss/70">
            {this.state.error.message}
          </p>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="flex-1 rounded-xl border border-white/12 bg-ink-700 px-3 py-3 text-[12px] font-extrabold uppercase tracking-[0.04em] text-cream hover:border-white/25"
            >
              Try again
            </button>
            <a
              href="/"
              className="flex-1 rounded-xl border border-pitch/45 bg-pitch/12 px-3 py-3 text-center text-[12px] font-extrabold uppercase tracking-[0.04em] text-pitch hover:bg-pitch/20"
            >
              Back to the pavilion
            </a>
          </div>
        </div>
      </div>
    )
  }
}
