import type { BatLine, BowlLine, MatchCard, MatchResult } from './types'

/**
 * Turning a finished scorecard back into the innings that produced it.
 *
 * The simulation decides a result and the card spreads it across the eleven,
 * which is enough to read afterwards and nothing at all to watch. A score of
 * 186/4 appeared in one frame; the final of a tournament took less time to
 * play than a single group game took to animate.
 *
 * So the card is replayed. Every delivery here is derived from the card and
 * only from the card: the partnerships come from the balls each batter faced,
 * the runs come from what each of them scored, and the wickets fall where the
 * batting order says they fell. Nothing is invented that the card did not
 * already contain, which is why the innings can be reconstructed anywhere —
 * on a shared result days later, from nothing but the stored card — without
 * a single ball needing to be saved.
 *
 * The one thing it adds is a clock.
 */

/** A ball as a scorer would write it down. */
export interface Delivery {
  /** Over this belongs to, 0-indexed. */
  over: number
  /** How many legal deliveries had been bowled before this one. */
  ballsBefore: number
  /** False for wides and no-balls, which do not advance the over. */
  legal: boolean
  /** Everything added to the total off this delivery, extras included. */
  runs: number
  /** The part of it credited to the batter. */
  batRuns: number
  extra: 'wd' | 'nb' | 'b' | 'lb' | null
  /** Index into the batting card of whoever was facing. */
  striker: number
  nonStriker: number
  bowler: string
  /** Which bowler, by position in the card — surnames are not unique. */
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

/* ── A deterministic stream, seeded from the card itself ─────────────────── */

const mulberry = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * The seed is the card. Two viewers opening the same shared result must watch
 * the same innings, and neither of them has anything but the card to go on —
 * so the card is what it is derived from.
 */
export function seedOf(inn: { batting: BatLine[]; score: { runs: number; wickets: number } }): number {
  let h = 0x811c9dc5
  const eat = (s: string) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  }
  eat(`${inn.score.runs}/${inn.score.wickets}`)
  for (const b of inn.batting) eat(`${b.name}${b.runs}${b.balls}${b.out ? 1 : 0}${b.dnb ? 'd' : ''}`)
  return h >>> 0
}

const ballsOf = (overs: string) => {
  const [o, b] = overs.split('.')
  return Number(o) * 6 + Number(b ?? 0)
}

