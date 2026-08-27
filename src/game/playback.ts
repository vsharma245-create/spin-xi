import type { PlayedInnings as EngineInnings } from './engine'
import type { BatLine, BowlLine, MatchCard, MatchResult } from './types'

/**
 * Dressing the match for the scoreboard.
 *
 * This file used to reconstruct an innings from its scorecard — recovering the
 * partnerships from the balls each batter faced, laying the runs back out over
 * them, inferring who bowled what. It was a good guess and it always ended
 * exactly where the card did, but it was a guess, because the match had never
 * been played: a result was decided, a total invented to fit it, and the total
 * shared across the eleven.
 *
 * The engine plays every delivery now, so there is nothing left to infer. What
 * remains here is the only work still needed — turning indices into names and
 * folding the deliveries into what a scoreboard shows after each one.
 */

/** A ball as a scorer would write it down. */
export interface Delivery {
  over: number
  ballsBefore: number
  /** False for wides and no-balls, which do not advance the over. */
  legal: boolean
  runs: number
  batRuns: number
  extra: 'wd' | 'nb' | 'b' | 'lb' | null
  striker: number
  nonStriker: number
  bowler: string
  bowlerIdx: number
  wicket: { batter: string; how: string; bowler: number | null } | null
}

/** The full state of the match after one delivery — what a scoreboard shows. */
export interface Frame {
  runs: number
  wickets: number
  balls: number
  /** "14.3" */
  overs: string
  /** Runs per over, to two places. */
  rate: number
  striker: { name: string; runs: number; balls: number } | null
  nonStriker: { name: string; runs: number; balls: number } | null
  bowler: { name: string; balls: number; runs: number; wickets: number }
  /** The over in progress, oldest ball first, as beads. */
  thisOver: Bead[]
  /** Set on the delivery a wicket fell. */
  fell: { batter: string; how: string; score: string } | null
  delivery: Delivery
}

export interface Bead {
  label: string
  kind: 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra'
}

