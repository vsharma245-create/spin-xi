import type { Conditions } from './conditions'
import type { Format, PitchType, PlayerSeason, Role } from './types'

/**
 * A match played out, rather than a result shared out.
 *
 * What was here before decided a score from one number — the side's batting
 * rating — and then spread it across the eleven. Two XIs with the same average
 * made the same runs, so a side built around Gayle and de Villiers scored
 * exactly what a side of anchors scored, and the bowler at the other end never
 * entered into it at all. The result was decided before the score, and the
 * score was invented to fit it.
 *
 * This starts at the other end. Every delivery is a contest between the man
 * bowling it and the man facing, read off their own ratings and bent by the
 * over count, the wickets in hand, the surface and — chasing — the rate still
 * required. The score is whatever comes out, and so is the result.
 *
 * The consequences are the point. A side of hitters posts 190 and gets bowled
 * out for 90; an attack of four genuine quicks defends 150; the run rate dips
 * when three go down in the powerplay and climbs when a set batter is still
 * there at the death, because that is what the deliveries did rather than what
 * a curve was asked to look like.
 */

/* ── What a format is like ───────────────────────────────────────────────── */

interface Shape {
  overs: number
  /** Deliveries a top-order batter takes to get in. The tail never does. */
  settle: number
  /** Legal deliveries between wickets, for two average sides. */
  ballsPerWicket: number
  /** Runs per over an average side scores against an average attack. */
  rate: number
  /** How many overs one bowler may send down. */
  quota: number
  /** How hard the last overs are chased. Tests do not chase. */
  death: number
}

const SHAPE: Record<Format, Shape> = {
  // 165 off 20 is 8.25 an over; six down is a wicket every 20 balls.
  T20L: { overs: 20, settle: 7, ballsPerWicket: 20, rate: 8.25, quota: 4, death: 1.5 },
  T20WC: { overs: 20, settle: 7, ballsPerWicket: 21, rate: 7.9, quota: 4, death: 1.5 },
  // 270 off 50 is 5.4; seven down over 300 balls.
  ODIWC: { overs: 50, settle: 16, ballsPerWicket: 43, rate: 5.4, quota: 10, death: 1.45 },
  // A day's play: 90 overs at a shade over three, and about six wickets.
  TEST: { overs: 150, settle: 26, ballsPerWicket: 80, rate: 3.3, quota: 38, death: 1 },
}

/* ── Reading a player ────────────────────────────────────────────────────── */

const statOf = (p: PlayerSeason, label: string) =>
  p.stats.find((s) => s.label === label)?.value ?? 50

/**
 * How fast this batter scores when nothing is forcing him.
 *
 * The card already carries a strike rate ranked against the format, and it is
 * the whole reason Sehwag should not bat like Boycott. Read as a multiplier
 * around one so it can be applied to any format's tempo.
 */
const tempoOf = (p: PlayerSeason) => {
  const sr = statOf(p, 'SR')
  // An all-rounder's IMPCT stands in for it; a bowler swings at everything.
  const raw = p.role === 'AR' ? statOf(p, 'IMPCT') : p.role === 'BAT' || p.role === 'WK' ? sr : 62
  return 0.72 + (raw / 100) * 0.62
}

/** How hard he is to get out. Batting quality, mostly. */
const resistOf = (p: PlayerSeason) => 0.45 + (p.bat / 100) * 1.3

/** A bowler's wicket-taking and his containment, each around one. */
const threatOf = (p: PlayerSeason) => {
  const wkt = statOf(p, 'WKT')
  return 0.5 + ((p.bowl * 0.6 + wkt * 0.4) / 100) * 1.2
}
const meanOf = (p: PlayerSeason) => {
  const econ = statOf(p, 'ECON')
  // Economy is rated so that higher is meaner, so it pulls the rate down.
  return 1.34 - ((p.bowl * 0.45 + econ * 0.55) / 100) * 0.72
}

/** Does the surface suit him? */
const suits = (p: PlayerSeason, pitch: PitchType) =>
  (pitch === 'PACE' && p.role === 'PACE') || (pitch === 'SPIN' && p.role === 'SPIN')
    ? 1.18
    : pitch === 'BATTING'
      ? 0.88
      : 1

/* ── The attack ──────────────────────────────────────────────────────────── */

