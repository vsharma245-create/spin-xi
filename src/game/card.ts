import { dangerMan, spearhead } from './opponents'
import type {
  BatLine,
  BowlLine,
  Format,
  MatchCard,
  Opponent,
  Outcome,
  PitchType,
  PlayerSeason,
} from './types'
import { PITCH } from './types'

/**
 * Builds the viewable scorecard for a match the simulator has already decided.
 * Nothing here changes a result — it explains one, by spreading the totals over
 * the XI in proportion to what each player is good at, then narrating the
 * numbers that came out. That way the card can never disagree with the score.
 */

// A run out is the one dismissal that can follow runs off the same delivery,
// so it is kept apart: the others all end the ball with the batter scoreless.
const OUT_TYPES = ['b', 'lbw', 'c keeper', 'c mid-off', 'c deep', 'run out', 'st']

const pick = <T,>(list: T[], rand: () => number) => list[Math.floor(rand() * list.length)]

/** Strike rate and over allocation differ wildly by format. */
const TEMPO: Record<Format, { sr: number; overs: number; quota: number }> = {
  T20L: { sr: 142, overs: 20, quota: 4 },
  T20WC: { sr: 136, overs: 20, quota: 4 },
  ODIWC: { sr: 92, overs: 50, quota: 10 },
  TEST: { sr: 56, overs: 90, quota: 22 },
}

/** Splits a total across weights, keeping the sum exact. */
function share(total: number, weights: number[], rand: () => number): number[] {
  const jittered = weights.map((w) => Math.max(1, w * (0.85 + rand() * 0.3)))
  const sum = jittered.reduce((a, b) => a + b, 0)
  const out = jittered.map((w) => Math.round((w / sum) * total))
  // Push the rounding error onto the biggest contributor so totals still tie up.
  const drift = total - out.reduce((a, b) => a + b, 0)
  const top = out.indexOf(Math.max(...out))
  out[top] = Math.max(0, out[top] + drift)
  return out
}

/**
 * How long an innings lasted, in legal deliveries.
 *
 * This is the number everything else on the card is derived from — the overs
 * figure, the balls each batter faced, the overs each bowler sent down. They
 * used to be invented separately, which is how a card could report twenty
 * overs, five bowlers sending down four each, and a batting side that faced
 * ninety-four balls between them. Cricket fixes the deliveries and lets the
 * runs vary; the card now does the same.
 */
function inningsBalls(
  format: Format,
  allOut: boolean,
  chasedDown: boolean,
  rand: () => number,
): number {
  const max = TEMPO[format].overs * 6
  if (format === 'TEST') return Math.round(max * (0.78 + rand() * 0.55))
  // Bowled out with overs to spare.
  if (allOut) return Math.max(48, Math.round(max * (0.62 + rand() * 0.36)))
  // A chase that succeeds ends the moment the target is passed.
  if (chasedDown) return Math.max(Math.round(max * 0.45), Math.round(max * (0.72 + rand() * 0.27)))
  return max
}

