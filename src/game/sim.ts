import { buildCard } from './card'
import { clamp, teamRatings, xiOf } from './draft'
import { fixtureList, opponentPool } from './opponents'
import { PITCH, scoreOf, TOURNAMENTS, tierOf } from './types'
import type {
  DraftConfig,
  DraftMode,
  Format,
  MatchResult,
  Opponent,
  Outcome,
  PitchType,
  PlayerSeason,
  RatingMode,
  Slot,
  TableRow,
  TeamRatings,
  TournamentResult,
} from './types'

/* ── Scoring profiles ────────────────────────────────────────────────────── */

interface Profile {
  par: number
  batWeight: number
  spread: number
  lo: number
  hi: number
}

const PROFILE: Record<Format, Profile> = {
  T20L: { par: 165, batWeight: 2.2, spread: 44, lo: 96, hi: 248 },
  T20WC: { par: 158, batWeight: 2.1, spread: 42, lo: 90, hi: 240 },
  ODIWC: { par: 285, batWeight: 3.4, spread: 70, lo: 150, hi: 412 },
  TEST: { par: 380, batWeight: 4.6, spread: 130, lo: 150, hi: 640 },
}

export const PITCH_TYPES: PitchType[] = ['BATTING', 'PACE', 'SPIN', 'NEUTRAL']

export const strengthOf = (r: TeamRatings) =>
  r.ovr * 0.5 + r.batting * 0.2 + r.bowling * 0.2 + r.balance * 0.1

/**
 * Head-to-head odds. Every match is played against a real side with its own
 * ratings, so what matters is the gap between the two teams rather than an
 * abstract measure of how good you are.
 */
/**
 * How much a rating advantage is worth, by format.
 *
 * Cricket does not convert superiority into results at a fixed rate. A T20 is
 * decided by a couple of overs and the better side loses all the time — no
 * team in any league wins eighty per cent of its games. A Test gives quality
 * five days to assert itself and far fewer places to hide.
 *
 * The slope used to be a flat 0.03 with a ceiling of 0.9, which turned a
 * twelve-point edge into a formality: an all-time XI went through a T20
 * season winning six matches in seven, and a third of its fixtures were
 * pinned at the ceiling before a ball was bowled.
 */
const EDGE_WEIGHT: Record<Format, { slope: number; ceiling: number }> = {
  T20L: { slope: 0.014, ceiling: 0.8 },
  T20WC: { slope: 0.014, ceiling: 0.8 },
  ODIWC: { slope: 0.016, ceiling: 0.82 },
  TEST: { slope: 0.024, ceiling: 0.86 },
}

export const winProbability = (edge: number, format: Format = 'T20L') => {
  const { slope, ceiling } = EDGE_WEIGHT[format]
  return clamp(0.5 + edge * slope, 1 - ceiling, ceiling)
}

/** Evenly matched Test sides run out of time; mismatches produce results. */
const drawProbability = (edge: number) => clamp(0.36 - Math.abs(edge) * 0.012, 0.08, 0.38)

/** Chasing is easier when the ball is doing something; batting first suits flat decks. */
export const favoursBatting = (pitch: PitchType) => pitch === 'BATTING' || pitch === 'NEUTRAL'

/* ── Attack profile ──────────────────────────────────────────────────────── */

/** How good the XI's pace and spin attacks are — the pitch decides which counts. */
export function attackOf(slots: Slot[]) {
  const xi = xiOf(slots)
  const top = (role: string, n: number) =>
    xi
      .filter((p) => p.role === role || p.alt.includes(role as never))
      .sort((a, b) => b.bowl - a.bowl)
      .slice(0, n)
      .map((p) => p.bowl)
  const mean = (ns: number[], fallback: number) =>
    ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : fallback
  return {
    pace: mean(top('PACE', 2), 60),
    spin: mean(top('SPIN', 2), 60),
  }
}

/**
 * Effective strength on a given surface. A spin-heavy XI is a monster on a
 * turner and ordinary on a green deck — this is where team balance earns out.
 */