/** Five bowlers, best first, with the surface taken into account. */
export function attackFrom(xi: PlayerSeason[], pitch: PitchType): PlayerSeason[] {
  const bowlers = xi.filter((p) => p.role === 'PACE' || p.role === 'SPIN' || p.role === 'AR')
  const ranked = [...bowlers].sort((a, b) => b.bowl * suits(b, pitch) - a.bowl * suits(a, pitch))
  if (ranked.length >= 4) return ranked.slice(0, 5)
  // A side that drafted almost no bowling still has to bowl. Whoever is left
  // does it badly, which is the correct punishment for the team sheet.
  const rest = [...xi].filter((p) => !ranked.includes(p)).sort((a, b) => b.bowl - a.bowl)
  return [...ranked, ...rest].slice(0, 5)
}

/** The order a side bats in: the card's order, keeper and bowlers pushed down. */
const ORDER: Record<Role, number> = { BAT: 0, WK: 1, AR: 2, SPIN: 3, PACE: 3 }

export function orderFrom(xi: PlayerSeason[]): PlayerSeason[] {
  return [...xi].sort((a, b) => ORDER[a.role] - ORDER[b.role] || b.bat - a.bat)
}

/* ── One delivery ────────────────────────────────────────────────────────── */

const VALUES = [0, 1, 2, 3, 4, 6] as const
/** What a delivery is worth when nobody is forcing anything. */
const BASE = [0.42, 0.3, 0.085, 0.011, 0.13, 0.054]

/**
 * A scoring shot, drawn so the average comes out where it is wanted.
 *
 * The natural spread of shots is tilted by one number until its mean is the
 * rate being asked for — the least-assuming way to hit a target, and it keeps
 * the shape of cricket while changing the gear. Fixed weights cannot do this:
 * they score at their own rate no matter what the innings needs.
 */
const TILT = new Map<number, number[]>()

function shot(want: number, rand: () => number): number {
  /*
   * Solved once per rate rather than once per ball.
   *
   * Finding the tilt takes twenty-two halvings and six exponentials apiece,
   * and a season is eight thousand deliveries — a million exponentials to
   * answer a few hundred distinct questions. Rounded to a fortieth of a run
   * the answers repeat, and the difference between wanting 1.375 a ball and
   * 1.4 is not a difference anybody can see.
   */
  const key = Math.round(Math.min(5.4, Math.max(0.02, want)) * 40)
  let w = TILT.get(key)
  if (!w) {
    const target = key / 40
    const mean = (theta: number) => {
      let top = 0
      let sum = 0
      for (let k = 0; k < VALUES.length; k++) {
        const x = BASE[k] * Math.exp(theta * VALUES[k])
        top += x * VALUES[k]
        sum += x
      }
      return top / sum
    }
    let a = -8
    let b = 8
    for (let i = 0; i < 22; i++) {
      const mid = (a + b) / 2
      if (mean(mid) < target) a = mid
      else b = mid
    }
    const theta = (a + b) / 2
    // Stored as running totals, so drawing a shot is one pass and no division.
    let sum = 0
    w = VALUES.map((v, k) => (sum += BASE[k] * Math.exp(theta * v)))
    TILT.set(key, w)
  }
  const roll = rand() * w[w.length - 1]
  for (let k = 0; k < VALUES.length; k++) if (roll <= w[k]) return VALUES[k]
  return 0
}

/* ── An innings ──────────────────────────────────────────────────────────── */

export interface Ball {
  over: number
  legal: boolean
  runs: number
  batRuns: number
  extra: 'wd' | 'nb' | 'b' | 'lb' | null
  striker: number
  nonStriker: number
  bowler: number
  wicket: { batter: number; how: string; bowler: number | null } | null
}

export interface InningsResult {
  runs: number
  wickets: number
  balls: number
  extras: number
  deliveries: Ball[]
  /** Per batter, in batting order. */
  bat: { runs: number; balls: number; out: boolean; how: string; came: boolean }[]
  /** Per bowler, in attack order. */
  bowl: { balls: number; runs: number; wickets: number; maidens: number }[]
  /** True when the side chasing got there. */
  chased: boolean
}

const OUT_TYPES = ['b', 'lbw', 'c keeper', 'c mid-off', 'c deep', 'st']

