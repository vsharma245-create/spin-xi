import { hydrate } from './squads'
import { ROSTER_COLUMNS } from './squads'
import type { RosterRow } from './squads'
import { hydrateChallenges } from './challenges'
import { hydratePartnerships } from '../game/chemistry'
import type { PartnershipRow } from '../game/chemistry'
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
  partnerships?: PartnershipRow[]
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

/*
 * Only the first page asks for a count. It used to be on every one of the
 * forty-three, and counting a four-table view is what tipped the database into
 * cancelling statements under load.
 */
/*
 * The materialized copy where there is one, the view where there is not.
 *
 * The client and the database are pushed by separate hands. A build that
 * reaches players before `npm run db:push` does would otherwise ask for a
 * relation that is not there yet and turn a rare fallback into a certain
 * error — decided once per load, not once per page.
 */
let source: 'roster_pages' | 'roster_feed' = 'roster_pages'

const page = (from: number) =>
  rest<RosterRow[]>(`${source}?select=${ROSTER_COLUMNS}&order=squad_id.asc,player_id.asc`, {
    Range: `${from}-${from + PAGE - 1}`,
    'Range-Unit': 'items',
    ...(from === 0 ? { Prefer: 'count=exact' } : {}),
  })

/**
 * How many of those pages may be in the air at once.
 *
 * All of them used to be. Forty-two requests fired together is forty-two
 * connections held open by one visitor, and a connection pool is a fixed and
 * fairly small thing — so two or three people falling back at the same moment
 * could exhaust it and hand everybody else an error, including the people
 * doing nothing more demanding than signing in. Four at a time still covers
 * the latency of a round trip without ever being a crowd.
 */
const LANES = 4

/** Run the jobs a few at a time, in order, and keep the results in order. */
async function inLanes<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out = new Array<T>(jobs.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(LANES, jobs.length) }, async () => {
      for (let i = next++; i < jobs.length; i = next++) out[i] = await jobs[i]()
    }),
  )
  return out
}

/**
 * PostgREST caps a response at a thousand rows, so the archive comes back in
 * pages. The first reports the total, and the rest follow a few at a time.
 *
 * The order must be unique, not merely sorted: ordering by squad alone leaves
 * rows within a squad free to shuffle between requests, and a row that moves
 * across a page boundary is silently dropped or counted twice.
 */
async function fetchAllRows(): Promise<RosterRow[]> {
  let first
  try {
    first = await page(0)
  } catch {
    source = 'roster_feed'
    first = await page(0)
  }
  const total = Number(first.range?.split('/')[1]) || first.data.length
  if (total <= PAGE) return first.data

  const rest = await inLanes(
    Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => () => page((i + 1) * PAGE)),
  )
  return [first.data, ...rest.map((r) => r.data)].flat()
}

/**
 * Who has batted with whom, and for how long.
 *
 * Under four thousand rows, so a handful of pages rather than the forty the
 * roster needs. Cached alongside everything else, because a partnership does
 * not change until the archive does.
 */
const pairPage = (from: number) =>
  rest<PartnershipRow[]>('partnerships?select=player_a,player_b,balls,runs&order=player_a.asc,player_b.asc', {
    Range: `${from}-${from + PAGE - 1}`,
    'Range-Unit': 'items',
    ...(from === 0 ? { Prefer: 'count=exact' } : {}),
  })

async function fetchPartnerships(): Promise<PartnershipRow[]> {
  try {
    const first = await pairPage(0)
    const total = Number(first.range?.split('/')[1]) || first.data.length
    if (total <= PAGE) return first.data
    const rest_ = await inLanes(
      Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => () => pairPage((i + 1) * PAGE)),
    )
    return [first.data, ...rest_.map((r) => r.data)].flat()
  } catch {
    // A database that has not been pushed yet still plays; the side simply has
    // no partnerships to show.
    return []
  }
}

/**
 * The archive as the build wrote it, served as a static file.
 *
 * Never fatal: a missing or stale snapshot only means the slower path is used.
 */
type Snapshot = { version: string; rows: RosterRow[]; partnerships: PartnershipRow[] }

