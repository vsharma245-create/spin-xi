/**
 * How well an XI knows itself.
 *
 * A side picked purely on ratings is eleven strangers, and cricket is not
 * played that way — an opening pair who have batted together for years run
 * between the wickets differently from two men meeting at the toss.
 *
 * The obvious way to build this is a table of who got on with whom, and it is
 * the wrong way: one person's opinion typed into the data, and a maintenance
 * job forever. The archive answers it properly instead. Every delivery names
 * the striker and the man at the other end, so the ball-by-ball pass counts
 * how long two players have actually spent at opposite ends — Sangakkara and
 * Jayawardene fifteen thousand deliveries, Sehwag and Gambhir close to eight,
 * Strauss and Cook ten. That is what happened, not a view about people.
 *
 * A first version of this counted shared squads instead, which was cheap and
 * meant only that two players were once on the same team sheet. Being in the
 * same squad as somebody for eight seasons and batting with them for eight
 * thousand balls are different facts, and only the second one is about a
 * partnership.
 */
import type { PlayerSeason } from './types'

export interface PartnershipRow {
  player_a: string
  player_b: string
  balls: number
  runs: number
}

/** playerId → the players they have batted with, and for how long. */
const TOGETHER = new Map<string, Map<string, { balls: number; runs: number }>>()

export function hydratePartnerships(rows: PartnershipRow[]): void {
  TOGETHER.clear()
  for (const r of rows) {
    for (const [x, y] of [
      [r.player_a, r.player_b],
      [r.player_b, r.player_a],
    ]) {
      const mine = TOGETHER.get(x) ?? new Map()
      mine.set(y, { balls: r.balls, runs: r.runs })
      TOGETHER.set(x, mine)
    }
  }
}

export const partnershipsLoaded = () => TOGETHER.size > 0

export interface Partnership {
  a: PlayerSeason
  b: PlayerSeason
  balls: number
  runs: number
}

export interface Chemistry {
  /** 0–100, where fifty is an ordinary side of players who have met. */
  score: number
  /** The pairs worth naming, longest-standing first. */
  pairs: Partnership[]
}

export function chemistryOf(xi: PlayerSeason[]): Chemistry {
  const pairs: Partnership[] = []
  let balls = 0

  for (let i = 0; i < xi.length; i++) {
    for (let j = i + 1; j < xi.length; j++) {
      const found = TOGETHER.get(xi[i].playerId)?.get(xi[j].playerId)
      if (!found) continue
      pairs.push({ a: xi[i], b: xi[j], balls: found.balls, runs: found.runs })
      balls += found.balls
    }
  }

  pairs.sort((x, y) => y.balls - x.balls)
  /*
   * Deliberately gentle, and it saturates. One great pair is worth noticing
   * and should not by itself max the scale — an India side carrying Kohli
   * with Rahane, Kohli with Rohit and Sehwag with Gambhir has earned the top
   * of it; two men who happened to bat together for a summer have not.
   * Chemistry decides a close match and colours the rest — it never outweighs
   * who can actually play.
   */
  const score = Math.round(50 + 50 * (1 - Math.exp(-balls / 25000)))
  return { score: Math.max(0, Math.min(100, score)), pairs: pairs.slice(0, 4) }
}

/**
 * What that understanding is worth in a match, in the same units as every
 * other edge. Small on purpose: a settled side wins the close ones.
 */
export const chemistryEdge = (c: Chemistry) => ((c.score - 50) / 50) * 2.2

/** How a partnership reads on the team sheet. */
export const partnershipNote = (p: Partnership) =>
  `${p.runs.toLocaleString()} runs together`
