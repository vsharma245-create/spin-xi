/**
 * Two real clients, one live room, against the production database.
 *
 * Everything else about the live draft is checked offline: the engine probes
 * play whole rooms in memory, and db:check runs the SQL against a local
 * Postgres. Neither can prove the one thing the design actually rests on —
 * that when two clients write the same pick at the same moment, the database
 * picks a winner and tells the loser. That is a race, and a race needs two
 * genuinely separate clients, two sessions, and the real server between them.
 *
 * So: two anonymous accounts, a room joined by code, picks raced head to head,
 * a seat handed to the bot, a clock allowed to run out in wall-clock time, and
 * a host calling the whole thing off.
 *
 *   npx tsx scripts/two-client-probe.ts   (see npm run live:prod)
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { hydrate } from '../src/data/squads'
import { feasibility } from '../src/game/draft'
import { botPick, drawOrder, seatSlots, snakeSeat, squadForPick, totalPicks } from '../src/game/live'
import type { DraftConfig } from '../src/game/types'

const env = Object.fromEntries(
  (await readFile('.env.local', 'utf8'))
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_KEY
if (!URL || !KEY) throw new Error('No Supabase URL or key in .env.local')

let bad = 0
const check = (ok: boolean, what: string, detail = '') => {
  if (!ok) bad++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`)
  return ok
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** One client: its own account, its own token, nothing shared with the other. */
class Client {
  token = ''
  id = ''
  handle = ''
  constructor(readonly name: string) {}