async function readSnapshot(bust: boolean): Promise<Snapshot | null> {
  try {
    const res = await fetch(bust ? `/archive.json?r=${Date.now()}` : '/archive.json', {
      cache: bust ? 'reload' : 'no-cache',
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      version?: string
      rows?: RosterRow[]
      partnerships?: PartnershipRow[]
    }
    if (!body?.version || !Array.isArray(body.rows) || !body.rows.length) return null
    return { version: body.version, rows: body.rows, partnerships: body.partnerships ?? [] }
  } catch {
    return null
  }
}

/**
 * Asked twice before the database is troubled at all.
 *
 * A dropped connection on a phone, or a half-written response out of a proxy,
 * used to send that visitor straight to reading the archive out of Postgres —
 * forty-three requests fetching more bytes from a slower place than the file
 * that had just failed. Nearly every one of those failures is transient and a
 * second ask settles it, so the second ask happens first. The retry goes past
 * any cache, because a poisoned cache entry is one of the things that breaks
 * the first one.
 */
async function fetchSnapshot(): Promise<Snapshot | null> {
  return (await readSnapshot(false)) ?? (await readSnapshot(true))
}

async function fetchVersion(): Promise<string> {
  const { data } = await rest<{ version: string }[]>('dataset_meta?select=version&limit=1')
  if (!data[0]) throw new Error('No dataset version — has schema.sql been run?')
  return data[0].version
}

const fetchChallenges = async () =>
  (await rest<ChallengeRow[]>('challenges?select=*&active=is.true&order=slot')).data

/* ── Loading ───────────────────────────────────────────────────────────── */

/**
 * Which build of the archive is in memory.
 *
 * Stamped on every season recorded, because ratings are recomputed when the
 * archive is rebuilt and a run played against the old numbers is not strictly
 * comparable with one played against the new. Without the stamp that
 * difference is invisible for ever afterwards.
 */
let loadedVersion: string | null = null
export const datasetVersion = () => loadedVersion

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
    hydratePartnerships(c.partnerships ?? [])
    loadedVersion = c.version
    return { source: 'cache', ...counts(c.rows) }
  }

  /*
   * The snapshot decides.
   *
   * The archive used to be read out of Postgres on every cold start: forty-three
   * paged requests against a view joining four tables, each one ordering all
   * 42,165 rows and counting them again. Sixteen and a half seconds when it
   * worked, and a cancelled statement when the instance was busy — which is the
   * "rain delay" players were getting.
   *
   * None of that work needed doing. The archive changes when it is rebuilt and
   * not otherwise, so the build writes it out as a single file that the CDN
   * serves compressed: fourteen megabytes become about one and a half, in one
   * request, with no database involved at all.
   *
   * The build stamps the same id into the file and into the SQL, so the id is
   * also the cache key — a returning player whose copy matches downloads
   * nothing and parses nothing.
   */
  const snapshot = await fetchSnapshot()

  if (snapshot?.rows.length) {
    if (cached && cached.version === snapshot.version) return serve(cached)
    const challenges = await fetchChallenges()
    const partnerships = snapshot.partnerships
    hydrate(snapshot.rows)
    hydrateChallenges(challenges)
    hydratePartnerships(partnerships)
    loadedVersion = snapshot.version
    void writeCache({ version: snapshot.version, rows: snapshot.rows, challenges, partnerships })
    return { source: 'network', ...counts(snapshot.rows) }
  }

  /*
   * Still no snapshot, twice asked.
   *
   * Whatever is already on this device wins here, without a word to the
   * database. It cost nothing, it is almost certainly current — the file it
   * came from only changes when the archive is rebuilt — and the alternative
   * is asking Postgres to hand over the whole archive a page at a time.
   */
  if (cached?.rows.length) return serve(cached)

  /*
   * Nothing cached either, so the tables it is: the last resort, and the only
   * path here that touches the archive in Postgres at all. It reads the
   * materialized copy rather than the four-table join, which is the difference
   * between a page costing a couple of milliseconds and costing half a second.
   */
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

  const [fetchedVersion, rows, challenges, partnerships] = await Promise.all([
    version! ? Promise.resolve(version!) : fetchVersion(),
    fetchAllRows(),
    fetchChallenges(),
    fetchPartnerships(),
  ])
  version = fetchedVersion
  if (!rows.length) throw new Error('The archive is empty — has the seed been run?')

  hydrate(rows)
  hydrateChallenges(challenges)
  hydratePartnerships(partnerships)
  loadedVersion = version
  void writeCache({ version, rows, challenges, partnerships })
  return { source: 'network', ...counts(rows) }
}

const counts = (rows: RosterRow[]) => ({
  squads: new Set(rows.map((r) => r.squad_id)).size,
  players: rows.length,
})