export const oversOf = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`

/* ── Reading the scoreboard off the deliveries ───────────────────────────── */

const beadOf = (d: Delivery): Bead => {
  if (d.wicket) return { label: 'W', kind: 'wicket' }
  if (d.extra === 'wd') return { label: d.runs > 1 ? `${d.runs}wd` : 'wd', kind: 'extra' }
  if (d.extra === 'nb') return { label: 'nb', kind: 'extra' }
  if (d.extra === 'b' || d.extra === 'lb')
    return { label: `${d.runs - d.batRuns}${d.extra}`, kind: 'extra' }
  if (d.batRuns === 6) return { label: '6', kind: 'six' }
  if (d.batRuns === 4) return { label: '4', kind: 'four' }
  if (d.batRuns === 0) return { label: '•', kind: 'dot' }
  return { label: String(d.batRuns), kind: 'run' }
}

function framesOf(deliveries: Delivery[], batters: BatLine[]): Frame[] {
  const runsBy = new Array(batters.length).fill(0)
  const ballsBy = new Array(batters.length).fill(0)
  const bowl = new Map<number, { balls: number; runs: number; wickets: number }>()
  let runs = 0
  let wickets = 0
  let balls = 0
  let over = -1
  let thisOver: Bead[] = []

  return deliveries.map((d) => {
    if (d.over !== over) {
      over = d.over
      thisOver = []
    }
    runs += d.runs
    runsBy[d.striker] += d.batRuns
    if (d.legal) {
      balls++
      ballsBy[d.striker]++
    }
    if (d.wicket) wickets++

    const b = bowl.get(d.bowlerIdx) ?? { balls: 0, runs: 0, wickets: 0 }
    if (d.legal) b.balls++
    // A bye is not the bowler's fault, and never has been.
    b.runs += d.extra === 'b' || d.extra === 'lb' ? d.batRuns : d.runs
    if (d.wicket?.bowler !== null && d.wicket?.bowler !== undefined) b.wickets++
    bowl.set(d.bowlerIdx, b)

    thisOver = [...thisOver, beadOf(d)]

    const face = (i: number) =>
      batters[i] ? { name: batters[i].name, runs: runsBy[i], balls: ballsBy[i] } : null

    return {
      runs,
      wickets,
      balls,
      overs: oversOf(balls),
      rate: balls > 0 ? Number(((runs / balls) * 6).toFixed(2)) : 0,
      striker: face(d.striker),
      nonStriker: face(d.nonStriker),
      bowler: { name: d.bowler, balls: b.balls, runs: b.runs, wickets: b.wickets },
      thisOver,
      fell: d.wicket
        ? { batter: d.wicket.batter, how: d.wicket.how, score: `${runs}/${wickets}` }
        : null,
      delivery: d,
    }
  })
}

/* ── A whole match ───────────────────────────────────────────────────────── */

export interface PlayedInnings {
  deliveries: Delivery[]
  frames: Frame[]
  bowling: BowlLine[]
  batting: BatLine[]
  runs: number
  wickets: number
  balls: number
  overs: string
  score: { runs: number; wickets: number; overs: string }
  extras: number
  ours: boolean
  label: string
  /** Set on an innings being chased. */
  target: number | null
  battingName: string
  bowlingName: string
}

/** Both sides, in the order they batted, ready to watch. */
export function playMatchCard(m: MatchResult, teamName: string): PlayedInnings[] {
  const c: MatchCard = m.card
  if (!c.balls?.length) return []
  return c.balls.map((inn, i) => dress(inn, i, c, teamName, m.opponent))
}

/**
 * One innings the engine bowled, named for the scoreboard.
 *
 * No reconstruction and no assumptions: the balls are the balls. The only work
 * is naming — the engine counts in indices and a scoreboard reads names.
 */
function dress(
  inn: EngineInnings,
  index: number,
  card: MatchCard,
  teamName: string,
  them: string,
): PlayedInnings {
  const batting: BatLine[] = inn.order.map((p, i) => {
    const b = inn.bat[i]
    return {
      name: p.surname,
      runs: b?.runs ?? 0,
      balls: b?.balls ?? 0,
      out: b?.out ?? false,
      how: b?.came ? (b?.how ?? 'not out') : 'DNB',
      dnb: !b?.came,
    }
  })

  const bowling: BowlLine[] = inn.attack
    .map((p, i) => {
      const sent = inn.bowl[i]?.balls ?? 0
      return {
        name: p.surname,
        overs: sent % 6 === 0 ? String(sent / 6) : oversOf(sent),
        runs: inn.bowl[i]?.runs ?? 0,
        wickets: inn.bowl[i]?.wickets ?? 0,
      }
    })
    .filter((l) => l.overs !== '0')

  const deliveries: Delivery[] = []
  let balls = 0
  for (const d of inn.deliveries) {
    deliveries.push({
      over: d.over,
      ballsBefore: balls,
      legal: d.legal,
      runs: d.runs,
      batRuns: d.batRuns,
      extra: d.extra,
      striker: d.striker,
      nonStriker: d.nonStriker,
      bowler: inn.attack[d.bowler]?.surname ?? '—',
      bowlerIdx: d.bowler,
      wicket: d.wicket
        ? {
            batter: inn.order[d.wicket.batter]?.surname ?? '—',
            how: d.wicket.how,
            bowler: d.wicket.bowler,
          }
        : null,
    })
    if (d.legal) balls++
  }

  return {
    deliveries,
    frames: framesOf(deliveries, batting),
    bowling,
    batting,
    runs: inn.runs,
    wickets: inn.wickets,
    balls: inn.balls,
    overs: oversOf(inn.balls),
    score: { runs: inn.runs, wickets: inn.wickets, overs: oversOf(inn.balls) },
    extras: inn.extras,
    ours: inn.ours,
    // A Test is two innings a side; everything else is one each.
    label: card.innings?.length
      ? index < 2
        ? 'FIRST INNINGS'
        : 'SECOND INNINGS'
      : index === 0
        ? 'FIRST INNINGS'
        : 'SECOND INNINGS',
    target: inn.target,
    battingName: inn.ours ? teamName : them,
    bowlingName: inn.ours ? them : teamName,
  }
}

/* ── The voice in the corner ─────────────────────────────────────────────── */

const HOW_SAID: Record<string, string> = {
  b: 'bowled',
  lbw: 'lbw',
  'c keeper': 'caught behind',
  'c mid-off': 'caught at mid-off',
  'c deep': 'caught in the deep',
  'run out': 'run out',
  st: 'stumped',
}

const SIX = ['SIX — into the crowd.', 'SIX — that is enormous.', 'SIX — off the middle, over long-on.', 'SIX — picked the length early.']
const FOUR = ['FOUR — through the covers.', 'FOUR — beaten at the rope.', 'FOUR — clipped off the pads.', 'FOUR — no fielder was getting that.']
const DOT = ['Dot ball.', 'Beaten outside off.', 'Defended, no run.', 'Straight to the fielder.', 'Squeezed out.', 'Good length, nothing on offer.']
const ONE = ['Nudged for one.', 'Single, strike rotated.', 'Pushed to long-on, one.', 'Worked away for a single.']
const TWO = ['Two, well run.', 'Into the gap, back for the second.', 'Two more.']
const THREE = ['Three — the outfield is quick.', 'Into the deep, three taken.']

/**
 * A line for the delivery just bowled, chosen from the delivery itself so the
 * same ball is always described the same way.
 */
export function call(f: Frame): string {
  const d = f.delivery
  const at = d.ballsBefore * 7 + d.striker * 3 + d.runs
  const of = <T,>(list: T[]) => list[at % list.length]
  if (d.wicket) {
    const how = HOW_SAID[d.wicket.how] ?? d.wicket.how
    return `${d.wicket.batter} ${how} — ${f.runs}/${f.wickets}.`
  }
  if (d.extra === 'wd') return 'Wide — down the leg side.'
  if (d.extra === 'nb') return 'No ball, and a free hit to come.'
  if (d.extra === 'b' || d.extra === 'lb')
    return `${d.runs - d.batRuns} ${d.extra === 'b' ? 'bye' : 'leg bye'}${d.runs - d.batRuns > 1 ? 's' : ''}.`
  if (d.batRuns === 6) return of(SIX)
  if (d.batRuns === 4) return of(FOUR)
  if (d.batRuns === 3) return of(THREE)
  if (d.batRuns === 2) return of(TWO)
  if (d.batRuns === 1) return of(ONE)
  return of(DOT)
}