  async signUp() {
    const res = await fetch(`${URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.msg ?? `${res.status} signing up ${this.name}`)
    this.token = json.access_token
    this.id = json.user.id
    /*
     * Production keys draft_rooms.host to profiles, so an account with no
     * profile cannot open a room — the app makes one on first sign-in. The
     * handles are marked so these three are easy to find and remove later.
     */
    this.handle = `ZZProbe ${this.name} ${Math.floor(Math.random() * 9000 + 1000)}`
    await this.rest('profiles', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: this.id, handle: this.handle }),
    })
    return this
  }

  async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`${res.status} — ${body.slice(0, 200)}`)
    return (body ? JSON.parse(body) : undefined) as T
  }
}

/* ── Archive, so the clients can work out real picks ──────────────────── */
const db = new PGlite()
await db.exec(await readFile('supabase/schema.sql', 'utf8'))
await db.exec(await readFile('supabase/archive.sql', 'utf8'))
hydrate((await db.query('select * from roster_feed')).rows as never[])

console.log('\n  Two clients, one room, against production.\n')

const [alice, bob, stranger] = await Promise.all([
  new Client('alice').signUp(),
  new Client('bob').signUp(),
  new Client('stranger').signUp(),
])
check(alice.id !== bob.id && bob.id !== stranger.id, 'three separate accounts signed up',
  `${alice.id.slice(0, 8)} / ${bob.id.slice(0, 8)} / ${stranger.id.slice(0, 8)}`)

/* ── Alice opens a room ───────────────────────────────────────────────── */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const makeCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(5))).map((n) => ALPHABET[n % ALPHABET.length]).join('')

const SEATS = 2
const [room] = await alice.rest<any[]>('draft_rooms', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({
    code: makeCode(), host: alice.id, seed: Math.floor(Math.random() * 2 ** 31),
    format: 'T20L', preset_id: 'BALANCED', rating_mode: 'SEASON', difficulty: 'NORMAL',
    from_year: null, to_year: null, world_teams: true, seats: SEATS, pick_seconds: 90,
  }),
})
await alice.rest('draft_seats', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify(Array.from({ length: SEATS }, (_, seat) => ({ room_id: room.id, seat }))),
})
const aliceSeat = await alice.rest<number>('rpc/draft_sit', {
  method: 'POST', body: JSON.stringify({ join_code: room.code }),
})
check(room.status === 'lobby' && aliceSeat === 0, `alice opened room ${room.code} and took seat 0`)

/* ── Bob finds it by code alone ───────────────────────────────────────── */
const [preview] = await bob.rest<any[]>('rpc/draft_preview', {
  method: 'POST', body: JSON.stringify({ join_code: room.code }),
})
check(!!preview && preview.code === room.code && preview.taken === 1,
  'bob previewed the room with nothing but the code', `${preview?.taken}/${preview?.seats} seats taken`)
const bobSeat = await bob.rest<number>('rpc/draft_sit', {
  method: 'POST', body: JSON.stringify({ join_code: room.code }),
})
check(bobSeat === 1, 'bob took the free seat', `seat ${bobSeat}`)

const [badCode] = await bob.rest<any[]>('rpc/draft_preview', {
  method: 'POST', body: JSON.stringify({ join_code: 'zzzzz' }),
})
check(!badCode, 'a code that is nobody\'s room finds nothing')

/* ── Alice starts it ──────────────────────────────────────────────────── */
await alice.rest('rpc/draft_begin', { method: 'POST', body: JSON.stringify({ room: room.id }) })
const [running] = await alice.rest<any[]>(`draft_rooms?select=*&id=eq.${room.id}`)
check(running.status === 'drafting' && !!running.started_at, 'the draft is running')

const config: DraftConfig = {
  format: room.format, scope: 'ALL', teamKey: null,
  years: room.from_year && room.to_year ? [room.from_year, room.to_year] : null,
  presetId: room.preset_id, ratingMode: room.rating_mode, hideRatings: false,
  difficulty: room.difficulty, liveToss: false, worldTeams: room.world_teams,
  overseasCap: !room.world_teams, teamName: 'YOUR XI',
} as DraftConfig
const order = drawOrder(config, running.seed)

const readPicks = (c: Client) =>
  c.rest<any[]>(`draft_picks?select=*&room_id=eq.${room.id}&order=pick_no`)

/** What this client believes the next pick should be. Both compute it alike. */
const nextPick = async (c: Client, round: number) => {
  const picks = (await readPicks(c)).filter((p) => p.round === round)
  const pickNo = picks.length
  const seat = snakeSeat(pickNo, SEATS)
  const xis = seatSlots(config, order, picks, SEATS)
  const taken = new Set(picks.map((p) => p.player_id))
  const feas = feasibility(order, xis[seat], taken)
  const squad = squadForPick(order, pickNo, xis[seat], config, feas)
  const choice = squad && botPick(squad, xis[seat], taken, config, feas)
  return squad && choice
    ? { room_id: room.id, round, pick_no: pickNo, seat, squad_id: squad.id,
        player_id: choice.player.playerId, slot: choice.slot }
    : null
}

const write = async (c: Client, pick: any) => {
  try {
    await c.rest('draft_picks', {
      method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(pick),
    })
    return { ok: true, why: '' }
  } catch (err) {
    return { ok: false, why: String(err).slice(0, 120) }
  }
}

/* ── Out of turn, judged by the server ────────────────────────────────── */
{
  const pick = await nextPick(bob, 0)
  // Pick 0 is seat 0's, which is alice's. Bob writing it should be refused.
  const res = await write(bob, pick)
  check(!res.ok && /not your turn|Out of turn|not seat/i.test(res.why),
    'bob cannot pick on alice\'s turn', res.ok ? 'it was allowed' : res.why.split('—').pop()?.trim())
}

/* ── The race: both clients write the same pick at the same moment ────── */
{
  const pick = await nextPick(alice, 0)
  const [a, b] = await Promise.all([write(alice, pick), write(bob, { ...pick })])
  const winners = [a.ok, b.ok].filter(Boolean).length
  check(winners === 1, 'two clients wrote pick 0 together and exactly one landed',
    `alice ${a.ok ? 'won' : 'refused'}, bob ${b.ok ? 'won' : 'refused'}`)
  const picks = await readPicks(alice)
  check(picks.length === 1, 'the database kept one row, not two', `${picks.length} pick(s)`)
}

/* ── A stranger sees nothing ──────────────────────────────────────────── */
{
  const seen = await stranger.rest<any[]>(`draft_picks?select=*&room_id=eq.${room.id}`)
  const rooms = await stranger.rest<any[]>(`draft_rooms?select=*&id=eq.${room.id}`)
  check(seen.length === 0, 'somebody with no seat reads no picks', `${seen.length} rows`)
  check(rooms.length === 0, 'and cannot read the room either', `${rooms.length} rows`)
}

/* ── Play the round out, each client taking its own turns ─────────────── */
{
  let refusals = 0
  for (let n = 1; n < totalPicks(SEATS); n++) {
    const seat = snakeSeat(n, SEATS)
    const who = seat === 0 ? alice : bob
    const pick = await nextPick(who, 0)
    if (!pick) { check(false, `nothing pickable at pick ${n}`); break }
    const res = await write(who, pick)
    if (!res.ok) { refusals++; check(false, `pick ${n} refused`, res.why); break }
  }
  const picks = await readPicks(alice)
  check(picks.length === totalPicks(SEATS) && refusals === 0,
    `the round played out over the wire — ${picks.length} of ${totalPicks(SEATS)} picks`)
  const humans = picks.filter((p) => p.made_by === 'human').length
  check(humans === picks.length, 'every pick is recorded as a human\'s', `${humans} human`)
  const ids = picks.map((p) => p.player_id)
  check(new Set(ids).size === ids.length, 'nobody was drafted twice')

  const [after] = await alice.rest<any[]>(`draft_rooms?select=*&id=eq.${room.id}`)
  check(after.status === 'review', 'a full round opens the review', after.status)
}

/* ── Between rounds, and the window everybody gets ────────────────────── */
{
  /*
   * Saying yes does not start the round. draft_ready only marks the seat;
   * draft_advance starts it, and refuses until the window has run out — which
   * is what makes the wait fair rather than a race to click. So this is a real
   * thirty seconds of waiting, because that rule cannot be tested any faster.
   */
  const [reviewing] = await alice.rest<any[]>(`draft_rooms?select=*&id=eq.${room.id}`)
  check(!!reviewing.ready_until, 'the review opens a window to say yes in',
    reviewing.ready_until ? `until ${new Date(reviewing.ready_until).toISOString().slice(11, 19)}` : 'none')

  await alice.rest('rpc/draft_ready', { method: 'POST', body: JSON.stringify({ room: room.id }) })
  const early = await alice.rest<string>('rpc/draft_advance', {
    method: 'POST', body: JSON.stringify({ room: room.id }),
  })
  check(early === 'review', 'the round cannot be started before the window is up', String(early))

  await bob.rest('rpc/draft_ready', { method: 'POST', body: JSON.stringify({ room: room.id }) })

  const waitMs = new Date(reviewing.ready_until).getTime() - Date.now() + 1500
  console.log(`       (waiting out the ${Math.round(waitMs / 1000)}s window)`)
  await sleep(Math.max(waitMs, 0))

  const started = await alice.rest<string>('rpc/draft_advance', {
    method: 'POST', body: JSON.stringify({ room: room.id }),
  })
  const [next] = await alice.rest<any[]>(`draft_rooms?select=*&id=eq.${room.id}`)
  check(started === 'drafting' && next.round === 1, 'both said yes, so round 1 starts',
    `${started} round ${next.round}`)

  /*
   * Round 0 is finished, so there is no "next pick" left in it to compute —
   * the thing to send is a well-formed row that simply names the old round.
   * The trigger checks the round before anything else, so that alone is what
   * it should refuse.
   */
  const done = (await readPicks(alice)).find((p) => p.round === 0)!
  const res = await write(alice, {
    room_id: room.id, round: 0, pick_no: 0, seat: 0,
    squad_id: done.squad_id, player_id: done.player_id, slot: 0,
  })
  check(!res.ok && /moved on/i.test(res.why), 'a pick from the round before is refused',
    res.why.split('—').pop()?.trim())
}

/* ── A seat handed to the bot is anybody's to play ────────────────────── */
{
  await bob.rest(`draft_seats?room_id=eq.${room.id}&seat=eq.1`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_bot: true }),
  })
  // Round 1, pick 0 is seat 0 (alice). Play it, then seat 1's turn is bob's —
  // except bob has gone, so alice may play it and the row must say so.
  const mine = await nextPick(alice, 1)
  await write(alice, mine)
  const theirs = await nextPick(alice, 1)
  const res = await write(alice, theirs)
  const picks = (await readPicks(alice)).filter((p) => p.round === 1)
  const forBob = picks.find((p) => p.seat === 1)
  check(res.ok && forBob?.made_by === 'bot',
    'alice plays the seat bob left, and it is recorded as the bot\'s', forBob?.made_by)
}

/* ── A clock that actually runs out ───────────────────────────────────── */
{
  // The deadline branch is the one no offline test reaches: real now(), real
  // interval arithmetic. A second room, a one-second clock, and a wait.
  const [quick] = await alice.rest<any[]>('draft_rooms', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      code: makeCode(), host: alice.id, seed: 7, format: 'T20L', preset_id: 'BALANCED',
      rating_mode: 'SEASON', difficulty: 'NORMAL', from_year: null, to_year: null,
      // Ten is the floor the column allows; the wait below is real time.
      world_teams: true, seats: SEATS, pick_seconds: 10,
    }),
  })
  await alice.rest('draft_seats', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(Array.from({ length: SEATS }, (_, seat) => ({ room_id: quick.id, seat }))),
  })
  await alice.rest('rpc/draft_sit', { method: 'POST', body: JSON.stringify({ join_code: quick.code }) })
  await bob.rest('rpc/draft_sit', { method: 'POST', body: JSON.stringify({ join_code: quick.code }) })
  await alice.rest('rpc/draft_begin', { method: 'POST', body: JSON.stringify({ room: quick.id }) })

  const qOrder = drawOrder(config, quick.seed)
  const xis = seatSlots(config, qOrder, [], SEATS)
  const feas = feasibility(qOrder, xis[0], new Set())
  const squad = squadForPick(qOrder, 0, xis[0], config, feas)!
  const choice = botPick(squad, xis[0], new Set(), config, feas)!
  const pick = {
    room_id: quick.id, round: 0, pick_no: 0, seat: 0, squad_id: squad.id,
    player_id: choice.player.playerId, slot: choice.slot,
  }

  // Straight away, bob may not touch seat 0.
  const early = await write(bob, pick)
  await sleep(12000)
  // Past the clock, he may — and the row is the bot's, not his.
  const late = await write(bob, pick)
  const [row] = await bob.rest<any[]>(`draft_picks?select=*&room_id=eq.${quick.id}&pick_no=eq.0`)
  check(!early.ok && late.ok && row?.made_by === 'bot',
    'a seat whose clock ran out is played by whoever noticed, as the bot',
    `before: ${early.ok ? 'allowed' : 'refused'} · after 12s: ${late.ok ? 'allowed' : 'refused'} · ${row?.made_by}`)

  /* ── The host calls it off ──────────────────────────────────────────── */
  await alice.rest(`draft_rooms?id=eq.${quick.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'abandoned' }),
  })
  const xis2 = seatSlots(config, qOrder, await bob.rest<any[]>(`draft_picks?select=*&room_id=eq.${quick.id}`), SEATS)
  const feas2 = feasibility(qOrder, xis2[1], new Set())
  const squad2 = squadForPick(qOrder, 1, xis2[1], config, feas2)!
  const choice2 = botPick(squad2, xis2[1], new Set(), config, feas2)!
  const after = await write(bob, {
    room_id: quick.id, round: 0, pick_no: 1, seat: 1, squad_id: squad2.id,
    player_id: choice2.player.playerId, slot: choice2.slot,
  })
  check(!after.ok && /not running|abandoned/i.test(after.why),
    'an abandoned draft takes no more picks', after.why.split('—').pop()?.trim())

  // A guest cannot call off somebody else's room.
  const changed = await bob.rest<any[]>(`draft_rooms?id=eq.${room.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'abandoned' }),
  }).catch(() => [])
  const [stillTheirs] = await alice.rest<any[]>(`draft_rooms?select=status&id=eq.${room.id}`)
  check(changed.length === 0 && stillTheirs.status !== 'abandoned',
    'a guest cannot call off a room they do not host', `host's room is ${stillTheirs.status}`)

  console.log(`\n  left behind — rooms ${room.code}, ${quick.code}`)
  console.log(`  left behind — profiles ${[alice, bob, stranger].map((c) => c.handle).join(', ')}`)
}

console.log(bad ? `\n  ${bad} things the live draft does not do over the wire` : '\n  the live draft holds up against production')