export interface InningsInput {
  batting: PlayerSeason[]
  attack: PlayerSeason[]
  format: Format
  pitch: PitchType
  conditions: Conditions
  rand: () => number
  /** Runs needed to win. Absent for the side batting first. */
  target?: number
  /** Overs available, where rain or a Test declaration shortens them. */
  overs?: number
  /**
   * Everything that is not the eleven: the toss, the dew, how long these
   * players have spent at the crease together. One number, where 1 is neutral
   * and 1.05 is a side playing five per cent above itself.
   */
  edge?: number
}

export function playInnings(input: InningsInput): InningsResult {
  const { batting, attack, format, pitch, conditions, rand, target } = input
  const shape = SHAPE[format]
  const overs = input.overs ?? shape.overs
  const maxBalls = overs * 6
  const edge = input.edge ?? 1

  const order = batting
  const bat = order.map((p) => ({
    runs: 0,
    balls: 0,
    out: false,
    how: 'not out',
    came: false,
    tempo: tempoOf(p),
    resist: resistOf(p),
  }))
  const bowl = attack.map(() => ({ balls: 0, runs: 0, wickets: 0, maidens: 0 }))
  const overQuota = attack.map(() => 0)

  const deliveries: Ball[] = []
  let runs = 0
  let wickets = 0
  let balls = 0
  let extras = 0
  let striker = 0
  let nonStriker = 1
  let next = 2
  bat[0].came = true
  if (bat[1]) bat[1].came = true

  /* Dew makes the ball skid on and the bowler's grip go; night helps the seam. */
  const dew = conditions.dew ? 1.06 : 1
  const cloud = conditions.sky === 'OVERCAST' ? 0.95 : conditions.sky === 'CLEAR' ? 1.02 : 1
  const surface = pitch === 'BATTING' ? 1.1 : pitch === 'NEUTRAL' ? 1 : 0.93

  let lastOver = -1
  let onNow = 0
  let overRuns = 0
  let overWickets = 0

  while (balls < maxBalls && wickets < 10 && !(target !== undefined && runs >= target)) {
    const over = Math.floor(balls / 6)

    /* ── Who is bowling ── */
    if (over !== lastOver) {
      if (lastOver >= 0 && overRuns === 0 && overWickets >= 0) bowl[onNow].maidens++
      overRuns = 0
      overWickets = 0
      let pick = -1
      let best = -1
      for (let i = 0; i < attack.length; i++) {
        if (i === onNow && lastOver >= 0) continue
        if (overQuota[i] >= shape.quota) continue
        // The best bowlers open and are kept for the end; in between, whoever
        // has most left. Nobody bowls consecutive overs.
        const held = shape.quota - overQuota[i]
        const late = over >= overs - 4 ? (attack.length - i) * 2.5 : 0
        const weight = held * 6 + (attack.length - i) * 1.5 + late + rand() * 2
        if (weight > best) {
          best = weight
          pick = i
        }
      }
      if (pick === -1) pick = overQuota.findIndex((n) => n < shape.quota)
      if (pick === -1) pick = 0
      onNow = pick
      overQuota[onNow]++
      lastOver = over
    }

    const bowler = attack[onNow]
    const b = bat[striker]
    const facing = order[striker]

    /* ── What this delivery is worth ── */
    const left = maxBalls - balls
    const wicketsInHand = 10 - wickets
    const phase =
      format === 'TEST'
        ? 1
        : over < overs * 0.3
          ? 1.04
          : over < overs * 0.75
            ? 0.92
            : shape.death

    /*
     * How hard he is going.
     *
     * Chasing, it is whatever the rate demands, tempered by how much batting
     * is left — nine down with fifty to get is not a licence, it is a plea.
     * Setting, it is his own tempo shaped by the over count, pushed up as the
     * innings runs out of deliveries to use.
     */
    let want: number
    if (target !== undefined) {
      const need = (target - runs) / Math.max(1, left)
      const desperation = Math.min(1.9, Math.max(0.75, need / (shape.rate / 6)))
      const careful = 0.55 + (wicketsInHand / 10) * 0.55
      want = (shape.rate / 6) * desperation * Math.min(1.35, careful + 0.35) * b.tempo
    } else {
      want = (shape.rate / 6) * phase * b.tempo
    }

    /*
     * Playing himself in. Nobody arrives set and the tail never gets there,
     * but how long it takes belongs to the format: an opener in a Twenty20
     * has six balls to look at it, and one in a Test has half an hour.
     */
    const topOrder = facing.role === 'BAT' || facing.role === 'WK'
    const settled = Math.min(
      1,
      0.62 + (b.balls / (topOrder ? shape.settle : shape.settle * 0.5)) * 0.38,
    )
    want *= settled * meanOf(bowler) * suits(bowler, pitch) * surface * dew * cloud * edge

    /* ── Does he get out ── */
    const risk = Math.max(0.6, want / (shape.rate / 6))
    const chance =
      (1 / shape.ballsPerWicket) *
      (threatOf(bowler) / b.resist) *
      suits(bowler, pitch) *
      Math.pow(risk, 1.35) *
      (surface > 1 ? 0.88 : 1.06) /
      (cloud * dew * edge)

    if (rand() < chance) {
      const runOut = rand() < 0.07
      b.out = true
      b.how = runOut ? 'run out' : OUT_TYPES[Math.floor(rand() * OUT_TYPES.length)]
      b.balls++
      wickets++
      balls++
      overWickets++
      bowl[onNow].balls++
      if (!runOut) bowl[onNow].wickets++
      deliveries.push({
        over,
        legal: true,
        runs: 0,
        batRuns: 0,
        extra: null,
        striker,
        nonStriker,
        bowler: onNow,
        wicket: { batter: striker, how: b.how, bowler: runOut ? null : onNow },
      })
      if (wickets >= 10 || next >= order.length) break
      bat[next].came = true
      striker = next
      next++
      if (balls % 6 === 0) {
        const t = striker
        striker = nonStriker
        nonStriker = t
      }
      continue
    }

    /* ── Extras ── */
    if (rand() < 0.021) {
      const noBall = rand() < 0.3
      const give = 1 + (rand() < 0.08 ? 4 : 0)
      runs += give
      extras += give
      overRuns += give
      bowl[onNow].runs += give
      deliveries.push({
        over,
        legal: false,
        runs: give,
        batRuns: 0,
        extra: noBall ? 'nb' : 'wd',
        striker,
        nonStriker,
        bowler: onNow,
        wicket: null,
      })
      continue
    }

    /* ── The shot ── */
    const scored = shot(want, rand)
    let extra: Ball['extra'] = null
    let extraRuns = 0
    if (scored === 0 && rand() < 0.014) {
      extraRuns = rand() < 0.85 ? 1 : 2
      extra = rand() < 0.45 ? 'b' : 'lb'
      extras += extraRuns
    }

    b.runs += scored
    b.balls++
    runs += scored + extraRuns
    overRuns += scored + extraRuns
    balls++
    bowl[onNow].balls++
    // Byes are not the bowler's fault, and never have been.
    bowl[onNow].runs += scored

    deliveries.push({
      over,
      legal: true,
      runs: scored + extraRuns,
      batRuns: scored,
      extra,
      striker,
      nonStriker,
      bowler: onNow,
      wicket: null,
    })

    const odd = (scored + extraRuns) % 2 === 1
    const endOfOver = balls % 6 === 0
    if (odd !== endOfOver) {
      const t = striker
      striker = nonStriker
      nonStriker = t
    }
  }

  return {
    runs,
    wickets,
    balls,
    extras,
    deliveries,
    bat: bat.map((x) => ({ runs: x.runs, balls: x.balls, out: x.out, how: x.how, came: x.came })),
    bowl,
    chased: target !== undefined && runs >= target,
  }
}

