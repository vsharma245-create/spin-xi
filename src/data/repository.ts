import { hydrate } from './squads'
import { ROSTER_COLUMNS } from './squads'
import type { RosterRow } from './squads'
import { hydrateChallenges } from './challenges'
import type { ChallengeRow } from './challenges'

/**
 * Where the cricket comes from.
 *
 * The archive lives in Postgres so it can be edited without a deploy, but the
 * game itself never talks to the network again after this: the whole thing is
 * pulled once, shaped into the arrays the draft engine already expects, and
 * kept in memory. A spin has to feel instant, and a spin that waits on a round
 * trip does not.
 *
 * The copy is cached against a version stamp the database bumps on every edit,
 * so a rating fixed in the Supabase dashboard reaches players on their next
 * load, and a returning player pays nothing for data that has not changed.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const isConfigured = Boolean(URL && KEY)

/**
 * Plain fetch rather than the Supabase SDK. Reading the archive is three GETs
 * against PostgREST; pulling in the full client to do that costs four hundred
 * kilobytes of auth, storage, realtime and edge-function code the game never
 * touches. Multiplayer will want the realtime client — it can load it on the
 * route that needs it.
 */
async function rest<T>(
  path: string,
  headers: Record<string, string> = {},
): Promise<{ data: T; range: string | null }> {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, ...headers },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 160)}` : ''}`)
  }
  return { data: (await res.json()) as T, range: res.headers.get('content-range') }
}

/* ── Cache ─────────────────────────────────────────────────────────────── */

const DB_NAME = 'spinxi'
const STORE = 'archive'
const CACHE_KEY = 'roster'

interface Cached {
  version: string
  rows: RosterRow[]
  challenges: ChallengeRow[]
}

/** Minimal IndexedDB access. The payload is a megabyte or so — too big for
 *  localStorage, and not worth a dependency. */
function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => resolve(null)
    open.onsuccess = () => {
      const db = open.result
      try {
        const req = run(db.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    }
  })
}

const readCache = () => idb<Cached>('readonly', (s) => s.get(CACHE_KEY))
const writeCache = (value: Cached) => idb('readwrite', (s) => s.put(value, CACHE_KEY))

/* ── Fetching ──────────────────────────────────────────────────────────── */

const PAGE = 1000

const page = (from: number) =>
  rest<RosterRow[]>(`roster_feed?select=${ROSTER_COLUMNS}&order=squad_id.asc,player_id.asc`, {
    Range: `${from}-${from + PAGE - 1}`,
    'Range-Unit': 'items',
    Prefer: 'count=exact',
  })

/**
 * PostgREST caps a response at a thousand rows. The first page also reports the
 * total, so the rest go out together rather than one after another — four
 * sequential round trips to Sydney is most of a cold start.
 *
 * The order must be unique, not merely sorted: ordering by squad alone leaves
 * rows within a squad free to shuffle between requests, and a row that moves
 * across a page boundary is silently dropped or counted twice.
 */
async function fetchAllRows(): Promise<RosterRow[]> {
  const first = await page(0)
  const total = Number(first.range?.split('/')[1]) || first.data.length
  if (total <= PAGE) return first.data

  const rest = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => page((i + 1) * PAGE)),
  )
  return [first.data, ...rest.map((r) => r.data)].flat()
}

async function fetchVersion(): Promise<string> {
  const { data } = await rest<{ version: string }[]>('dataset_meta?select=version&limit=1')
  if (!data[0]) throw new Error('No dataset version — has schema.sql been run?')
  return data[0].version
}

const fetchChallenges = async () =>
  (await rest<ChallengeRow[]>('challenges?select=*&active=is.true&order=slot')).data

/* ── Loading ───────────────────────────────────────────────────────────── */

export type LoadSource = 'network' | 'cache'

export interface LoadResult {
  source: LoadSource
  squads: number
  players: number
}

let inFlight: Promise<LoadResult> | null = null

/**
 * Fill the archive. Called once, before the game renders anything that needs
 * a squad. Repeated calls share the first one's promise.
 */
export function loadArchive(): Promise<LoadResult> {
  // A failed load must not be remembered, or the retry button would hand back
  // the same rejection for ever.
  inFlight ??= load().catch((err) => {
    inFlight = null
    throw err
  })
  return inFlight
}

async function load(): Promise<LoadResult> {
  if (!isConfigured) {
    throw new Error(
      'No database configured. Copy .env.example to .env.local and fill in your Supabase URL and key.',
    )
  }

  const cached = await readCache()

  const serve = (c: Cached): LoadResult => {
    hydrate(c.rows)
    hydrateChallenges(c.challenges)
    return { source: 'cache', ...counts(c.rows) }
  }

  // With a cache in hand, ask what version the archive is on before pulling all
  // of it: a returning player who is already current downloads a single row.
  // With no cache there is nothing to validate, so everything goes out at once.
  let version: string
  if (cached) {
    try {
      version = await fetchVersion()
      if (cached.version === version) return serve(cached)
    } catch {
      // Offline, or the database is down. A stale archive beats no archive.
      return serve(cached)
    }
  }

  const [fetchedVersion, rows, challenges] = await Promise.all([
    version! ? Promise.resolve(version!) : fetchVersion(),
    fetchAllRows(),
    fetchChallenges(),
  ])
  version = fetchedVersion
  if (!rows.length) throw new Error('The archive is empty — has the seed been run?')

  hydrate(rows)
  hydrateChallenges(challenges)
  void writeCache({ version, rows, challenges })
  return { source: 'network', ...counts(rows) }
}

const counts = (rows: RosterRow[]) => ({
  squads: new Set(rows.map((r) => r.squad_id)).size,
  players: rows.length,
})