export function strengthOnPitch(
  base: number,
  ratings: TeamRatings,
  attack: { pace: number; spin: number },
  pitch: PitchType,
) {
  switch (pitch) {
    case 'BATTING':
      return base + (ratings.batting - 82) * 0.2 - (ratings.bowling - 82) * 0.08
    case 'PACE':
      return base + (attack.pace - 82) * 0.18
    case 'SPIN':
      return base + (attack.spin - 82) * 0.18
    default:
      return base
  }
}

/* ── Net run rate ────────────────────────────────────────────────────────── */

/**
 * Net run rate, as cricket actually computes it: the rate you scored at across
 * a tournament, less the rate you conceded at.
 *
 * It used to be a formula on the win column — wins above half, times a
 * constant, plus noise — which meant two sides on the same record had the same
 * net run rate give or take a coin toss, and a side that won narrowly six times
 * ranked level with one that won by ninety. It is the tie-break that decides
 * who reaches a knockout, so it has to come from runs.
 *
 * The rule that catches people out: a side bowled out is charged the **full
 * quota** of overs, not the overs it survived. Collapsing for 90 in twelve
 * overs counts as 90 off twenty, which is what makes being dismissed cheaply so
 * expensive here.
 */
export interface RunRateLine {
  runsFor: number
  ballsFaced: number
  runsAgainst: number
  ballsBowled: number
}

const blankRate = (): RunRateLine => ({ runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0 })

/** "18.4" → 112 deliveries. */
const ballsOf = (overs: string): number => {
  const [o, b] = overs.split('.').map(Number)
  return (o || 0) * 6 + (b || 0)
}

/** An innings costs its full quota once the tenth wicket falls. */
const chargedBalls = (balls: number, wickets: number, quota: number) =>
  wickets >= 10 ? quota : Math.min(balls, quota)

export function netRunRate(line: RunRateLine): number {
  if (!line.ballsFaced || !line.ballsBowled) return 0
  const scored = (line.runsFor / line.ballsFaced) * 6
  const conceded = (line.runsAgainst / line.ballsBowled) * 6
  return Math.round((scored - conceded) * 1000) / 1000
}

/** The player's own rate, read off the scorecards the tournament produced. */
export function rateFromMatches(matches: MatchResult[], format: Format): RunRateLine {
  const quota = TOURNAMENTS[format].overs * 6
  const line = blankRate()
  for (const m of matches) {
    const ours = m.card.ourScore
    const theirs = m.card.theirScore
    line.runsFor += ours.runs
    line.ballsFaced += chargedBalls(ballsOf(ours.overs), ours.wickets, quota)
    line.runsAgainst += theirs.runs
    line.ballsBowled += chargedBalls(ballsOf(theirs.overs), theirs.wickets, quota)
  }
  return line
}

/* ── Season score ────────────────────────────────────────────────────────── */

/**
 * What a season is worth on a ladder.
 *
 * Ranking on wins alone produces a table of ties: a fourteen-game league has
 * fifteen possible records, so hundreds of players share one, and the order
 * inside a tie is decided by whatever the sort happens to do. It also says
 * nothing about *how* a season was won — a side that ground out nine wins by
 * two runs ranks level with one that won nine by seventy.
 *
 * So the score is built from the three things a cricket season actually
 * produces: results, runs and wickets. Results dominate, because winning is
 * the point; runs and wickets separate sides that won the same number, and
 * they are granular enough that two players almost never land on the same
 * total.
 *
 * The run rate is scaled per format so a par innings is worth about the same
 * everywhere — 165 in a T20, 285 in a one-dayer and 380 in a Test are the same
 * achievement, and a Test batter should not out-rank a T20 one for playing a
 * longer format.
 */

export interface SeasonScore {
  points: number
  runs: number
  wickets: number
  wins: number
  draws: number
}

/**
 * Read off the scorecards, not modelled: runs scored are the totals your side
 * posted, wickets taken are the ones that fell to it. Both already reconcile
 * with the scoreboard, so the score cannot drift from the season it describes.
 */
