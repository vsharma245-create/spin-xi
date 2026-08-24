/**
 * How well an XI knows itself.
 *
 * A side picked purely on ratings is eleven strangers, and cricket is not
 * played that way — an opening pair who have batted together for years run
 * between the wickets differently from two men meeting at the toss.
 *
 * The obvious way to build this is a table of who got on with whom, and it is
 * the wrong way: it is one person's opinion typed into the data and a
 * maintenance job forever. The archive already knows the answer. Two players
 * who turn up in the same squad season after season have spent years in the
 * same dressing room, and that is a fact about cricket rather than a view
 * about people.
 *
 * Nothing here needs the network. Every roster row is already loaded, so the
 * squads a player appeared in are known, and an eleven is fifty-five pairs.
 */
import { SQUADS } from '../data/squads'
import type { PlayerSeason } from './types'

let squadsOf: Map<string, Set<string>> | null = null
let builtFrom = 0

/** Which squads each player turned out for, read once off the archive. */
function index(): Map<string, Set<string>> {
  if (squadsOf && builtFrom === SQUADS.length) return squadsOf
  const out = new Map<string, Set<string>>()
  for (const squad of SQUADS) {
    for (const p of squad.players) {
      const seen = out.get(p.playerId) ?? new Set<string>()
      seen.add(squad.id)
      out.set(p.playerId, seen)
    }
  }
  squadsOf = out
  builtFrom = SQUADS.length
  return out
}

export interface Partnership {
  a: PlayerSeason
  b: PlayerSeason
  seasons: number
}

export interface Chemistry {
  /** 0–100, where fifty is an ordinary side of players who have met. */
  score: number
  /** The pairs worth naming, longest-standing first. */
  pairs: Partnership[]
}

/*
 * Six seasons together is the floor for calling it a partnership: sharing one
 * squad is a coincidence, sharing eight is a decade of net sessions. The score
 * itself is deliberately gentle — chemistry should decide a close match and
 * colour the rest, never outweigh who can actually play.
 */
const FLOOR = 6

export function chemistryOf(xi: PlayerSeason[]): Chemistry {
  const squads = index()
  const pairs: Partnership[] = []
  let total = 0

  for (let i = 0; i < xi.length; i++) {
    for (let j = i + 1; j < xi.length; j++) {
      const a = squads.get(xi[i].playerId)
      const b = squads.get(xi[j].playerId)
      if (!a || !b) continue
      // Walk the smaller set; most players appear in far fewer squads.
      const [small, large] = a.size <= b.size ? [a, b] : [b, a]
      let shared = 0
      for (const id of small) if (large.has(id)) shared++
      if (shared >= FLOOR) {
        pairs.push({ a: xi[i], b: xi[j], seasons: shared })
        total += shared
      }
    }
  }

  pairs.sort((x, y) => y.seasons - x.seasons)
  // Fifty-five pairs in an eleven; a side where a third of them have history
  // is a settled one, and that is where the scale tops out.
  const score = Math.max(0, Math.min(100, Math.round(50 + total * 1.1)))
  return { score, pairs: pairs.slice(0, 4) }
}

/**
 * What that understanding is worth in a match, in the same units as every
 * other edge. Small on purpose: a settled side wins the close ones.
 */
export const chemistryEdge = (c: Chemistry) => ((c.score - 50) / 50) * 2.2