export const oversOf = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`

/* ── Who is bowling ──────────────────────────────────────────────────────── */

/**
 * A believable rotation over the overs each bowler is down for.
 *
 * The card fixes how many overs each of them sends down; what it cannot say is
 * when. Cricket's one hard rule is that nobody bowls consecutive overs, and
 * its one strong habit is that the best bowlers open and come back at the end.
 */
function rotation(lines: BowlLine[], overs: number, rand: () => number): number[] {
  if (!lines.length) return Array.from({ length: overs }, () => -1)
  const left = lines.map((l) => Math.ceil(ballsOf(l.overs) / 6))
  const out: number[] = []
  let previous = -1
  for (let o = 0; o < overs; o++) {
    // Whoever has most left and did not bowl the last over. Ties broken by the
    // order the card lists them, which is strongest first.
    let pick = -1
    let best = -1
    for (let i = 0; i < lines.length; i++) {
      if (i === previous || left[i] <= 0) continue
      const weight = left[i] * 10 + (lines.length - i) + rand() * 3
      if (weight > best) {
        best = weight
        pick = i
      }
    }
    // Everyone else is bowled out: the rule bends before the innings stops.
    if (pick === -1) pick = left.findIndex((n) => n > 0)
    if (pick === -1) pick = 0
    left[pick]--
    out.push(pick)
    previous = pick
  }
  return out
}

/* ── How one batter's innings was actually scored ────────────────────────── */

/*
 * A five belongs here even though almost nobody ever runs one. Leave it out
 * and a batter needing five off his last delivery has no legal shot to play:
 * four is not enough and six is too many, and the innings cannot be made to
 * add up. Overthrows and a four off the pads with one run to the striker are
 * how it happens in the middle, and it is weighted like the rarity it is.
 */
const VALUES = [0, 1, 2, 3, 4, 5, 6] as const

/** What a delivery is worth when nobody is trying to force anything. */
const BASE = [0.4, 0.295, 0.085, 0.011, 0.135, 0.00004, 0.074]

/**
 * One delivery, drawn so that the average comes out where it is wanted.
 *
 * The natural spread of scoring shots is tilted by a single number until its
 * mean is the rate being asked for, which is the least-assuming distribution
 * that hits a target — the shape of cricket is kept and only the gear changes.
 * Fixed weights could not do this: they scored at their own rate regardless of
 * what the innings needed, ran ahead of the total, and left the last third of
 * every innings blocking out dots to get back down to it.
 */
function draw(min: number, max: number, want: number, rand: () => number): number {
  const allowed: number[] = []
  for (let k = 0; k < VALUES.length; k++) if (VALUES[k] >= min && VALUES[k] <= max) allowed.push(k)
  if (allowed.length === 1) return VALUES[allowed[0]]

  const lo = VALUES[allowed[0]]
  const hi = VALUES[allowed[allowed.length - 1]]
  const target = Math.min(hi - 1e-6, Math.max(lo + 1e-6, want))

  const meanAt = (theta: number) => {
    let top = 0
    let sum = 0
    for (const k of allowed) {
      const w = BASE[k] * Math.exp(theta * VALUES[k])
      top += w * VALUES[k]
      sum += w
    }
    return top / sum
  }
  let a = -9
  let b = 9
  for (let i = 0; i < 26; i++) {
    const mid = (a + b) / 2
    if (meanAt(mid) < target) a = mid
    else b = mid
  }
  const theta = (a + b) / 2

  let sum = 0
  const weights = allowed.map((k) => {
    const w = BASE[k] * Math.exp(theta * VALUES[k])
    sum += w
    return w
  })
  let roll = rand() * sum
  for (let i = 0; i < allowed.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return VALUES[allowed[i]]
  }
  return VALUES[allowed[allowed.length - 1]]
}

/**
 * Where in the innings a delivery falls, and what that does to the tempo.
 *
 * Twenty overs are not twenty of the same over. The field is up for six, back
 * for ten and the last four are a fight. A Test has no such shape and is left
 * alone.
 */
function phase(fraction: number, total: number): number {
  if (total > 380) return 1
  const f = Math.min(1, Math.max(0, fraction))
  const power = f < 0.3 ? 0.14 * (1 - f / 0.3) : 0
  return 0.84 + power + 0.95 * Math.pow(f, 3)
}

/**
 * A batter's runs, laid out ball by ball, adding up to exactly what they made.
 *
 * Each delivery aims at the rate still required — what is left over what is
 * left to face — bent by two things. Nobody arrives already set, so the first
 * few balls go at less than the asking rate and the innings has to make it up
 * later, which is what playing yourself in looks like from the scorers' box.
 * And the asking rate itself is read against where the innings has got to, so
 * a batter who is still there at the death goes at the death.
 */
function scoring(
  runs: number,
  balls: number,
  rand: () => number,
  span: { from: number; to: number; total: number },
): number[] {
  const seq: number[] = []
  let left = runs
  const heat = balls > 0 ? runs / balls : 0
  /*
   * The quick players need two balls to look at it and the anchors need
   * twenty — but only if there is an innings left to bat. A man who walks in
   * for the last over has nowhere to build to, and leaving him a settling
   * period turned the twentieth over into the quietest of the twenty.
   */
  const arrive = span.total > 0 ? span.from / span.total : 0
  const room = span.total > 380 ? 1 : Math.max(0.12, 1 - arrive)
  const settle = Math.min(
    balls,
    Math.max(1, Math.round(balls * (heat > 1.3 ? 0.1 : 0.28) * room)),
  )

  for (let i = 0; i < balls; i++) {
    const after = balls - i - 1
    const min = Math.max(0, left - 6 * after)
    const max = Math.min(6, left)
    const need = left / (after + 1)
    const inning = balls > 1 ? span.from + ((span.to - span.from) * i) / (balls - 1) : span.from
    const settling = 0.55 + 0.45 * Math.min(1, i / settle)
    // Lumpy on purpose: an over of one and two is not an over of three.
    const noise = 0.72 + rand() * 0.56
    let shot = draw(min, max, need * settling * phase(inning / span.total, span.total) * noise, rand)
    /*
     * Never leave five to get off the last delivery.
     *
     * Five is the one total a batter cannot make off a ball he middles, so a
     * sequence that walks into it has to score one — and the innings ended up
     * with a four-overthrow scramble every third over. Backing off a single
     * run here leaves six to get instead, which is a shot that exists.
     */
    if (after === 1 && left - shot === 5) {
      if (shot - 1 >= min) shot -= 1
      else if (shot + 1 <= max) shot += 1
    }
    seq.push(shot)
    left -= shot
  }
  // The bounds make this unreachable; the innings must still add up if it is.
  if (left !== 0 && seq.length) seq[seq.length - 1] = Math.max(0, seq[seq.length - 1] + left)
  return seq
}

/* ── The innings ─────────────────────────────────────────────────────────── */

export interface Innings {
  deliveries: Delivery[]
  frames: Frame[]
  /** Figures read off the deliveries, so the card and the replay agree. */
  bowling: BowlLine[]
  batting: BatLine[]
  runs: number
  wickets: number
  balls: number
  overs: string
  /** What the card said, kept alongside so the two can be compared. */
  score: { runs: number; wickets: number; overs: string }
  /** Byes, wides and no-balls, as the card had them. */
  extras: number
}

/**
 * Replay one innings.
 *
 * The shape is fixed before a ball is bowled. The card says which batters were
 * out and how many deliveries each of them faced, and because a card only ever
 * dismisses batters in the order they are listed, that is enough to recover
 * every partnership: the first two are together until the first falls, then
 * the second and the third, and so on down. Splitting each new batter's balls
 * between the partnership they walked into and the one they were left with
 * fixes the length of every stand — and those lengths necessarily add back up
 * to the innings, because they are the same deliveries counted a second way.
 */
export function playInnings(
  inn: { batting: BatLine[]; bowling: BowlLine[]; score: { runs: number; wickets: number; overs: string }; extras: number },
  seedIn?: number,
): Innings {
  const rand = mulberry(seedIn ?? seedOf(inn))
  const batters = inn.batting.filter((b) => !b.dnb)
  const nBat = batters.length
  const deliveries: Delivery[] = []

  if (nBat < 2) {
    return { deliveries: [], frames: [], bowling: inn.bowling, batting: inn.batting, runs: inn.score.runs, wickets: inn.score.wickets, balls: 0, overs: inn.score.overs, score: inn.score, extras: inn.extras }
  }

  const legalBalls = batters.reduce((a, b) => a + b.balls, 0)
  const totalOvers = Math.max(1, Math.ceil(legalBalls / 6))
  const bowlers = rotation(inn.bowling, totalOvers, rand)

  /*
   * The split, walked forward down the order. `u[k]` is what the older batter
   * faced in the stand and `v[k]` what the newcomer faced; the newcomer keeps
   * whatever is left for the stand after, so nothing is double counted and
   * nothing is lost. The older batter is always left at least one delivery,
   * because the one they are out to has to be a ball they faced.
   */
  const u: number[] = new Array(nBat).fill(0)
  const v: number[] = new Array(nBat).fill(0)
  u[0] = batters[0].balls
  for (let k = 0; k + 2 < nBat; k++) {
    const share = 0.3 + rand() * 0.45
    v[k] = Math.min(batters[k + 1].balls - 1, Math.max(0, Math.round(batters[k + 1].balls * share)))
    u[k + 1] = batters[k + 1].balls - v[k]
  }
  v[nBat - 2] = batters[nBat - 1].balls

  /*
   * Where every stand begins and ends, in deliveries. A batter's innings runs
   * from the start of the stand he walked into to the end of the one he was
   * out in, which is what tells him whether he is batting in the powerplay or
   * the last over.
   */
  const startsAt: number[] = []
  const endsAt: number[] = []
  let mark = 0
  for (let k = 0; k + 1 < nBat; k++) {
    if (k === 0) {
      startsAt[0] = 0
      startsAt[1] = 0
    } else startsAt[k + 1] = mark
    mark += u[k] + v[k]
    endsAt[k] = mark
  }
  endsAt[nBat - 1] = legalBalls

  /* Each batter's runs, ball by ball, with the dismissal delivery kept blank. */
  const facedSoFar = new Array(nBat).fill(0)
  const runSeq = batters.map((b, i) => {
    const scoresOffLast = !b.out || b.how === 'run out'
    const scored = scoresOffLast ? b.balls : b.balls - 1
    const seq = scoring(b.runs, Math.max(0, scored), rand, {
      from: startsAt[i] ?? 0,
      to: endsAt[i] ?? legalBalls,
      total: Math.max(1, legalBalls),
    })
    if (!scoresOffLast) seq.push(0)
    return seq
  })

  /*
   * Where the extras happen, decided before a ball is bowled.
   *
   * Sprinkling them as the innings ran left whatever had not been placed to be
   * dumped on the final delivery, and a scoreboard reading twelve leg byes off
   * one ball is not a scoreboard anybody believes. Planned up front they add up
   * by construction, and the last ball of the innings is just a ball.
   *
   * A bye needs a delivery the batter did not score from. Where the plan lands
   * one on a ball that was hit, it is bowled as a wide instead — which needs no
   * such permission, because it is not a delivery at all.
   */
  const planned = new Map<number, { kind: 'wd' | 'nb' | 'b' | 'lb'; runs: number }[]>()
  {
    let owed = inn.extras
    let guard = 0
    while (owed > 0 && guard++ < 400) {
      const at = Math.floor(rand() * legalBalls)
      const roll = rand()
      const kind = roll < 0.46 ? 'wd' : roll < 0.58 ? 'nb' : roll < 0.74 ? 'b' : 'lb'
      const size = rand()
      const give = Math.min(owed, size < 0.74 ? 1 : size < 0.88 ? 2 : size < 0.97 ? 4 : 5)
      owed -= give
      const list = planned.get(at) ?? []
      list.push({ kind, runs: give })
      planned.set(at, list)
    }
    // Anything the draw could not place goes on as single wides, one a ball.
    for (let at = 0; owed > 0; at = (at + 7) % Math.max(1, legalBalls)) {
      const list = planned.get(at) ?? []
      list.push({ kind: 'wd', runs: 1 })
      planned.set(at, list)
      owed--
    }
  }

  let runs = 0
  let wickets = 0
  let balls = 0

  const push = (d: Delivery) => {
    deliveries.push(d)
    runs += d.runs
    if (d.legal) balls++
    if (d.wicket) wickets++
  }

  const bowlerFor = () => bowlers[Math.min(Math.floor(balls / 6), bowlers.length - 1)] ?? -1
  const nameOf = (i: number) => inn.bowling[i]?.name ?? '—'

  for (let k = 0; k + 1 < nBat; k++) {
    const older = k
    const younger = k + 1
    let leftOlder = u[k]
    let leftYounger = v[k]
    // The stand ends on a wicket unless it is the one still going at the close.
    const breaks = older < inn.score.wickets
    let striker = leftOlder > 0 ? older : younger

    /*
     * A batter cannot be bowled from the other end, so where the stand ends in
     * anything but a run out the outgoing batter has to be the one facing. One
     * of their deliveries is held back for it and spent last; the rest of the
     * stand is played out of what is left. A run out needs no such reservation,
     * because it can happen to either of them at either end.
     */
    const reserved = breaks && batters[older].how !== 'run out' ? 1 : 0

    while (leftOlder + leftYounger > 0) {
      const spendable = leftOlder - reserved
      // With balls left at both ends the striker simply stays as they were;
      // the two tests here are the only things that can override that.
      if (leftYounger === 0) striker = older
      else if (spendable <= 0) striker = younger

      const seq = runSeq[striker]
      const scored = seq[facedSoFar[striker]] ?? 0
      facedSoFar[striker]++
      if (striker === older) leftOlder--
      else leftYounger--

      let extra: Delivery['extra'] = null
      let extraRuns = 0
      for (const e of planned.get(balls) ?? []) {
        const offTheBall = (e.kind === 'b' || e.kind === 'lb') && scored === 0 && !extra
        if (offTheBall) {
          extra = e.kind
          extraRuns = e.runs
          continue
        }
        // Its own delivery: the over does not move on for it.
        push({
          over: Math.floor(balls / 6),
          ballsBefore: balls,
          legal: false,
          runs: e.runs,
          batRuns: 0,
          extra: e.kind === 'nb' ? 'nb' : 'wd',
          striker,
          nonStriker: striker === older ? younger : older,
          bowler: nameOf(bowlerFor()),
          bowlerIdx: bowlerFor(),
          wicket: null,
        })
      }

      const out = breaks && leftOlder + leftYounger === 0
      const bowler = bowlerFor()
      push({
        over: Math.floor(balls / 6),
        ballsBefore: balls,
        legal: true,
        runs: scored + extraRuns,
        batRuns: scored,
        extra,
        striker,
        nonStriker: striker === older ? younger : older,
        bowler: nameOf(bowler),
        bowlerIdx: bowler,
        wicket: out
          ? {
              batter: batters[older].name,
              how: batters[older].how,
              bowler: batters[older].how === 'run out' ? null : bowler,
            }
          : null,
      })

      // Strike changes on the odd runs, and stays otherwise — with enough
      // slack that a batter is not marooned at the wrong end for an hour.
      const swap = scored % 2 === 1 ? rand() < 0.94 : rand() < 0.24
      if (swap) striker = striker === older ? younger : older
    }
  }

  return {
    deliveries,
    frames: framesOf(deliveries, batters),
    bowling: figuresFrom(deliveries, inn.bowling),
    batting: inn.batting,
    runs,
    wickets,
    balls,
    overs: oversOf(balls),
    score: inn.score,
    extras: inn.extras,
  }
}

/* ── Reading the scoreboard off the deliveries ───────────────────────────── */

const beadOf = (d: Delivery): Bead => {
  if (d.wicket) return { label: 'W', kind: 'wicket' }
  if (d.extra === 'wd') return { label: d.runs > 1 ? `${d.runs}wd` : 'wd', kind: 'extra' }
  if (d.extra === 'nb') return { label: 'nb', kind: 'extra' }
  if (d.extra === 'b' || d.extra === 'lb') return { label: `${d.runs - d.batRuns}${d.extra}`, kind: 'extra' }
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
      fell: d.wicket ? { batter: d.wicket.batter, how: d.wicket.how, score: `${runs}/${wickets}` } : null,
      delivery: d,
    }
  })
}

/**
 * The bowling card, read off the replay rather than shared out beside it.
 *
 * Each bowler keeps the overs the card gave them — that is where the quotas
 * and the conditions live — but the runs and the wickets are now whatever
 * actually happened while they were bowling. A four in the eighteenth over is
 * conceded by the man who bowled the eighteenth over.
 */
function figuresFrom(deliveries: Delivery[], lines: BowlLine[]): BowlLine[] {
  if (!lines.length) return lines
  const tally = lines.map(() => ({ runs: 0, wickets: 0 }))
  for (const d of deliveries) {
    const t = tally[d.bowlerIdx]
    if (!t) continue
    t.runs += d.extra === 'b' || d.extra === 'lb' ? d.batRuns : d.runs
    if (d.wicket?.bowler === d.bowlerIdx) t.wickets++
  }
  return lines.map((l, i) => ({ ...l, runs: tally[i].runs, wickets: tally[i].wickets }))
}

/* ── A whole match ───────────────────────────────────────────────────────── */

export interface PlayedInnings extends Innings {
  ours: boolean
  label: string
  /** Set on the second innings of a limited-overs game. */
  target: number | null
  battingName: string
  bowlingName: string
}

/**
 * Both innings of a match in the order they were played, each one ready to
 * watch. Tests carry their own four-innings card; the shorter formats have
 * one each way, and who batted first is the only thing that decides the order.
 */
export function playMatchCard(m: MatchResult, teamName: string): PlayedInnings[] {
  const c: MatchCard = m.card
  const them = m.opponent

  const build = (
    inn: { batting: BatLine[]; bowling: BowlLine[]; score: { runs: number; wickets: number; overs: string }; extras: number },
    ours: boolean,
    label: string,
    target: number | null,
  ): PlayedInnings => ({
    ...playInnings(inn),
    ours,
    label,
    target,
    battingName: ours ? teamName : them,
    bowlingName: ours ? them : teamName,
  })

  if (c.innings?.length) {
    // A Test card already knows its own order, and its own follow-ons.
    return c.innings.map((i, idx) =>
      build(
        { batting: i.batting, bowling: i.bowling, score: i.score, extras: i.extras },
        i.ours,
        i.label,
        idx === c.innings!.length - 1 && idx >= 3 ? c.innings![idx - 1].score.runs + 1 : null,
      ),
    )
  }

  const ours = {
    batting: c.batting,
    // `bowling` on the card is our attack in their innings; theirs is in ours.
    bowling: c.theirBowling,
    score: c.ourScore,
    extras: c.ourExtras,
  }
  const theirs = {
    batting: c.theirBatting,
    bowling: c.bowling,
    score: c.theirScore,
    extras: c.theirExtras,
  }

  return m.battedFirst
    ? [
        build(ours, true, 'FIRST INNINGS', null),
        build(theirs, false, 'SECOND INNINGS', c.ourScore.runs + 1),
      ]
    : [
        build(theirs, false, 'FIRST INNINGS', null),
        build(ours, true, 'SECOND INNINGS', c.theirScore.runs + 1),
      ]
}

/**
 * Read every bowling card in a match off its own replay.
 *
 * The figures used to be shared out beside the innings rather than taken from
 * it: runs went to the bowlers in inverse proportion to how good they were and
 * wickets were drawn from a skewed curve, so nobody's four-for belonged to any
 * particular over. Now the man who bowled the eighteenth is the man who went
 * for sixteen in it, and the replay and the scorecard cannot disagree, because
 * one is read off the other.
 *
 * The overs each of them sent down are left exactly as the card set them —
 * that is where the quotas and the conditions live.
 */
export function reconcile(card: MatchCard): MatchCard {
  const fix = (
    batting: BatLine[],
    bowling: BowlLine[],
    score: { runs: number; wickets: number; overs: string },
    extras: number,
  ) => playInnings({ batting, bowling, score, extras }).bowling

  if (card.innings?.length) {
    return {
      ...card,
      innings: card.innings.map((i) => ({ ...i, bowling: fix(i.batting, i.bowling, i.score, i.extras) })),
    }
  }
  return {
    ...card,
    // `theirBowling` are the figures their attack took in our innings, so it is
    // our batting card that decides them — and the other way round.
    theirBowling: fix(card.batting, card.theirBowling, card.ourScore, card.ourExtras),
    bowling: fix(card.theirBatting, card.bowling, card.theirScore, card.theirExtras),
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
const FIVE = ['Four overthrows, and five off the ball.', 'Five — misfield at the rope and they came back.']

/**
 * A line for the delivery just bowled, chosen from the delivery itself so the
 * same ball is always described the same way — a shared result read twice must
 * not tell two different stories.
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
  if (d.extra === 'b' || d.extra === 'lb') return `${d.runs - d.batRuns} ${d.extra === 'b' ? 'bye' : 'leg bye'}${d.runs - d.batRuns > 1 ? 's' : ''}.`
  if (d.batRuns === 6) return of(SIX)
  if (d.batRuns === 5) return of(FIVE)
  if (d.batRuns === 4) return of(FOUR)
  if (d.batRuns === 3) return of(THREE)
  if (d.batRuns === 2) return of(TWO)
  if (d.batRuns === 1) return of(ONE)
  return of(DOT)
}