export function seasonScore(matches: MatchResult[], format: Format): SeasonScore {
  let runs = 0
  let wickets = 0
  let wins = 0
  let draws = 0
  for (const m of matches) {
    runs += m.card.ourScore.runs
    wickets += m.card.theirScore.wickets
    if (m.outcome === 'W') wins++
    else if (m.outcome === 'D') draws++
  }
  return { points: scoreOf(format, { wins, draws, runs, wickets }), runs, wickets, wins, draws }
}

/* ── Match generation ────────────────────────────────────────────────────── */

/** How many sides share the table with you, your own XI included. */
const FIELD_SIZE: Record<Format, number> = { T20L: 10, ODIWC: 10, T20WC: 8, TEST: 9 }

/** Top four make the playoffs everywhere except the Test final, which is top two. */
export const qualifyCutoff = (format: Format) => (format === 'TEST' ? 2 : 4)

interface Scores {
  ourRuns: number
  ourWickets: number
  theirRuns: number
  theirWickets: number
  margin: string
}

function limitedOversScores(
  outcome: Outcome,
  ratings: TeamRatings,
  format: Format,
  pitch: PitchType,
  battedFirst: boolean,
  rand: () => number,
): Scores {
  const p = PROFILE[format]
  const pitchRuns = pitch === 'BATTING' ? 1.12 : pitch === 'NEUTRAL' ? 1 : 0.9
  const ourPar = (p.par + (ratings.batting - 80) * p.batWeight) * pitchRuns
  const theirPar = (p.par + (85 - ratings.bowling) * p.batWeight * 0.8) * pitchRuns
  const jitter = () => (rand() - 0.5) * p.spread
  const won = outcome === 'W'

  if (battedFirst) {
    const ourRuns = Math.round(clamp(ourPar + jitter(), p.lo, p.hi))
    if (won) {
      const by = 4 + Math.floor(rand() * (format === 'ODIWC' ? 90 : 46))
      return {
        ourRuns,
        ourWickets: 3 + Math.floor(rand() * 5),
        theirRuns: Math.max(Math.round(p.lo * 0.6), ourRuns - by),
        theirWickets: 6 + Math.floor(rand() * 5),
        margin: `by ${by} run${by === 1 ? '' : 's'}`,
      }
    }
    const w = 1 + Math.floor(rand() * 6)
    return {
      ourRuns,
      ourWickets: 6 + Math.floor(rand() * 5),
      theirRuns: ourRuns + 1 + Math.floor(rand() * 9),
      theirWickets: 10 - w,
      margin: `by ${w} wicket${w === 1 ? '' : 's'}`,
    }
  }

  const theirRuns = Math.round(clamp(theirPar + jitter(), p.lo, p.hi))
  if (won) {
    const w = 1 + Math.floor(rand() * 7)
    return {
      ourRuns: theirRuns + 1 + Math.floor(rand() * 9),
      ourWickets: 10 - w,
      theirRuns,
      theirWickets: 5 + Math.floor(rand() * 5),
      margin: `by ${w} wicket${w === 1 ? '' : 's'}`,
    }
  }
  const short = 3 + Math.floor(rand() * (format === 'ODIWC' ? 70 : 34))
  return {
    ourRuns: Math.max(50, theirRuns - short),
    ourWickets: 10,
    theirRuns,
    theirWickets: 5 + Math.floor(rand() * 5),
    margin: `by ${short} run${short === 1 ? '' : 's'}`,
  }
}

function testScores(
  outcome: Outcome,
  ratings: TeamRatings,
  pitch: PitchType,
  rand: () => number,
): Scores {
  const p = PROFILE.TEST
  const mult = pitch === 'BATTING' ? 1.15 : pitch === 'NEUTRAL' ? 1 : 0.85
  const ourRuns = Math.round(
    clamp((p.par + (ratings.batting - 80) * p.batWeight + (rand() - 0.5) * p.spread) * mult, 150, 660),
  )
  const theirRuns = Math.round(
    clamp((p.par + (85 - ratings.bowling) * p.batWeight * 0.8 + (rand() - 0.5) * p.spread) * mult, 110, 620),
  )

  let margin: string
  if (outcome === 'D') {
    margin = 'DRAWN'
  } else {
    const roll = rand()
    if (roll < 0.22) margin = `by an innings and ${20 + Math.floor(rand() * 160)} runs`
    else if (roll < 0.6) margin = `by ${30 + Math.floor(rand() * 280)} runs`
    else {
      const w = 2 + Math.floor(rand() * 8)
      margin = `by ${w} wicket${w === 1 ? '' : 's'}`
    }
  }

  return {
    ourRuns,
    ourWickets: outcome === 'L' ? 10 : 5 + Math.floor(rand() * 5),
    theirRuns,
    theirWickets: outcome === 'W' ? 10 : 5 + Math.floor(rand() * 5),
    margin,
  }
}

