import { seasonYear, SQUADS, rolesOf, squadRated } from '../data/squads'
import { HOME_NATION, OVERSEAS_LIMIT } from '../data/nations'
import { DIFFICULTY, PRESETS, XI_SIZE } from './types'
import type {
  DraftConfig,
  DraftMode,
  DraftState,
  PlayerSeason,
  Preset,
  Role,
  Slot,
  Squad,
  TeamRatings,
} from './types'

/* ── Deterministic RNG (mulberry32) — daily challenges must never drift ──── */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const presetById = (id: string): Preset =>
  PRESETS.find((p) => p.id === id) ?? PRESETS[0]

/* ── Slots ───────────────────────────────────────────────────────────────── */

export function buildSlots(presetId: string): Slot[] {
  return presetById(presetId).slots.map((role, i) => ({ no: i + 1, role, player: null }))
}

export const filledCount = (slots: Slot[]) => slots.filter((s) => s.player).length
export const isComplete = (slots: Slot[]) => filledCount(slots) === XI_SIZE
export const xiOf = (slots: Slot[]) => slots.filter((s) => s.player).map((s) => s.player!)

/** Rules that can block an otherwise-legal pick. */
export interface Rules {
  overseasCap?: boolean
}

export const overseasCount = (slots: Slot[]) =>
  slots.filter((s) => s.player && s.player.nation !== HOME_NATION).length

/** Slot indices this player could legally occupy right now. */
export function openSlotsFor(player: PlayerSeason, slots: Slot[], rules: Rules = {}): number[] {
  // One version of a player only — you can't field 2016 Kohli next to 2023 Kohli.
  if (slots.some((s) => s.player?.name === player.name)) return []
  // Franchise cricket limits how many overseas players take the field.
  if (
    rules.overseasCap &&
    player.nation !== HOME_NATION &&
    overseasCount(slots) >= OVERSEAS_LIMIT
  ) {
    return []
  }
  const can = rolesOf(player)
  return slots.reduce<number[]>((acc, s, i) => {
    if (!s.player && can.includes(s.role)) acc.push(i)
    return acc
  }, [])
}

export const canPlace = (p: PlayerSeason, slots: Slot[], rules: Rules = {}) =>
  openSlotsFor(p, slots, rules).length > 0

export const squadHasPlaceable = (squad: Squad, slots: Slot[], rules: Rules = {}) =>
  squad.players.some((p) => canPlace(p, slots, rules))

/**
 * The overseas cap belongs to the Indian league alone, and only when the
 * league is Indian. Once the draw opens up to clubs from everywhere there is
 * no home nation to count against, so the cap is not merely switched off — it
 * has nothing left to mean.
 */
export const rulesFor = (config: DraftConfig): Rules => ({
  overseasCap: config.overseasCap && config.format === 'T20L' && !config.worldTeams,
})

export function place(slots: Slot[], player: PlayerSeason, index: number): Slot[] {
  return slots.map((s, i) => (i === index ? { ...s, player } : s))
}

/**
 * Reorder the batting card. Moving into an empty slot is a move; moving onto a
 * team-mate is a swap — which is the only way reordering can work at all once
 * all eleven slots are filled.
 */
export function moveSlot(slots: Slot[], from: number, to: number): Slot[] {
  const player = slots[from].player
  const other = slots[to].player
  if (!player || from === to) return slots
  if (!rolesOf(player).includes(slots[to].role)) return slots
  // A swap has to work in both directions: they need to cover your slot too.
  if (other && !rolesOf(other).includes(slots[from].role)) return slots
  return slots.map((s, i) =>
    i === from ? { ...s, player: other ?? null } : i === to ? { ...s, player } : s,
  )
}

/** Whether these two positions can trade places right now. */
export function canSwap(slots: Slot[], from: number, to: number): boolean {
  return moveSlot(slots, from, to) !== slots
}

/* ── Pool selection ──────────────────────────────────────────────────────── */

export function poolFor(config: DraftConfig): Squad[] {
  let pool = SQUADS.filter((s) => s.formats.includes(config.format))
  // A domestic league draws only its own clubs. This is a T20 League setting:
  // a World Cup was never picking from franchises in the first place.
  if (config.format === 'T20L' && !config.worldTeams) {
    pool = pool.filter((s) => s.region === 'IN')
  }
  if (config.scope === 'TEAM' && config.teamKey) {
    pool = pool.filter((s) => s.teamKey === config.teamKey)
  }
  // Years narrow whatever is left, so "one club, these seasons" is sayable.
  if (config.years) {
    const [from, to] = config.years
    pool = pool.filter((s) => {
      const y = seasonYear(s.season)
      return y >= from && y <= to
    })
  }
  // Prime drafts redraw every card at the player's career peak.
  return pool.map((s) => squadRated(s, config.ratingMode ?? 'SEASON'))
}

/**
 * Exact feasibility check by bipartite matching: can this pool of squads fill
 * every slot in the preset, given one version of each player? Used to grey out
 * team/era combinations that would dead-end a draft.
 */
