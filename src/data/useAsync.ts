import { useEffect, useState } from 'react'

/**
 * Load something over the network and render the three states it can be in.
 *
 * Every screen that reads from the database needs the same three branches, and
 * writing them out each time invites two of them to be forgotten. An empty
 * ladder is not an error, and an error is not an empty ladder — a player who
 * is offline should be told so rather than shown a board with nobody on it.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{
    data: T | null
    error: string | null
    loading: boolean
  }>({ data: null, error: null, loading: true })

  /*
   * The dependency list belongs to the caller: which values should retrigger a
   * load is a question about that screen, not about this hook, and only the
   * caller can answer it. Static analysis cannot see through that, which is
   * the trade for having one place that handles loading, empty and failed.
   */
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    load().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (err: Error) => live && setState({ data: null, error: err.message, loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