/** One playable match, scoreboard and scorecard together. */
export function playMatch(
  no: number,
  round: string,
  opponent: Opponent,
  outcome: Outcome,
  ratings: TeamRatings,
  xi: PlayerSeason[],
  format: Format,
  knockout: boolean,
  pitch: PitchType,
  rand: () => number,
  tossWon?: boolean,
  forcedBatFirst?: boolean,
): MatchResult {
  const battedFirst = forcedBatFirst ?? rand() < 0.5
  const s =
    format === 'TEST'
      ? testScores(outcome, ratings, pitch, rand)
      : limitedOversScores(outcome, ratings, format, pitch, battedFirst, rand)

  const { card, hero } = buildCard({
    xi,
    format,
    pitch,
    outcome,
    battedFirst,
    ourRuns: s.ourRuns,
    ourWickets: s.ourWickets,
    theirRuns: s.theirRuns,
    theirWickets: s.theirWickets,
    opponent,
    margin: s.margin,
    rand,
  })

  const label = `${opponent.name} ${opponent.season}`

  const line = (runs: number, wickets: number) =>
    format === 'TEST'
      ? `${runs} & ${Math.round(runs * (0.45 + rand() * 0.5))}`
      : `${runs}/${wickets}`

  return {
    no,
    round,
    opponent: label,
    opponentKey: opponent.teamKey,
    outcome,
    margin: s.margin,
    us: line(s.ourRuns, s.ourWickets),
    them: line(s.theirRuns, s.theirWickets),
    battedFirst,
    knockout,
    pitch,
    tossWon,
    hero,
    card,
  }
}

/* ── League table ────────────────────────────────────────────────────────── */

/**
 * A table is the clearest way to say "you were third". The rivals are the real
 * sides on your fixture list, and each plays its own season out at a win rate
 * drawn from its actual ratings — so the strong squads finish where they should.
 */
