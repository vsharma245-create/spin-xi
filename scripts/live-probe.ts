/**
 * Plays a whole live draft with nobody watching.
 *
 * The browser could not be trusted to do this: a backgrounded tab suspends
 * network IO, so a draft driven through one dies halfway with
 * ERR_NETWORK_IO_SUSPENDED and proves nothing. This runs the same functions
 * the four clients run — the draw, the snake order, the bot, the rebuilding
 * of each XI from the picks, and the seasons — against the real archive
 * loaded into an in-process Postgres.
 *
 * It exists because of the deadlock. A seat with two slots left was offered a
 * side that fitted neither, and since the order is fixed by the seed there
 * was no next spin: not the player, not the bot, nobody could move, and the
 * draft stopped for good. Twenty-two synthetic picks had never found it,
 * because synthetic players never run out of eligible slots.
 *
 *   npm run live:check
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { hydrate } from '../src/data/squads'
import { makeRng } from '../src/game/draft'
import { botPick, drawOrder, seatSlots, snakeSeat, squadForPick, totalPicks } from '../src/game/live'
import { playSeason } from '../src/game/sim'
import type { DraftConfig } from '../src/game/types'

const db = new PGlite()
await db.exec(await readFile('supabase/schema.sql', 'utf8'))
await db.exec(await readFile('supabase/archive.sql', 'utf8'))
hydrate((await db.query('select * from roster_feed')).rows as never[])

const SEATS = 2
const SEED = 4242
const ROUND = 0
const config: DraftConfig = {
  format: 'T20L', scope: 'ALL', teamKey: null, years: null, presetId: 'BALANCED',
  ratingMode: 'SEASON', hideRatings: false, difficulty: 'NORMAL', liveToss: false,
  worldTeams: true, overseasCap: false, teamName: 'XI',
}

const order = drawOrder(config, SEED)
const picks: { pick_no: number; seat: number; player_id: string; slot: number; squad_id: string }[] = []
let stalled = -1
for (let n = 0; n < totalPicks(SEATS); n++) {
  const seat = snakeSeat(n, SEATS)
  const xis = seatSlots(config, order, picks, SEATS)
  const squad = squadForPick(order, n, xis[seat], config)
  if (!squad) { stalled = n; break }
  const taken = new Set(picks.map((p) => p.player_id))
  const choice = botPick(squad, xis[seat], taken, config)
  if (!choice) { stalled = n; break }
  picks.push({ pick_no: n, seat, player_id: choice.player.playerId, slot: choice.slot, squad_id: squad.id })
}

console.log(`  picks made   : ${picks.length} of ${totalPicks(SEATS)}${stalled >= 0 ? ` — STALLED at ${stalled}` : ''}`)
console.log(`  snake order  : ${picks.slice(0, 8).map((p) => p.seat).join(' ')}`)
const dupes = picks.length - new Set(picks.map((p) => p.player_id)).size
console.log(`  duplicates   : ${dupes}`)

const xis = seatSlots(config, order, picks, SEATS)
xis.forEach((slots, seat) => {
  const filled = slots.filter((s) => s.player).length
  console.log(`  seat ${seat} XI    : ${filled}/11 — ${slots.slice(0, 3).map((s) => s.player?.surname).join(', ')}, …`)
})

const results = xis.map((slots, seat) =>
  // Same shape as the client: room seed, round, seat.
  playSeason(slots, null, makeRng(SEED + ROUND * 7919 + seat * 104729), config, `SEAT ${seat + 1}`),
)
results.forEach((r, seat) =>
  console.log(`  seat ${seat} season: ${r.wins}-${r.losses} · ${r.score.points} pts · ${r.outcome}`),
)
const differ = results[0].score.points !== results[1].score.points
console.log(`  seats differ : ${differ ? 'yes' : 'NO — suspicious'}`)
const ok = picks.length === totalPicks(SEATS) && dupes === 0 &&
  xis.every((s) => s.filter((x) => x.player).length === 11) && results.every((r) => r.score.points > 0)
console.log(`  VERDICT      : ${ok ? 'the whole chain works' : 'SOMETHING IS BROKEN'}`)
process.exit(ok ? 0 : 1)