/* ── A whole match ───────────────────────────────────────────────────────── */

export interface PlayedInnings extends InningsResult {
  ours: boolean
  label: string
  /** The eleven that batted, in the order they batted. */
  order: PlayerSeason[]
  /** The attack that bowled at them, in the order the card lists it. */
  attack: PlayerSeason[]
  target: number | null
}

export interface PlayedMatch {
  innings: PlayedInnings[]
  ourRuns: number
  ourWickets: number
  theirRuns: number
  theirWickets: number
  outcome: 'W' | 'L' | 'D'
  margin: string
  battedFirst: boolean
}

const side = (n: number, w: number) => `${n}/${w}`
void side

/**
 * Both sides, in the order they batted, and whatever came out.
 *
 * The result is not decided anywhere. It is read off the second innings: they
 * got there or they did not, and by how much. A tournament's shape now comes
 * from eleven players against eleven players rather than from a coin weighted
 * by two averages.
 *
 * `edge` is everything that is not the eleven — the toss, the dew, how long
 * these players have spent in the same dressing rooms, the handicap the player
 * chose. One number where 1 is neutral, applied to our batting and against
 * their bowling.
 */
export function playMatchOut(input: {
  xi: PlayerSeason[]
  them: PlayerSeason[]
  format: Format
  pitch: PitchType
  conditions: Conditions
  rand: () => number
  battedFirst: boolean
  edge?: number
}): PlayedMatch {
  const { xi, them, format, pitch, conditions, rand, battedFirst } = input
  const edge = input.edge ?? 1

  const ourOrder = orderFrom(xi)
  const theirOrder = orderFrom(them)
  const ourAttack = attackFrom(xi, pitch)
  const theirAttack = attackFrom(them, pitch)

  const bat = (ours: boolean, label: string, target: number | null, overs?: number): PlayedInnings => {
    const r = playInnings({
      batting: ours ? ourOrder : theirOrder,
      attack: ours ? theirAttack : ourAttack,
      format,
      pitch,
      conditions,
      rand,
      target: target ?? undefined,
      overs,
      // Our advantage helps us bat and hurts them; it is the same number seen
      // from either end.
      edge: ours ? edge : 1 / edge,
    })
    return { ...r, ours, label, order: ours ? ourOrder : theirOrder, attack: ours ? theirAttack : ourAttack, target }
  }

  if (format === 'TEST') return test(bat, battedFirst)

  const first = bat(battedFirst, 'FIRST INNINGS', null)
  const second = bat(!battedFirst, 'SECOND INNINGS', first.runs + 1)

  const ours = battedFirst ? first : second
  const theirs = battedFirst ? second : first
  const chasedDown = second.chased
  // Whoever batted second won if they got there; whoever batted first won if
  // they did not.
  const weWon = battedFirst ? !chasedDown : chasedDown
  const by = chasedDown
    ? `by ${10 - second.wickets} wicket${10 - second.wickets === 1 ? '' : 's'}`
    : `by ${first.runs - second.runs} run${first.runs - second.runs === 1 ? '' : 's'}`

  return {
    innings: [first, second],
    ourRuns: ours.runs,
    ourWickets: ours.wickets,
    theirRuns: theirs.runs,
    theirWickets: theirs.wickets,
    outcome: weWon ? 'W' : 'L',
    margin: by,
    battedFirst,
  }
}

