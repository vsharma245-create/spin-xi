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

/* ── Never stranding the draft ───────────────────────────────────────────── */

/*
 * A draft can be lost before it is over. Spend the club's only all-rounder on
 * a batting slot they also cover and the eleventh place has nobody left to
 * fill it — every squad in the pool comes up dead, the re-rolls are free and
 * endless, and the side can never be finished. On a whole-archive draw there
 * are thousands of candidates and this never bites; on one club's fifteen
 * seasons it bites by simply taking the best card offered each time.
 *
 * So a slot that would strand the XI is not offered. Whether the rest can
 * still be filled is Hall's condition: for every set of roles, the players
 * covering any of them must number at least the slots that need them. Five
 * roles is thirty-one sets, and players are bucketed by the roles they cover
 * rather than counted one by one, so the whole test is a few hundred integer
 * operations and can run on every candidate pick.
 *
 * Paired with canFillPreset — which asks the same question of the empty side —
 * this makes the promise whole: if the setup screen offers a combination, the
 * draft can always be finished from it.
 */

const ROLE_BIT: Record<Role, number> = { BAT: 1, WK: 2, AR: 4, PACE: 8, SPIN: 16 }
const MASKS = 1 << 5

const maskOf = (roles: Role[]) => roles.reduce((m, r) => m | ROLE_BIT[r], 0)

export interface Feasibility {
  /** How many still-available players cover exactly this set of roles. */
  counts: number[]
  /** Every role a player has filled in this pool, by player id. */
  maskFor: Map<string, number>
  /**
   * Players already gone to somebody else's XI, by id.
   *
   * Solo drafts never need this — the only side being filled is yours. A live
   * room does: four seats eat one pool between them, so a squad can look full
   * of options and hold nothing that is still going.
   */
  taken?: Set<string>
}

/**
 * Reads the pool once, for the board to reuse across every candidate pick.
 *
 * A player is one entry under the union of the roles they have filled, because
 * the draft takes a version and not a player: an all-rounder in 2016 who
 * became a specialist batter can still be drafted as the 2016 card.
 */
export function feasibility(pool: Squad[], slots: Slot[], taken?: Set<string>): Feasibility {
  /*
   * Keyed on the player rather than their name. Forty-one names in the archive
   * belong to more than one cricketer — there are two Rashid Khans — and
   * counting by name quietly merged them, so drafting one made the other
   * unavailable and the pool was short of players it actually had.
   */
  const mine = new Set(slots.map((s) => s.player?.playerId).filter(Boolean))
  const maskFor = new Map<string, number>()
  for (const squad of pool) {
    for (const p of squad.players) {
      maskFor.set(p.playerId, (maskFor.get(p.playerId) ?? 0) | maskOf(rolesOf(p)))
    }
  }
  const counts = new Array<number>(MASKS).fill(0)
  for (const [id, mask] of maskFor) {
    if (!mine.has(id) && !taken?.has(id)) counts[mask]++
  }
  return { counts, maskFor, taken }
}

/** Hall's condition: can these open slots still be filled from what is left? */
function fillable(openRoles: Role[], counts: number[]): boolean {
  for (let set = 1; set < MASKS; set++) {
    let need = 0
    for (const role of openRoles) if (set & ROLE_BIT[role]) need++
    if (!need) continue
    let have = 0
    for (let mask = 1; mask < MASKS; mask++) if (mask & set) have += counts[mask]
    if (have < need) return false
  }
  return true
}

/** Slot indices this player could legally occupy right now. */
export function openSlotsFor(
  player: PlayerSeason,
  slots: Slot[],
  rules: Rules = {},
  feas?: Feasibility,
): number[] {
  // Gone to another seat in a live room, so not going anywhere here.
  if (feas?.taken?.has(player.playerId)) return []
  // One version of a player only — you can't field 2016 Kohli next to 2023
  // Kohli. By player rather than by name: two different cricketers who happen
  // to share one should not block each other.
  if (slots.some((s) => s.player?.playerId === player.playerId)) return []
  // Franchise cricket limits how many overseas players take the field.
  if (
    rules.overseasCap &&
    player.nation !== HOME_NATION &&
    overseasCount(slots) >= OVERSEAS_LIMIT
  ) {
    return []
  }
  const can = rolesOf(player)
  const open = slots.reduce<number[]>((acc, s, i) => {
    if (!s.player && can.includes(s.role)) acc.push(i)
    return acc
  }, [])
  if (!feas) return open

  // Taking this player removes them from everything still to be filled.
  const counts = feas.counts.slice()
  const mine = feas.maskFor.get(player.playerId)
  if (mine !== undefined && counts[mine] > 0) counts[mine]--

  const openRoles = slots.filter((s) => !s.player).map((s) => s.role)
  return open.filter((i) => {
    const rest = [...openRoles]
    rest.splice(rest.indexOf(slots[i].role), 1)
    return fillable(rest, counts)
  })
}

export const canPlace = (p: PlayerSeason, slots: Slot[], rules: Rules = {}, feas?: Feasibility) =>
  openSlotsFor(p, slots, rules, feas).length > 0