export function canFillPreset(pool: Squad[], presetId: string): boolean {
  const slotRoles = presetById(presetId).slots

  // Unique players by name — the strongest version of each.
  const byName = new Map<string, PlayerSeason>()
  for (const s of pool) {
    for (const p of s.players) {
      const prev = byName.get(p.name)
      if (!prev || p.ovr > prev.ovr) byName.set(p.name, p)
    }
  }
  const players = [...byName.values()]
  if (players.length < XI_SIZE) return false

  // slotIndex -> playerIndex
  const matchOfSlot = new Array<number>(slotRoles.length).fill(-1)
  const matchOfPlayer = new Array<number>(players.length).fill(-1)

  const tryAssign = (slotIdx: number, seen: boolean[]): boolean => {
    for (let pi = 0; pi < players.length; pi++) {
      if (seen[pi]) continue
      if (!rolesOf(players[pi]).includes(slotRoles[slotIdx])) continue
      seen[pi] = true
      if (matchOfPlayer[pi] === -1 || tryAssign(matchOfPlayer[pi], seen)) {
        matchOfPlayer[pi] = slotIdx
        matchOfSlot[slotIdx] = pi
        return true
      }
    }
    return false
  }

  let matched = 0
  for (let si = 0; si < slotRoles.length; si++) {
    if (tryAssign(si, new Array(players.length).fill(false))) matched++
  }
  return matched === slotRoles.length
}

/* ── Drawing a squad ─────────────────────────────────────────────────────── */

/** Picks a squad that can advance the draft, preferring ones not seen recently. */
export function drawSquad(
  pool: Squad[],
  slots: Slot[],
  rng: () => number,
  recent: string[] = [],
  rules: Rules = {},
): Squad {
  const usable = pool.filter((s) => squadHasPlaceable(s, slots, rules))
  const base = usable.length ? usable : pool
  const fresh = base.filter((s) => !recent.includes(s.id))
  const from = fresh.length ? fresh : base
  return from[Math.floor(rng() * from.length)]
}

/**
 * Daily mode walks a fixed sequence, skipping squads that can't advance the
 * draft. The sequence is identical for everyone, so results stay comparable.
 */
export function drawFromSequence(
  sequence: string[],
  cursor: number,
  slots: Slot[],
  pool: Squad[],
  rules: Rules = {},
): { squad: Squad; cursor: number } {
  // A sequence entry only counts if the squad actually plays this tournament.
  // Looked up in the pool so the daily inherits the chosen rating mode.
  const eligible = new Map(pool.map((s) => [s.id, s]))
  for (let i = cursor; i < sequence.length; i++) {
    const squad = eligible.get(sequence[i])
    if (!squad) continue
    if (squadHasPlaceable(squad, slots, rules)) return { squad, cursor: i + 1 }
  }
  // Sequence exhausted — deterministic fallback keyed off progress so far.
  const squad = drawSquad(pool, slots, makeRng(sequence.length * 977 + filledCount(slots)), [], rules)
  return { squad, cursor: sequence.length }
}

/* ── State ───────────────────────────────────────────────────────────────── */

export function newDraft(
  mode: DraftMode,
  config: DraftConfig,
  dailyId: number | null = null,
): DraftState {
  return {
    mode,
    config,
    slots: buildSlots(config.presetId),
    currentSquad: null,
    maxSkips: DIFFICULTY[config.difficulty].skips,
    skipsUsed: 0,
    dailyCursor: 0,
    dailyId,
    captainId: null,
    recent: [],
  }
}

/** Default captain: best player, with all-rounders and keepers nudged up. */
export function suggestCaptain(slots: Slot[]): string | null {
  const xi = xiOf(slots)
  if (!xi.length) return null
  const bonus: Record<Role, number> = { AR: 3, WK: 2, BAT: 1, PACE: 0, SPIN: 0 }
  return [...xi].sort((a, b) => b.ovr + bonus[b.role] - (a.ovr + bonus[a.role]))[0].id
}

/* ── Ratings ─────────────────────────────────────────────────────────────── */

const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0)

export function teamRatings(slots: Slot[], captainId?: string | null): TeamRatings {
  const xi = xiOf(slots)
  if (!xi.length) return { ovr: 0, batting: 0, bowling: 0, balance: 0 }

  // The top seven contributors carry the batting; the tail rarely matters.
  const batting = avg([...xi].sort((a, b) => b.bat - a.bat).slice(0, 7).map((p) => p.bat))
  // Only five bowlers get overs.
  const bowling = avg([...xi].sort((a, b) => b.bowl - a.bowl).slice(0, 5).map((p) => p.bowl))

  const spread = Math.abs(batting - bowling)
  const captainLift = captainId && xi.some((p) => p.id === captainId) ? 2 : 0
  const balance = clamp(Math.round(100 - spread * 1.6 + captainLift), 40, 99)

  const ovr = clamp(
    Math.round(avg(xi.map((p) => p.ovr)) * 0.72 + batting * 0.14 + bowling * 0.14),
    40,
    99,
  )
  return { ovr, batting: clamp(Math.round(batting), 40, 99), bowling: clamp(Math.round(bowling), 40, 99), balance }
}