function buildTable(
  format: Format,
  teamName: string,
  pool: Opponent[],
  ourStrength: number,
  ourWins: number,
  ourDraws: number,
  ourLosses: number,
  rand: () => number,
): TableRow[] {
  const t = TOURNAMENTS[format]
  const strengths = [ourStrength, ...pool.map((o) => strengthOf(o.ratings))]
  const fieldAvg = strengths.reduce((a, b) => a + b, 0) / strengths.length

  const rows: TableRow[] = [
    {
      name: teamName || 'YOUR XI',
      played: t.group,
      wins: ourWins,
      draws: ourDraws,
      losses: ourLosses,
      points: ourWins * t.pointsWin + ourDraws * t.pointsDraw,
      // Filled in by the caller from the scorecards actually played.
      nrr: 0,
      us: true,
    },
  ]

  for (const side of pool) {
    const edge = strengthOf(side.ratings) - fieldAvg
    // The same curve your own matches are decided on. This was a separate
    // hard-coded slope, so the rest of the table was played out under steeper
    // odds than you were — their records spread further apart than yours could,
    // and the position you finished in was measured against a different game.
    const pWin = winProbability(edge, format)
    const pDraw = t.draws ? drawProbability(edge) : 0
    let wins = 0
    let draws = 0
    for (let g = 0; g < t.group; g++) {
      const r = rand()
      if (r < pWin * (1 - pDraw)) wins++
      else if (r < pWin * (1 - pDraw) + pDraw) draws++
    }
    /**
     * Their rate comes from scores, like yours — the matches are played out for
     * runs even though nobody will ever read a card for them. A rival's net run
     * rate has to be a rate over runs, or it cannot be compared with one that
     * is, and this is the number that separates two sides level on points.
     */
    const line = blankRate()
    if (!t.draws) {
      const quota = t.overs * 6
      const par = PROFILE[format].par + edge * 1.4
      for (let g = 0; g < t.group; g++) {
        const theirs = Math.round(clamp(par + (rand() - 0.5) * PROFILE[format].spread, PROFILE[format].lo, PROFILE[format].hi))
        // Winning margins run wider than losing ones; a chase ends when it ends.
        const beat = g < wins
        const swing = Math.round((0.04 + rand() * 0.22) * theirs)
        const against = beat ? Math.max(PROFILE[format].lo * 0.6, theirs - swing) : theirs + Math.max(1, Math.round(swing * 0.5))
        const allOutFor = rand() < 0.25
        const allOutAgainst = beat && rand() < 0.35
        line.runsFor += theirs
        line.ballsFaced += allOutFor ? quota : Math.round(quota * (0.9 + rand() * 0.1))
        line.runsAgainst += Math.round(against)
        line.ballsBowled += allOutAgainst ? quota : Math.round(quota * (0.9 + rand() * 0.1))
      }
    }

    rows.push({
      name: `${side.short} ${side.season}`,
      played: t.group,
      wins,
      draws,
      losses: t.group - wins - draws,
      points: wins * t.pointsWin + draws * t.pointsDraw,
      nrr: netRunRate(line),
      us: false,
    })
  }

  /**
   * Points, then net run rate — except in a Test championship, which has no
   * such thing. There the tie-break is the percentage of available points won,
   * which is how the World Test Championship is actually decided.
   */
  const pctOf = (r: TableRow) => r.points / Math.max(1, r.played * t.pointsWin)
  return rows.sort((a, b) =>
    t.draws ? b.points - a.points || pctOf(b) - pctOf(a) : b.points - a.points || b.nrr - a.nrr,
  )
}

/* ── Stepwise run ────────────────────────────────────────────────────────── */

export interface Run {
  ratings: TeamRatings
  /** Batting order, used to write every scorecard. */
  xi: PlayerSeason[]
  table: TableRow[]
  /** Where we finished the group stage, 1 = top. */
  standing: number
  attack: { pace: number; spin: number }
  group: MatchResult[]
  wins: number
  draws: number
  losses: number
  points: number
  qualified: boolean
  /** Knockout rounds still to play, with their pitch drawn up front. */
  rounds: { round: string; pitch: PitchType; opponent: Opponent }[]
  knockouts: MatchResult[]
}

