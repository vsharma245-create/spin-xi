/**
 * Who is playing.
 *
 * An account is created silently the first time the game is opened — no form,
 * no email, no password. A three-minute game that asks you to sign up before
 * you have seen it loses most of the people it asks, and there is nothing here
 * worth protecting with a password until somebody has played enough to care.
 * Linking an email later is a thing a player can choose once their record is
 * worth keeping.
 *
 * Spoken to over plain fetch, like the archive. The Supabase client would
 * bring four hundred kilobytes of realtime, storage and edge-function code to
 * call three endpoints, and the game already loads a megabyte of cricket.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

const SESSION_KEY = 'spinxi:session'

export interface Session {
  token: string
  refresh: string
  /** Seconds since the epoch. */
  expires: number
  userId: string
}

export interface Account {
  id: string
  handle: string
}

/* ── The session ───────────────────────────────────────────────────────── */

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* private mode — the game still plays, it just signs in again next time */
  }
}

const shape = (body: {
  access_token: string
  refresh_token: string
  expires_in: number
  user: { id: string }
}): Session => ({
  token: body.access_token,
  refresh: body.refresh_token,
  expires: Math.floor(Date.now() / 1000) + body.expires_in,
  userId: body.user.id,
})

async function auth(path: string, body: unknown) {
  const res = await fetch(`${URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json?.msg ?? json?.error_description ?? `${res.status} ${res.statusText}`)
  }
  return json
}

const signInAnonymously = async () => shape(await auth('signup', {}))

const refreshSession = async (s: Session) =>
  shape(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh }))

/**
 * A live session, renewed a minute before it lapses so a request never fails
 * on a token that expired between being read and being sent.
 *
 * Callers share one in-flight attempt. Without that, several screens mounting
 * together each find no session and each sign up — minting a handful of
 * anonymous users, of which only the last is kept. The others are orphaned,
 * and worse, a request begun under one and finished under another sends a body
 * naming the first with a token proving the second, which row level security
 * rejects as the impersonation it looks like.
 */
let pending: Promise<Session> | null = null

function liveSession(): Promise<Session> {
  pending ??= establishSession().finally(() => {
    pending = null
  })
  return pending
}

async function establishSession(): Promise<Session> {
  const now = Math.floor(Date.now() / 1000)
  const saved = readSession()

  if (saved && saved.expires > now + 60) return saved

  if (saved) {
    try {
      const renewed = await refreshSession(saved)
      writeSession(renewed)
      return renewed
    } catch {
      // The refresh token was revoked or the project was reset. Start again
      // rather than leaving the player unable to save anything.
      writeSession(null)
    }
  }

  const fresh = await signInAnonymously()
  writeSession(fresh)
  return fresh
}

/* ── Talking to the database as this player ────────────────────────────── */

export async function api<T>(
  path: string,
  init: RequestInit & { body?: string } = {},
): Promise<T> {
  const s = await liveSession()
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${s.token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

/* ── Claiming an account ───────────────────────────────────────────────── */

/**
 * Turn an auth failure into something a player can act on.
 *
 * The realistic one is signing in with a Google account already attached to
 * another record — someone who claimed on their laptop, then reaches for the
 * same button on their phone. The API calls that "identity is already linked",
 * which is true and useless: what they need to know is that their record is
 * safe and which button gets them to it.
 */
function readable(body: { msg?: string; error_code?: string }): string {
  const code = body.error_code ?? ''
  if (code.includes('identity_already_exists') || /already.*linked|already.*registered/i.test(body.msg ?? '')) {
    return 'That Google account already has a record. Use "Already have a record? Sign in" to open it.'
  }
  if (code.includes('manual_linking_disabled')) {
    return 'Account linking is switched off for this project.'
  }
  return body.msg ?? 'Google sign-in could not be started. Try again in a moment.'
}

/**
 * Attaching a Google identity to the account someone already has.
 *
 * An anonymous account lives in one browser's local storage and nowhere else.
 * Clear the browser, switch to a phone, or leave Safari alone for a week — it
 * deletes script-written storage for sites you have not visited — and a career
 * is gone with no way to recover it, because there is nothing that identifies
 * the person to recover it *to*.
 *
 * So this **links** rather than signs in fresh. The account keeps its id, and
 * therefore its seasons, its level and its place on the ladders; Google simply
 * becomes a way of proving it is yours. Signing in normally would mint a new
 * empty account and strand everything the player was trying to protect —
 * which is the worst possible outcome for a button labelled "save my progress".
 */
export async function linkGoogle(returnTo: string = window.location.pathname): Promise<void> {
  const s = await liveSession()
  const back = `${window.location.origin}${returnTo}`

  /*
   * Linking has to be authorised as the current player, which means an
   * Authorization header — and a browser cannot put headers on a navigation.
   * So the address is fetched first and navigated to second.
   *
   * `skip_http_redirect` is what makes that possible: without it the endpoint
   * answers with a 302, and a redirect a browser did not follow is opaque —
   * script cannot read its Location. With it, the same address comes back as
   * JSON we can actually use.
   */
  const res = await fetch(
    `${URL}/auth/v1/user/identities/authorize?provider=google&skip_http_redirect=true` +
      `&redirect_to=${encodeURIComponent(back)}`,
    { headers: { apikey: KEY!, Authorization: `Bearer ${s.token}` } },
  )
  const body = (await res.json().catch(() => ({}))) as {
    url?: string
    msg?: string
    error_code?: string
  }
  if (!res.ok || !body.url) throw new Error(readable(body))
  window.location.href = body.url
}

/**
 * Signing in with Google on a device that has never seen this player.
 *
 * Used when somebody comes back rather than when they first claim. There is no
 * session to protect here, so an ordinary sign-in is right: Google identifies
 * them and Supabase returns the account that identity already belongs to.
 */
export function signInWithGoogle(returnTo: string = window.location.pathname): void {
  const back = `${window.location.origin}${returnTo}`
  window.location.href =
    `${URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`
}

/**
 * Pick up the session Supabase hands back in the URL after Google.
 *
 * It arrives in the fragment — after the # — which never leaves the browser,
 * so the tokens are not written to server logs or sent as a referrer. Read it,
 * store it, and scrub the address bar so a copied link cannot carry somebody
 * else's session.
 */
export function absorbRedirect(): boolean {
  const hash = window.location.hash
  if (!hash.includes('access_token=')) {
    // Supabase reports failures as query parameters rather than a fragment.
    const failed = new URLSearchParams(window.location.search).get('error_description')
    if (failed) {
      window.history.replaceState({}, '', window.location.pathname)
      throw new Error(failed)
    }
    return false
  }

  const parts = new URLSearchParams(hash.slice(1))
  const token = parts.get('access_token')
  const refresh = parts.get('refresh_token')
  const expiresIn = Number(parts.get('expires_in') ?? 3600)
  if (!token || !refresh) return false

  // The user id is in the token's payload; no round trip needed to read it.
  let userId = ''
  try {
    userId = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub
  } catch {
    return false
  }

  writeSession({ token, refresh, expires: Math.floor(Date.now() / 1000) + expiresIn, userId })
  current = null
  window.history.replaceState({}, '', window.location.pathname + window.location.search)
  return true
}

/** Whether this account is still anonymous, and what it is signed in as. */
export async function identity(): Promise<{ anonymous: boolean; email: string | null }> {
  const s = await liveSession()
  const user = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: KEY!, Authorization: `Bearer ${s.token}` },
  }).then((r) => r.json())
  return { anonymous: Boolean(user?.is_anonymous), email: user?.email ?? null }
}

/* ── The handle ────────────────────────────────────────────────────────── */

const FIRST = [
  'Cover', 'Mid', 'Long', 'Deep', 'Third', 'Fine', 'Square', 'Silly', 'Short', 'Backward',
  'Night', 'Reverse', 'Off', 'Leg', 'Googly', 'Doosra', 'Yorker', 'Bouncer', 'Slog', 'Sweep',
]
const SECOND = [
  'Drive', 'Wicket', 'On', 'Point', 'Man', 'Leg', 'Cut', 'Slip', 'Gully', 'Swing',
  'Watchman', 'Spin', 'Break', 'Seam', 'Pull', 'Hook', 'Flick', 'Glance', 'Stump', 'Cordon',
]

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

/** A name a cricket follower would smile at, and one nobody has to think up. */
const inventHandle = () => `${pick(FIRST)}${pick(SECOND)}${10 + Math.floor(Math.random() * 90)}`

/* ── Signing in ────────────────────────────────────────────────────────── */

export const isConfigured = Boolean(URL && KEY)

let current: Promise<Account> | null = null

/**
 * Sign in and make sure there is a profile to hang results off. Called once at
 * start-up; repeated calls share the first one's promise.
 */
export function signIn(): Promise<Account> {
  current ??= establish().catch((err: Error) => {
    current = null
    throw err
  })
  return current
}

async function establish(): Promise<Account> {
  if (!isConfigured) throw new Error('No database configured.')
  const s = await liveSession()

  const existing = await api<Account[]>(`profiles?select=id,handle&id=eq.${s.userId}`)
  if (existing[0]) return existing[0]

  // A handle has to be unique, and two players can invent the same one at the
  // same moment. Rare enough to retry rather than coordinate over.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // The id written here and the token that authorises it must come from the
      // same session, or row level security sees one user claiming to be another.
      const [created] = await api<Account[]>('profiles', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ id: s.userId, handle: inventHandle() }),
      })
      if (created) return created
    } catch (err) {
      if (!/duplicate key|23505/.test(String(err))) throw err
    }
  }
  throw new Error('Could not find a free handle.')
}

/** Rename yourself. The only thing about an account a player can change. */
export async function rename(handle: string): Promise<Account> {
  const s = await liveSession()
  const [updated] = await api<Account[]>(`profiles?id=eq.${s.userId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ handle: handle.trim().slice(0, 24) }),
  })
  current = Promise.resolve(updated)
  return updated
}

/** Forget this device's account. Used by the reset in settings, and by tests. */
export function signOut() {
  writeSession(null)
  current = null
}
