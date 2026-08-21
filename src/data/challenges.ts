import { makeRng } from '../game/draft'
import { SQUADS } from './squads'
import type { Format } from '../game/types'

/**
 * The rotation lives in the database so puzzles can be added or retired
 * without a deploy. Which one you get is still a pure function of the date, so
 * everyone playing today plays the same one.
 */
export interface ChallengeRow {
  slot: number
  format: Format
  preset_id: string
  objective: string
  objective_desc: string
  active: boolean
}

let ROTATION: ChallengeRow[] = []

export function hydrateChallenges(rows: ChallengeRow[]): void {
  ROTATION = [...rows].sort((a, b) => a.slot - b.slot)
}

/** Used before the archive lands, and if the table is ever emptied. */
const FALLBACK: ChallengeRow = {
  slot: 0,
  format: 'T20L',
  preset_id: 'BALANCED',
  objective: 'GO UNBEATEN',
  objective_desc: 'Finish the group stage without a loss.',
  active: true,
}

/** Whole days since the epoch, in the player's own timezone. */
export function dayIndex(d = new Date()): number {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor(local.getTime() / 86400000)
}

export function dateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/**
 * The day's draw order: a seeded shuffle of every squad eligible for that day's
 * format, doubled so there are always more draws available than slots to fill.
 * Generated rather than hand-written so a sequence can never contain a squad
 * that doesn't play the day's tournament.
 */
function sequenceFor(format: Format, seed: number): string[] {
  const ids = SQUADS.filter((s) => s.formats.includes(format)).map((s) => s.id)
  const rng = makeRng(seed)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  // Seeing a side twice in one run is fine — it's a different set of players.
  return [...ids, ...ids]
}

export interface DailyChallenge {
  number: number
  index: number
  dateKey: string
  sequence: string[]
  format: Format
  presetId: string
  objective: { title: string; desc: string }
  bestRun: string
}

export function todaysChallenge(d = new Date()): DailyChallenge {
  const index = dayIndex(d)
  const rng = makeRng(index * 7919)
  const today = ROTATION.length ? ROTATION[index % ROTATION.length] : FALLBACK
  const format = today.format
  const bestWins = 12 + Math.floor(rng() * 3)
  return {
    // Offset so the challenge number reads like a product that launched a while back.
    number: index - 20470,
    index,
    dateKey: dateKey(d),
    sequence: sequenceFor(format, index * 31337),
    format,
    presetId: today.preset_id,
    objective: { title: today.objective, desc: today.objective_desc },
    bestRun: `${bestWins}–${14 - bestWins}`,
  }
}
