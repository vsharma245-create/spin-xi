import { buildSlots, makeRng, openSlotsFor, poolFor, rulesFor } from './draft'
import { XI_SIZE } from './types'
import type { DraftConfig, PlayerSeason, Slot, Squad } from './types'

/**
 * The parts of a live draft every client works out for itself.
 *
 * Four people are looking at the same room, and the only thing they share is
 * a seed and the picks so far. Everything else — which squad is up, whose
 * turn it is, what the bot would do — is derived here, and has to come out
 * identical on every machine or the draft falls apart.
 */

/** Snake order: 0 1 2 3, then 3 2 1 0. Mirrors snake_seat() in live.sql. */
export function snakeSeat(pickNo: number, seats: number): number {
  const round = Math.floor(pickNo / seats)
  const index = pickNo % seats
  return round % 2 === 0 ? index : seats - 1 - index
}

export const totalPicks = (seats: number) => seats * XI_SIZE

/**
 * The draw, fixed before anybody sits down.
 *
 * A solo draft picks the next squad by looking at what the player still needs.
 * That cannot work here: four seats need different things, and a squad that
 * appeared only when it suited you would not be the same draw for everyone.
 * So the order is settled by the seed alone and read straight off.
 */
export function drawOrder(config: DraftConfig, seed: number): Squad[] {
  const pool = [...poolFor(config)]
  const rng = makeRng(seed)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

export const squadForPick = (order: Squad[], pickNo: number): Squad | null =>
  order[pickNo % order.length] ?? null

/** Rebuild every seat's XI from the picks so far. */
export function seatSlots(
  config: DraftConfig,
  order: Squad[],
  picks: { pick_no: number; seat: number; player_id: string; slot: number }[],
  seats: number,
): Slot[][] {
  const xis = Array.from({ length: seats }, () => buildSlots(config.presetId))
  for (const p of [...picks].sort((a, b) => a.pick_no - b.pick_no)) {
    const squad = squadForPick(order, p.pick_no)
    const player = squad?.players.find((x) => x.playerId === p.player_id)
    if (!player) continue
    const slots = xis[p.seat]
    if (slots?.[p.slot]) slots[p.slot] = { ...slots[p.slot], player }
  }
  return xis
}

/**
 * What the bot does with a seat whose clock has run out.
 *
 * Deterministic on purpose. Every client runs this and gets the same answer,
 * so whoever writes it first is writing what everyone else was about to —
 * which is why a live draft needs no referee. The tie-break is the player id
 * rather than anything about the cricket, because two players can be equally
 * good and only one of them can be first.
 */
export function botPick(
  squad: Squad,
  slots: Slot[],
  taken: Set<string>,
  config: DraftConfig,
): { player: PlayerSeason; slot: number } | null {
  const rules = rulesFor(config)
  const candidates = squad.players
    .filter((p) => !taken.has(p.playerId))
    .map((p) => ({ p, open: openSlotsFor(p, slots, rules) }))
    .filter((c) => c.open.length > 0)
  if (!candidates.length) return null

  candidates.sort((a, b) => b.p.ovr - a.p.ovr || (a.p.playerId < b.p.playerId ? -1 : 1))
  const best = candidates[0]
  // The earliest slot they can fill: a top-order place is worth more than a
  // late one, and "earliest" is a rule both machines already agree on.
  return { player: best.p, slot: Math.min(...best.open) }
}

/** Seconds left on the current turn, floored at zero. */
export function secondsLeft(lastPickAt: string | null, startedAt: string | null, clock: number) {
  const from = lastPickAt ?? startedAt
  if (!from) return clock
  const ends = new Date(from).getTime() + clock * 1000
  return Math.max(0, Math.round((ends - Date.now()) / 1000))
}