/** "18.4" — whole overs and the balls of the one in progress. */
const oversFromBalls = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`


/* ── Innings ─────────────────────────────────────────────────────────────── */

/**
 * One batting card. Only the batters who actually came to the crease appear:
 * a side that loses four wickets used six batters, four out and two unbeaten.
 * That is the rule that stops a scorecard showing five not-outs.
 */
function battingCard(
  order: PlayerSeason[],
  runs: number,
  wickets: number,
  format: Format,
  pitch: PitchType,
  legalBalls: number,
  rand: () => number,
): { lines: BatLine[]; extras: number } {
  const allOut = wickets >= 10
  const used = Math.max(2, Math.min(order.length, allOut ? 11 : wickets + 2))
  const batters = order.slice(0, used)
  // The rest of the eleven still appear, marked as never having batted.
  const didNotBat = order.slice(used, 11)

  const bonus = (p: PlayerSeason) =>
    pitch === 'BATTING' ? p.bat * 1.15 : pitch === 'NEUTRAL' ? p.bat : p.bat * 0.9
  /**
   * Innings are lumpy. Splitting a total evenly across the order would mean
   * nobody ever made a fifty, so each batter draws a form multiplier from a
   * skewed curve: most get a start, one or two go big, someone gets a jaffa.
   */
  const form = () => 0.12 + Math.pow(rand(), 1.9) * 2.7

  // Extras are real runs, so they come out of the total before it is shared.
  const extras = Math.max(0, Math.round(runs * (0.02 + rand() * 0.05)))
  const offBat = Math.max(0, runs - extras)

  const runsBy = share(offBat, batters.map((p) => bonus(p) * form()), rand)
  const sr = TEMPO[format].sr

  /**
   * Balls are shared out, not calculated one batter at a time. Each man has a
   * tempo — a hitter uses fewer deliveries per run than an anchor — but the
   * shares are then scaled so they add up to the deliveries the innings
   * actually lasted. Strike rate is what falls out of runs and balls, rather
   * than something asserted and left to contradict the total.
   */
  const wanted = runsBy.map((r, i) => {
    const rate = sr * (0.7 + (batters[i].bat / 100) * 0.6) * (0.8 + rand() * 0.5)
    return Math.max(1, (r / rate) * 100)
  })
  const wantedSum = wanted.reduce((a, b) => a + b, 0)
  const ballsBy = wanted.map((w) => Math.max(1, Math.round((w / wantedSum) * legalBalls)))
  // Rounding and the one-ball floor both drift; settle up on whoever faced most.
  const drift = legalBalls - ballsBy.reduce((a, b) => a + b, 0)
  const longest = ballsBy.indexOf(Math.max(...ballsBy))
  ballsBy[longest] = Math.max(1, ballsBy[longest] + drift)

  /*
   * Nobody scores more than six off a delivery.
   *
   * Runs and balls were shared out independently, so a batter could come back
   * with three off one — which is legal — or twenty off two, which is not.
   * Any shortfall is taken from whoever faced most, so the innings still
   * lasts exactly as many deliveries as it did.
   */
  for (let i = 0; i < ballsBy.length; i++) {
    const need = Math.ceil(runsBy[i] / 6)
    if (ballsBy[i] >= need) continue
    const owed = need - ballsBy[i]
    const from = ballsBy.indexOf(Math.max(...ballsBy))
    if (from === i || ballsBy[from] - owed < 1) continue
    ballsBy[from] -= owed
    ballsBy[i] += owed
  }

  const lines = batters.map((p, i): BatLine => {
    /*
     * As many batters are out as wickets fell, and not one more.
     *
     * "allOut ||" put every one of the eleven down, so a side bowled out for
     * a hundred showed eleven dismissals against ten wickets — the last man,
     * who is left stranded at the other end, was given an entry too.
     */
    const out = i < wickets
    const runs = runsBy[i]
    const balls = ballsBy[i]
    /*
     * The ball that gets you out is a ball you did not score off — bowled,
     * lbw, caught and stumped all end the delivery. So a dismissal needs the
     * runs to fit in the deliveries before it. Three off one ball and out lbw
     * was on a real card: the one ball he faced was the one that got him, and
     * he had scored three off it.
     *
     * A run out is the exception, because those runs were being run when it
     * happened. Where nothing else fits, that is what it was.
     */
    const fitsBeforeDismissal = runs <= 6 * (balls - 1)
    const how = !out
      ? 'not out'
      : fitsBeforeDismissal
        ? pick(OUT_TYPES, rand)
        : 'run out'
    return { name: p.surname, runs, balls, out, how }
  })

  return {
    lines: [
      ...lines,
      ...didNotBat.map(
        (p): BatLine => ({ name: p.surname, runs: 0, balls: 0, out: false, how: 'DNB', dnb: true }),
      ),
    ],
    extras,
  }
}

/** Bowling figures for the side in the field, weighted by who suits the surface. */
function bowlingCard(
  squad: PlayerSeason[],
  runsConceded: number,
  wickets: number,
  format: Format,
  pitch: PitchType,
  legalBalls: number,
  rand: () => number,
): BowlLine[] {
  const suits = (p: PlayerSeason) =>
    (pitch === 'PACE' && p.role === 'PACE') || (pitch === 'SPIN' && p.role === 'SPIN') ? 1.4 : 1

  const attack = squad
    .filter((p) => p.role === 'PACE' || p.role === 'SPIN' || p.role === 'AR')
    .sort((a, b) => b.bowl * suits(b) - a.bowl * suits(a))
    .slice(0, 5)

  if (!attack.length) return []

  /**
   * Wickets fall in clusters, not in a queue. Sharing them out on bowling
   * rating alone gave every bowler in the attack the same figure — five
   * wickets became one apiece, ten became two apiece — which is a thing that
   * essentially never happens in a real match. The same skewed draw the
   * batting card uses for form applies here: most bowlers get one or none,
   * and somebody runs through the middle order.
   */
  const spell = () => 0.15 + Math.pow(rand(), 1.7) * 2.4
  const wicketsBy = share(wickets, attack.map((p) => p.bowl * suits(p) * spell()), rand)
  // Better bowlers concede fewer runs, so the run share inverts the rating —
  // floored well above zero so no one ends up with an impossible 2 for 1.
  const runsBy = share(
    runsConceded,
    attack.map((p) => Math.max(35, 130 - p.bowl)),
    rand,
  )
  const quota = TEMPO[format].quota

  /**
   * The attack has to get through exactly the overs the batting side faced.
   * Better bowlers are given more of them, nobody may exceed their quota, and
   * the last over is handed to whoever has room — so the bowling figures and
   * the batting figures describe the same innings.
   */
  const target = Math.floor(legalBalls / 6)
  const weights = attack.map((p) => p.bowl * suits(p))
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const oversBy = weights.map((w) => Math.min(quota, Math.max(1, Math.round((w / weightSum) * target))))
  for (let guard = 0; guard < 60; guard++) {
    const total = oversBy.reduce((a, b) => a + b, 0)
    if (total === target) break
    if (total < target) {
      const i = oversBy.findIndex((o) => o < quota)
      if (i === -1) break // not enough bowlers to cover the innings
      oversBy[i]++
    } else {
      const i = oversBy.findIndex((o) => o > 1)
      if (i === -1) break
      oversBy[i]--
    }
  }
  const spare = legalBalls % 6
  /*
   * The unfinished over belongs to somebody with an over left to bowl.
   *
   * It used to go to whoever was last in the list, quota or no quota, which
   * produced 4.4 in a twenty-over game — a bowler with four overs cannot send
   * down four more deliveries. An innings only ends mid-over when it ended
   * early, so somebody is always short of their full allocation.
   */
  const partOver = spare ? oversBy.findIndex((o) => o < quota) : -1

  return attack.map((p, i) => ({
    name: p.surname,
    overs: i === partOver ? `${oversBy[i]}.${spare}` : `${oversBy[i]}`,
    runs: runsBy[i],
    wickets: Math.min(wicketsBy[i], 10),
  }))
}

/** Their batting order: best batters up top, the way a real side lines up. */
const battingOrderOf = (squad: PlayerSeason[]) =>
  [...squad].sort((a, b) => b.bat - a.bat)

/* ── Narrative ───────────────────────────────────────────────────────────── */

function moments(
  bat: BatLine[],
  bowl: BowlLine[],
  o: {
    format: Format
    pitch: PitchType
    outcome: Outcome
    battedFirst: boolean
    ourRuns: number
    theirRuns: number
    margin: string
    opponent: Opponent
    theirBest: string
    theirBestRuns: number
    theirBowler: string
  },
  rand: () => number,
): MatchCard['moments'] {
  const out: MatchCard['moments'] = []
  const short = o.format === 'TEST'
  const topBat = [...bat].sort((a, b) => b.runs - a.runs)[0]
  const topBowl = [...bowl].sort((a, b) => b.wickets - a.wickets)[0]
  const first = o.battedFirst ? 'our' : 'their'

  out.push({
    over: short ? 'DAY 1' : '0.1',
    text: `${PITCH[o.pitch].label} at the toss. ${
      o.battedFirst ? 'We bat first.' : `${o.opponent.short} bat first.`
    }`,
    kind: 'neutral',
  })

  if (first === 'our') {
    out.push({
      over: short ? 'SESS 1' : o.format === 'ODIWC' ? '10.0' : '6.0',
      text:
        topBat.runs > 40
          ? `${topBat.name} takes it on early — ${Math.round(topBat.runs * 0.4)} of the first ${Math.round(o.ourRuns * 0.35)}.`
          : `Tight start. The new ball does enough to keep the scoreboard quiet.`,
      kind: topBat.runs > 40 ? 'good' : 'neutral',
    })
  } else {
    out.push({
      over: short ? 'SESS 1' : o.format === 'ODIWC' ? '10.0' : '6.0',
      text: `${o.theirBest} gets away from us at the top, ${o.theirBestRuns} in a hurry.`,
      kind: 'bad',
    })
  }

  if (o.battedFirst && topBat && topBat.runs < 30) {
    out.push({
      over: short ? 'SESS 2' : '9.3',
      text: `${o.theirBowler} is all over the top order — nothing comes easy.`,
      kind: 'bad',
    })
  }

  if (topBat && topBat.runs >= (short ? 80 : o.format === 'ODIWC' ? 70 : 45)) {
    out.push({
      over: short ? 'SESS 2' : o.format === 'ODIWC' ? '31.4' : '13.2',
      text: `${topBat.name} brings up ${topBat.runs >= 100 ? 'a hundred' : 'a fifty'} off ${Math.round(
        topBat.balls * (topBat.runs >= 100 ? 0.62 : 0.55),
      )} balls.`,
      kind: 'good',
    })
  }

  if (topBowl && topBowl.wickets >= 2) {
    out.push({
      over: short ? 'SESS 3' : o.format === 'ODIWC' ? '38.5' : '16.1',
      text: `${topBowl.name} rips through the middle — ${topBowl.wickets} for ${topBowl.runs}.`,
      kind: 'good',
    })
  } else {
    out.push({
      over: short ? 'SESS 3' : '15.0',
      text: `Wickets are hard to come by. The attack goes searching for a way through.`,
      kind: 'bad',
    })
  }

  out.push({
    over: short ? 'DAY 5' : o.format === 'ODIWC' ? '49.4' : '19.4',
    text:
      o.outcome === 'W'
        ? `Home ${o.margin}. ${pick(['Job done.', 'Never really in doubt.', 'Held our nerve.'], rand)}`
        : o.outcome === 'D'
          ? `Time runs out with the game still alive. ${o.margin}.`
          : `${o.opponent.short} get there ${o.margin}. ${pick(
              ['Too many loose overs.', 'One partnership too many.', 'Came up short.'],
              rand,
            )}`,
    kind: o.outcome === 'W' ? 'good' : o.outcome === 'D' ? 'neutral' : 'bad',
  })

  return out
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export function buildCard(o: {
  xi: PlayerSeason[]
  format: Format
  pitch: PitchType
  outcome: Outcome
  battedFirst: boolean
  ourRuns: number
  ourWickets: number
  theirRuns: number
  theirWickets: number
  opponent: Opponent
  margin: string
  rand: () => number
}): { card: MatchCard; hero: { name: string; line: string } } {
  const { rand, format, pitch } = o
  const theirOrder = battingOrderOf(o.opponent.players)

  // Both innings in full: each side's batting card, and the other side's
  // figures against it. The two always add up to the scoreboard.
  // How long each innings lasted, decided once. A side batting second that
  // wins has chased the target down and stopped there.
  const ourBalls = inningsBalls(
    format,
    o.ourWickets >= 10,
    !o.battedFirst && o.outcome === 'W',
    rand,
  )
  const theirBalls = inningsBalls(
    format,
    o.theirWickets >= 10,
    o.battedFirst && o.outcome === 'L',
    rand,
  )

  const ours = battingCard(o.xi, o.ourRuns, o.ourWickets, format, pitch, ourBalls, rand)
  const theirs = battingCard(theirOrder, o.theirRuns, o.theirWickets, format, pitch, theirBalls, rand)
  const batting = ours.lines
  const theirBatting = theirs.lines
  // Our attack bowled their innings, and theirs bowled ours.
  const bowling = bowlingCard(o.xi, o.theirRuns, o.theirWickets, format, pitch, theirBalls, rand)
  const theirBowling = bowlingCard(
    o.opponent.players, o.ourRuns, o.ourWickets, format, pitch, ourBalls, rand,
  )

  // Their headline performers are read off their own card, so the report and
  // the scorecard name the same player.
  const theirTop = [...theirBatting].sort((a, b) => b.runs - a.runs)[0]
  const theirSpell = [...theirBowling].sort((a, b) => b.wickets - a.wickets)[0]
  const theirBest = theirTop?.name ?? dangerMan(o.opponent).surname
  const theirBowler = theirSpell?.name ?? spearhead(o.opponent).surname
  const theirBestRuns = theirTop?.runs ?? Math.round(o.theirRuns * 0.3)

  const topBat = [...batting].sort((a, b) => b.runs - a.runs)[0]
  const topBowl = [...bowling].sort((a, b) => b.wickets * 40 - b.runs - (a.wickets * 40 - a.runs))[0]

  // The hero is whoever did more: a big score, or a spell that broke the game.
  // A three-for is worth about a seventy, and an expensive spell counts for less.
  const batScore = topBat ? topBat.runs : 0
  const bowlScore = topBowl ? topBowl.wickets * 25 - topBowl.runs / 5 : 0
  const hero =
    bowlScore > batScore && topBowl
      ? { name: topBowl.name, line: `${topBowl.wickets}/${topBowl.runs}` }
      : topBat
        ? { name: topBat.name, line: `${topBat.runs}${topBat.out ? '' : '*'} (${topBat.balls})` }
        : { name: '—', line: '—' }

  const card: MatchCard = {
    ourScore: {
      runs: o.ourRuns,
      wickets: o.ourWickets,
      overs: oversFromBalls(ourBalls),
    },
    theirScore: {
      runs: o.theirRuns,
      wickets: o.theirWickets,
      overs: oversFromBalls(theirBalls),
    },
    batting,
    bowling,
    theirBatting,
    theirBowling,
    ourExtras: ours.extras,
    theirExtras: theirs.extras,
    moments: moments(batting, bowling, { ...o, theirBest, theirBestRuns, theirBowler }, rand),
    summary:
      o.outcome === 'D'
        ? `Drawn · ${hero.name} ${hero.line}`
        : `${o.outcome === 'W' ? 'Won' : 'Lost'} ${o.margin} · ${hero.name} ${hero.line}`,
    theirBest: `${theirBest} ${theirBestRuns}`,
    theirRating: o.opponent.ratings.ovr,
    theirSquad: `${o.opponent.short} ${o.opponent.season}`,
  }

  return { card, hero }
}