/** Plays the group stage and works out what knockouts, if any, lie ahead. */
export function startRun(
  slots: Slot[],
  captainId: string | null,
  rand: () => number,
  format: Format,
  teamName = 'YOUR XI',
  ratingMode: RatingMode = 'SEASON',
  worldTeams = true,
): Run {
  const t = TOURNAMENTS[format]
  const ratings = teamRatings(slots, captainId)
  const attack = attackOf(slots)
  const base = strengthOf(ratings)
  const xi = xiOf(slots)

  // The field: real sides, drawn from their recent seasons, one per team.
  // You face the league you drafted from. Picking your XI out of Sydney and
  // Lahore and then playing a season against Indian sides only was two
  // different competitions wearing one name.
  const pool = opponentPool(format, rand, FIELD_SIZE[format] - 1, {
    latest: true,
    ratingMode,
    world: worldTeams,
  })
  const fixtures = fixtureList(pool, t.group, rand)

  const group: MatchResult[] = []
  for (let i = 0; i < t.group; i++) {
    const them = fixtures[i]
    const pitch = PITCH_TYPES[Math.floor(rand() * PITCH_TYPES.length)]
    const edge =
      strengthOnPitch(base, ratings, attack, pitch) -
      strengthOnPitch(strengthOf(them.ratings), them.ratings, them.attack, pitch)
    const pWin = winProbability(edge, format)
    const pDraw = t.draws ? drawProbability(edge) : 0

    const r = rand()
    let outcome: Outcome
    if (t.draws) {
      if (r < pWin * (1 - pDraw)) outcome = 'W'
      else if (r < pWin * (1 - pDraw) + pDraw) outcome = 'D'
      else outcome = 'L'
    } else {
      outcome = r < pWin ? 'W' : 'L'
    }

    group.push(
      playMatch(
        i + 1,
        `MATCH ${String(i + 1).padStart(2, '0')}`,
        them,
        outcome,
        ratings,
        xi,
        format,
        false,
        pitch,
        rand,
      ),
    )
  }

  const wins = group.filter((m) => m.outcome === 'W').length
  const draws = group.filter((m) => m.outcome === 'D').length
  const losses = group.filter((m) => m.outcome === 'L').length
  const points = wins * t.pointsWin + draws * t.pointsDraw

  const table = buildTable(format, teamName, pool, base, wins, draws, losses, rand)
  // Your own rate is not modelled — it is added up from the matches you played.
  const mine = table.find((r) => r.us)
  if (mine) mine.nrr = netRunRate(rateFromMatches(group, format))
  table.sort((a, b) =>
    TOURNAMENTS[format].draws
      ? b.points - a.points ||
        b.points / Math.max(1, b.played) - a.points / Math.max(1, a.played)
      : b.points - a.points || b.nrr - a.nrr,
  )
  const standing = table.findIndex((r) => r.us) + 1
  const qualified = standing <= qualifyCutoff(format)

  // Knockouts are played against whoever else made the cut, best-placed first.
  const survivors = table
    .slice(0, qualifyCutoff(format))
    .filter((r) => !r.us)
    .map((r) => pool.find((o) => `${o.short} ${o.season}` === r.name))
    .filter((o): o is Opponent => !!o)

  const rounds = qualified
    ? t.knockouts.map((round, k) => ({
        round,
        pitch: PITCH_TYPES[Math.floor(rand() * PITCH_TYPES.length)],
        opponent: survivors[k % Math.max(survivors.length, 1)] ?? pool[k % pool.length],
      }))
    : []

  return {
    ratings,
    xi,
    table,
    standing,
    attack,
    group,
    wins,
    draws,
    losses,
    points,
    qualified,
    rounds,
    knockouts: [],
  }
}

/**
 * Plays the next knockout. `toss` is supplied when the player called it
 * themselves — winning it and reading the surface right is worth a real edge.
 */
export function playKnockout(
  run: Run,
  format: Format,
  rand: () => number,
  toss: { won: boolean; batFirst: boolean } | null,
): MatchResult {
  const t = TOURNAMENTS[format]
  const k = run.knockouts.length
  const spec = run.rounds[k]
  const them = spec.opponent
  let edge =
    strengthOnPitch(strengthOf(run.ratings), run.ratings, run.attack, spec.pitch) -
    strengthOnPitch(strengthOf(them.ratings), them.ratings, them.attack, spec.pitch)

  // Knockouts tighten up; the final tightest of all.
  edge -= 2 + k * 1.5

  /*
   * The toss cuts both ways. Winning it and reading the surface right was
   * worth a real edge, and losing it was worth nothing at all — the opposition
   * called correctly, chose what suited them, and the match played as though
   * the coin had never gone up. Their advantage is the mirror of ours, a
   * little smaller because they take the obvious option rather than a read.
   */
  if (toss?.won) {
    const readItRight = toss.batFirst === favoursBatting(spec.pitch)
    edge += readItRight ? 3.2 : 0.6
  } else if (toss) {
    edge -= 2.4
  }

  const pWin = winProbability(edge, format)
  // Knockouts must produce a result, so a draw is re-rolled.
  const outcome: Outcome = rand() < pWin ? 'W' : 'L'

  const match = playMatch(
    t.group + k + 1,
    spec.round,
    spec.opponent,
    outcome,
    run.ratings,
    run.xi,
    format,
    true,
    spec.pitch,
    rand,
    toss?.won,
    toss?.batFirst,
  )

  run.knockouts.push(match)
  return match
}

/* ── Objectives ──────────────────────────────────────────────────────────── */