/**
 * Five days, four innings, and the very real possibility that nobody wins.
 *
 * A side batting first declares rather than being bowled out for six hundred,
 * and the fourth innings is a chase against a clock as much as an attack —
 * which is why a Test can be drawn and the shorter games cannot.
 */
function test(
  bat: (ours: boolean, label: string, target: number | null, overs?: number) => PlayedInnings,
  battedFirst: boolean,
): PlayedMatch {
  const declare = 145
  const one = bat(battedFirst, 'FIRST INNINGS', null, declare)
  const two = bat(!battedFirst, 'FIRST INNINGS', null, declare)
  const lead = one.runs - two.runs

  // An innings defeat: they followed on and still could not make up the lead.
  const three = bat(battedFirst, 'SECOND INNINGS', null, 120)
  const target = one.runs + three.runs - two.runs + 1
  /*
   * Time, not overs. Whatever is left of the match after three innings is what
   * the fourth gets, and a side can bat out a draw rather than lose.
   */
  const left = Math.max(40, 420 - (one.balls + two.balls + three.balls) / 6)
  const four = bat(!battedFirst, 'SECOND INNINGS', target, Math.round(left))

  const ourRuns = battedFirst ? one.runs + three.runs : two.runs + four.runs
  const theirRuns = battedFirst ? two.runs + four.runs : one.runs + three.runs

  let outcome: 'W' | 'L' | 'D'
  let margin: string
  if (four.chased) {
    outcome = battedFirst ? 'L' : 'W'
    margin = `by ${10 - four.wickets} wicket${10 - four.wickets === 1 ? '' : 's'}`
  } else if (four.wickets >= 10) {
    outcome = battedFirst ? 'W' : 'L'
    const by = target - four.runs
    margin = `by ${by} run${by === 1 ? '' : 's'}`
  } else {
    outcome = 'D'
    margin = 'DRAWN'
  }
  void lead

  return {
    innings: [one, two, three, four],
    ourRuns,
    ourWickets: battedFirst ? one.wickets + three.wickets : two.wickets + four.wickets,
    theirRuns,
    theirWickets: battedFirst ? two.wickets + four.wickets : one.wickets + three.wickets,
    outcome,
    margin,
    battedFirst,
  }
}