export const squadHasPlaceable = (
  squad: Squad,
  slots: Slot[],
  rules: Rules = {},
  feas?: Feasibility,
) => squad.players.some((p) => canPlace(p, slots, rules, feas))

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

/**
 * Reorder the finished XI.
 *
 * Different from moveSlot, and deliberately unrestricted. During the draft a
 * position carries a requirement — the eighth place wants a spinner — so
 * moving somebody into it means checking they can fill it. Once eleven names
 * are down there is no requirement left to protect: the side is picked, and
 * what is being arranged is the batting order.
 *
 * The whole position moves rather than the player, so a fast bowler sent in to
 * open is still a fast bowler, and the shape of the side is untouched — only
 * the order in which they bat. Which is the point: a player who wants their
 * hitter up the order should be able to send them there, whatever the game
 * decided to call them.
 *
 * The numbering belongs to the position and stays where it is; everything else
 * travels with the player.
 */
export function reorderXI(slots: Slot[], from: number, to: number): Slot[] {
  if (from === to || !slots[from] || !slots[to]) return slots
  const moved = [...slots]
  const [taken] = moved.splice(from, 1)
  moved.splice(to, 0, taken)
  return moved.map((s, i) => ({ ...s, no: i + 1 }))
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
  return pool.map((s) => squadRated(s, config.ratingMode ?? 'SEASON', config.format))
}

/**
 * Exact feasibility check by bipartite matching: can this pool of squads fill
 * every slot in the preset, given one version of each player? Used to grey out
 * team/era combinations that would dead-end a draft.
 */
export function canFillPreset(pool: Squad[], presetId: string): boolean {
  const slotRoles = presetById(presetId).slots

  /*
   * Unique players, and every role they have filled in this pool.
   *
   * The union across their seasons rather than the roles on their best card,
   * because a draft picks a version and not a player: someone who was an
   * all-rounder in 2016 and a specialist batter by 2023 can still be taken as
   * the 2016 card. Reading only the strongest year hid whole clubs — Perth
   * Scorchers field five all-rounders across their fifteen seasons and exactly
   * one of them tops their own card, so a balanced XI was greyed out for a
   * club that can comfortably fill it.
   */
  const rolesByPlayer = new Map<string, Set<Role>>()
  for (const s of pool) {
    for (const p of s.players) {
      const seen = rolesByPlayer.get(p.playerId) ?? new Set<Role>()
      for (const r of rolesOf(p)) seen.add(r)
      rolesByPlayer.set(p.playerId, seen)
    }
  }
  const players = [...rolesByPlayer.values()]
  if (players.length < XI_SIZE) return false

  // slotIndex -> playerIndex
  const matchOfSlot = new Array<number>(slotRoles.length).fill(-1)
  const matchOfPlayer = new Array<number>(players.length).fill(-1)

  const tryAssign = (slotIdx: number, seen: boolean[]): boolean => {
    for (let pi = 0; pi < players.length; pi++) {
      if (seen[pi]) continue
      if (!players[pi].has(slotRoles[slotIdx])) continue
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
  feas?: Feasibility,
): Squad {
  const usable = pool.filter((s) => squadHasPlaceable(s, slots, rules, feas))
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
  feas?: Feasibility,
): { squad: Squad; cursor: number } {
  // A sequence entry only counts if the squad actually plays this tournament.
  // Looked up in the pool so the daily inherits the chosen rating mode.
  const eligible = new Map(pool.map((s) => [s.id, s]))
  for (let i = cursor; i < sequence.length; i++) {
    const squad = eligible.get(sequence[i])
    if (!squad) continue
    if (squadHasPlaceable(squad, slots, rules, feas)) return { squad, cursor: i + 1 }
  }
  // Sequence exhausted — deterministic fallback keyed off progress so far.
  const squad = drawSquad(pool, slots, makeRng(sequence.length * 977 + filledCount(slots)), [], rules, feas)
  return { squad, cursor: sequence.length }
}

/* ── State ───────────────────────────────────────────────────────────────── */

export function newDraft(
  mode: DraftMode,
  config: DraftConfig,
  dailyId: number | null = null,
  restartsUsed = 0,
): DraftState {
  return {
    mode,
    config,
    slots: buildSlots(config.presetId),
    currentSquad: null,
    maxSkips: DIFFICULTY[config.difficulty].skips,
    skipsUsed: 0,
    restartsUsed,
    dailyCursor: 0,
    dailyId,
    captainId: null,
    recent: [],
  }
}

/**
 * Restarts left.
 *
 * The daily gets none whatever the difficulty says. It is one draw that
 * everybody in the world plays on the same day, and a player who can keep
 * restarting until the draw suits them is not playing the same puzzle as the
 * person they are about to be ranked against.
 */
export function restartsLeft(state: DraftState): number {
  if (state.mode === 'daily') return 0
  return Math.max(0, DIFFICULTY[state.config.difficulty].restarts - state.restartsUsed)
}

/** A number from a string, for seeding a shuffle off a squad id. */
export function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
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