/** The longest run of wins anywhere in a season. */
function bestStreak(matches: MatchResult[]): number {
  let best = 0
  let run = 0
  for (const m of matches) {
    run = m.outcome === 'W' ? run + 1 : 0
    if (run > best) best = run
  }
  return best
}

/**
 * Did the season meet the day's objective?
 *
 * An objective that cannot be checked here is not met. It used to fall through
 * to "reached the knockouts", which meant a new row in the challenges table —
 * or a typo in an old one — silently awarded a badge for something the player
 * had not been asked to do.
 */
function objectiveMet(
  title: string,
  group: MatchResult[],
  knockouts: MatchResult[],
  outcome: TournamentResult['outcome'],
  standing: number,
) {
  const all = [...group, ...knockouts]

  switch (title) {
    /* ── Results ── */
    case 'SET AND DEFEND':
      return group.filter((m) => m.outcome === 'W' && m.battedFirst).length >= 4
    case 'CHASE MASTER':
      return group.filter((m) => m.outcome === 'W' && !m.battedFirst).length >= 5
    case 'GO UNBEATEN':
      return group.every((m) => m.outcome !== 'L')
    case 'LIFT THE TROPHY':
      return outcome === 'CHAMPIONS'
    case 'TOP OF THE TABLE':
      return standing === 1
    case 'NO CHOKE':
      return knockouts.length > 0 && knockouts.every((m) => m.outcome !== 'L')

    /* ── Shape of the season ── */
    case 'PERFECT START':
      return group.length >= 4 && group.slice(0, 4).every((m) => m.outcome === 'W')
    case 'ON A ROLL':
      return bestStreak(all) >= 6
    case 'COMEBACK': {
      // A loss, then three wins on the bounce. Recovering, not merely winning.
      const i = all.findIndex((m) => m.outcome === 'L')
      return i >= 0 && all.slice(i + 1, i + 4).filter((m) => m.outcome === 'W').length === 3
    }

    /* ── Individual performances ── */
    case 'CENTURION':
      return all.some((m) => m.card.batting.some((b) => b.runs >= 100))
    case 'FIVE-FOR':
      return all.some((m) => m.card.bowling.some((b) => b.wickets >= 5))
    case 'BOWLED THEM OUT':
      return all.filter((m) => m.card.theirScore.wickets >= 10).length >= 2
    case 'CRUSHING WIN':
      return all.some(
        (m) =>
          m.outcome === 'W' &&
          (m.battedFirst
            ? m.card.ourScore.runs - m.card.theirScore.runs >= 50
            : m.card.ourScore.wickets <= 2),
      )

    default:
      return false
  }
}

/* ── Finalise ────────────────────────────────────────────────────────────── */

export function finishRun(
  run: Run,
  slots: Slot[],
  captainId: string | null,
  config: DraftConfig,
  mode: DraftMode,
  dailyId: number | null,
  objective?: { title: string; desc: string },
): TournamentResult {
  const t = TOURNAMENTS[config.format]
  const format = config.format

  let outcome: TournamentResult['outcome'] = 'MISSED KNOCKOUTS'
  if (run.qualified) {
    outcome = 'ELIMINATED'
    const lostAt = run.knockouts.findIndex((m) => m.outcome === 'L')
    if (lostAt === -1 && run.knockouts.length === t.knockouts.length) outcome = 'CHAMPIONS'
    else if (lostAt === t.knockouts.length - 1) outcome = 'RUNNERS-UP'
  }

  const perfect =
    run.losses === 0 &&
    run.draws === 0 &&
    outcome === 'CHAMPIONS' &&
    run.knockouts.every((m) => m.outcome === 'W')

  const xi = xiOf(slots)

  // Tournament aggregates come straight off the scorecards, so the summary and
  // the match-by-match view can never tell different stories.
  const all = [...run.group, ...run.knockouts]
  const runsBy = new Map<string, number>()
  const wktsBy = new Map<string, number>()
  for (const m of all) {
    for (const b of m.card.batting) runsBy.set(b.name, (runsBy.get(b.name) ?? 0) + b.runs)
    for (const b of m.card.bowling) wktsBy.set(b.name, (wktsBy.get(b.name) ?? 0) + b.wickets)
  }
  const best = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['—', 0]

  // The run's collectable: your best player if you won it, otherwise your captain.
  const cardSource =
    outcome === 'CHAMPIONS'
      ? [...xi].sort((a, b) => b.ovr - a.ovr)[0]
      : (xi.find((p) => p.id === captainId) ?? xi[0])

  return {
    format,
    wins: run.wins,
    losses: run.losses,
    draws: run.draws,
    points: run.points,
    matches: run.group,
    knockouts: run.knockouts,
    qualified: run.qualified,
    outcome,
    perfect,
    ratings: run.ratings,
    mvp: { name: best(runsBy)[0] as string, detail: `${best(runsBy)[1]} RUNS` },
    topBowler: { name: best(wktsBy)[0] as string, detail: `${best(wktsBy)[1]} WICKETS` },
    slots,
    captainId,
    mode,
    dailyId,
    presetId: config.presetId,
    teamName: config.teamName || 'YOUR XI',
    ratingMode: config.ratingMode,
    difficulty: config.difficulty,
    score: seasonScore(all, format),
    objective: objective
      ? {
          ...objective,
          met: objectiveMet(objective.title, run.group, run.knockouts, outcome, run.standing),
        }
      : undefined,
    pct:
      format === 'TEST'
        ? Math.round((run.points / (run.group.length * t.pointsWin)) * 1000) / 10
        : undefined,
    standing: run.standing,
    table: run.table,
    cardEarned: cardSource
      ? {
          name: cardSource.name,
          tier: tierOf(cardSource.ovr),
          season: cardSource.season,
          team: cardSource.team,
        }
      : undefined,
  }
}

/* ── Display helpers ─────────────────────────────────────────────────────── */

/** 1st, 2nd, 3rd, 4th… — used wherever a table position is shown. */
export const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

export function recordOf(r: TournamentResult) {
  return r.draws > 0 ? `${r.wins}–${r.draws}–${r.losses}` : `${r.wins}–${r.losses}`
}

export function outcomeHeadline(r: TournamentResult) {
  if (r.perfect) return 'PERFECT RUN'
  const t = TOURNAMENTS[r.format]
  switch (r.outcome) {
    case 'CHAMPIONS':
      return t.trophy
    case 'RUNNERS-UP':
      return 'RUNNERS-UP'
    case 'ELIMINATED':
      return 'KNOCKED OUT'
    default:
      return r.format === 'TEST' ? 'MISSED THE FINAL' : 'MISSED KNOCKOUTS'
  }
}

export const pitchLabel = (p: PitchType) => PITCH[p]

/**
 * How well this XI is set up for each surface, on a 0–100 scale. Shown before
 * the simulation so the player can see where their team is exposed.
 */
export function pitchSuitability(slots: Slot[], ratings: TeamRatings) {
  const attack = attackOf(slots)
  const base = strengthOf(ratings)
  const out = {} as Record<PitchType, number>
  for (const p of PITCH_TYPES) {
    out[p] = clamp(Math.round(strengthOnPitch(base, ratings, attack, p)), 40, 99)
  }
  return out
}

/**
 * Play a whole season with nobody watching.
 *
 * The solo game walks a season a match at a time because that is the show. A
 * live draft needs the other three XIs played out too, and nobody wants to sit
 * through somebody else's fourteen games, so this runs the same functions in a
 * loop and hands back the same result. Deterministic on the rng it is given,
 * which is what lets any client play a bot's season and get what everyone else
 * would have got.
 */
export function playSeason(
  slots: Slot[],
  captainId: string | null,
  rand: () => number,
  config: DraftConfig,
  teamName = 'YOUR XI',
): TournamentResult {
  const run = startRun(
    slots,
    captainId,
    rand,
    config.format,
    teamName,
    config.ratingMode,
    config.worldTeams,
  )
  while (run.qualified && run.knockouts.length < run.rounds.length) {
    // No toss called: there is nobody at this keyboard to call it.
    const m = playKnockout(run, config.format, rand, null)
    if (m.outcome === 'L') break
  }
  return finishRun(run, slots, captainId, config, 'quick', null)
}
