import type { Conditions } from './conditions'
export type Role = 'WK' | 'BAT' | 'AR' | 'PACE' | 'SPIN'

/** The four playable tournaments. */
export type Format = 'T20L' | 'ODIWC' | 'T20WC' | 'TEST'

/** How wide the draft pool is drawn from. */
/** Which sides are in the draw. Seasons are chosen separately, by year range. */
export type Scope = 'ALL' | 'TEAM'

/**
 * Which decade a squad belongs to. There is no pre-2000 era because there is
 * no pre-2000 cricket in the archive: ball-by-ball records begin in 2001, so
 * a "classic" period could only ever have been an empty, permanently
 * unselectable button.
 */
export type Era = 'Y2K' | 'MODERN' | 'NOW'

/**
 * Which version of a player you draft.
 * SEASON — how good they were in that specific season.
 * PRIME  — their career peak, whichever season that came in.
 */
export type RatingMode = 'SEASON' | 'PRIME'

export const RATING_MODE: Record<RatingMode, { label: string; note: string; desc: string }> = {
  SEASON: {
    label: 'SEASON FORM',
    note: 'that season only',
    desc: 'Players are rated for the season on the card. A lean year is a lean card.',
  },
  PRIME: {
    label: 'PRIME',
    note: 'career peak',
    desc: 'Every player is rated at their career best, whichever season that was.',
  },
}

/** A single draftable entity: one player, in one specific season, for one squad. */
export interface PlayerSeason {
  id: string
  /** The player themselves, stable across every squad and season they appear in. */
  playerId: string
  name: string
  /** Surname only — used where space is tight. */
  surname: string
  role: Role
  /** Extra roles this player can also fill. A "+" on the card. */
  alt: Role[]
  /** Two-letter country code — drives flags and the overseas cap. */
  nation: string
  ovr: number
  /** Three role-appropriate sub-ratings shown on the card. */
  stats: [Stat, Stat, Stat]
  team: string
  teamShort: string
  /** Groups seasons of the same side together for one-team drafts. */
  teamKey: string
  season: string
  /** Competition the squad played in, e.g. "WORLD CUP 2011". */
  comp: string
  /** Batting contribution 0–100, used by the simulator. */
  bat: number
  /** Bowling contribution 0–100, used by the simulator. */
  bowl: number
  /** Set when the card is showing prime ratings rather than season form. */
  prime?: boolean
  /** The season the prime rating comes from. */
  peakSeason?: string
}

export interface Stat {
  label: string
  value: number
}

export interface Squad {
  id: string
  team: string
  teamShort: string
  teamKey: string
  season: string
  comp: string
  era: Era
  /**
   * Where the side belongs. The Indian T20 League's fixture list is drawn from
   * 'IN' sides and the Champions Trophy from franchises the world over, while
   * 'INTL' is a national team and plays only in the international formats.
   */
  region: 'IN' | 'WORLD' | 'INTL'
  /** Which tournaments this squad can be drawn for. */
  formats: Format[]
  players: PlayerSeason[]
}

/* ── Card rarity ──────────────────────────────────────────────────────────── */

export type Tier = 'COMMON' | 'RARE' | 'ICON' | 'IMMORTAL'

export function tierOf(ovr: number): Tier {
  if (ovr >= 94) return 'IMMORTAL'
  if (ovr >= 88) return 'ICON'
  if (ovr >= 82) return 'RARE'
  return 'COMMON'
}

/* ── XI shape ─────────────────────────────────────────────────────────────── */

/** A slot in the batting order. Index 0 is #1, index 10 is #11. */
export interface Slot {
  no: number
  role: Role
  player: PlayerSeason | null
}

export interface Preset {
  id: string
  name: string
  desc: string
  slots: Role[]
}

export const PRESETS: Preset[] = [
  {
    id: 'BALANCED',
    name: 'BALANCED XI',
    desc: 'Four batters, a keeper, two all-rounders, two of each bowling type.',
    slots: ['BAT', 'BAT', 'BAT', 'BAT', 'WK', 'AR', 'AR', 'SPIN', 'SPIN', 'PACE', 'PACE'],
  },
  {
    id: 'CLASSIC_ODI',
    name: 'CLASSIC ORDER',
    desc: 'Five batters, keeper, one all-rounder, one spinner, three quicks.',
    slots: ['BAT', 'BAT', 'BAT', 'BAT', 'BAT', 'WK', 'AR', 'SPIN', 'PACE', 'PACE', 'PACE'],
  },
  {
    id: 'PACE_BATTERY',
    name: 'PACE BATTERY',
    desc: 'Four quicks hunting in a pack, one spinner for variety.',
    slots: ['BAT', 'BAT', 'BAT', 'BAT', 'WK', 'AR', 'SPIN', 'PACE', 'PACE', 'PACE', 'PACE'],
  },
  {
    id: 'AR_ARMY',
    name: 'ALL-ROUNDER ARMY',
    desc: 'Three all-rounders for depth in both innings.',
    slots: ['BAT', 'BAT', 'BAT', 'BAT', 'WK', 'AR', 'AR', 'AR', 'SPIN', 'PACE', 'PACE'],
  },
]

export const XI_SIZE = 11

/* ── Difficulty ───────────────────────────────────────────────────────────── */

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD'

export const DIFFICULTY: Record<
  Difficulty,
  { skips: number; restarts: number; hideRatings: boolean; label: string; note: string }
> = {
  /*
   * Restarts are limited for the same reason re-rolls are.
   *
   * A re-roll costs one of a handful and the whole difficulty is built around
   * that; starting the draft again cost nothing and could be done forever, so
   * anyone who did not like their draw could simply keep taking draws until
   * they did. That is a longer route round the difficulty than a re-roll and
   * it was the only one with no price on it.
   */
  EASY: { skips: 5, restarts: 3, hideRatings: false, label: 'EASY', note: '5 re-rolls · 3 restarts' },
  NORMAL: { skips: 3, restarts: 1, hideRatings: false, label: 'NORMAL', note: '3 re-rolls · 1 restart' },
  HARD: { skips: 0, restarts: 0, hideRatings: true, label: 'HARD', note: 'no re-rolls · no restarts · ratings hidden' },
}

/* ── Pitch conditions ─────────────────────────────────────────────────────── */

export type PitchType = 'BATTING' | 'PACE' | 'SPIN' | 'NEUTRAL'

export const PITCH: Record<PitchType, { glyph: string; label: string; note: string }> = {
  BATTING: { glyph: '🏏', label: 'Batting paradise', note: 'Runs flow. Batting rating rules.' },
  PACE: { glyph: '⚡', label: 'Pace deck', note: 'Seam and bounce. Quicks decide it.' },
  SPIN: { glyph: '🌀', label: 'Spin track', note: 'It turns square. Spinners take over.' },
  NEUTRAL: { glyph: '⚖️', label: 'Neutral', note: 'Nothing given, nothing taken.' },
}

/* ── Tournaments ──────────────────────────────────────────────────────────── */

export interface Tournament {
  id: Format
  name: string
  short: string
  /** Matches in the group/league phase. */
  group: number
  /** Knockout round names, in order. */
  knockouts: string[]
  pointsWin: number
  pointsDraw: number
  /** Test cricket can be drawn — the others cannot. */
  draws: boolean
  overs: number
  /** Label for winning it all. */
  trophy: string
  /** The aspirational unbeaten record, e.g. "14–0". */
  perfect: string
  blurb: string
}

export const TOURNAMENTS: Record<Format, Tournament> = {
  T20L: {
    id: 'T20L',
    name: 'T20 LEAGUE',
    short: 'T20',
    group: 14,
    knockouts: ['QUALIFIER', 'FINAL'],
    pointsWin: 2,
    pointsDraw: 0,
    draws: false,
    overs: 20,
    trophy: 'CHAMPIONS',
    perfect: '14–0',
    blurb: '14 league games, then the playoffs.',
  },
  ODIWC: {
    id: 'ODIWC',
    name: 'ODI WORLD CUP',
    short: 'ODI WC',
    group: 9,
    knockouts: ['SEMI-FINAL', 'FINAL'],
    pointsWin: 2,
    pointsDraw: 0,
    draws: false,
    overs: 50,
    trophy: 'WORLD CHAMPIONS',
    perfect: '11–0',
    blurb: '9 group games, semi-final, final.',
  },
  T20WC: {
    id: 'T20WC',
    name: 'T20 WORLD CUP',
    short: 'T20 WC',
    group: 7,
    knockouts: ['SEMI-FINAL', 'FINAL'],
    pointsWin: 2,
    pointsDraw: 0,
    draws: false,
    overs: 20,
    trophy: 'WORLD CHAMPIONS',
    perfect: '9–0',
    blurb: 'Short, brutal: 7 games then knockouts.',
  },
  TEST: {
    id: 'TEST',
    name: 'TEST CHAMPIONSHIP',
    short: 'TEST',
    group: 12,
    knockouts: ['FINAL'],
    pointsWin: 12,
    pointsDraw: 4,
    draws: true,
    overs: 0,
    trophy: 'MACE WINNERS',
    perfect: '12–0',
    blurb: '12 Tests over two years. Draws count.',
  },
}

export const FORMAT_ORDER: Format[] = ['T20L', 'ODIWC', 'T20WC', 'TEST']

/* ── Draft state ──────────────────────────────────────────────────────────── */

export type DraftMode = 'quick' | 'daily'

export interface DraftConfig {
  format: Format
  scope: Scope
  /** Set when scope === 'TEAM'. */
  teamKey: string | null
  /**
   * The span of years to draft from, inclusive. Null means everything.
   *
   * A range rather than a named decade. The decades were three fixed buckets
   * that happened to be where the data was cut; a player who wants the years
   * either side of a rule change, or one club's great side and the one that
   * followed it, was choosing between buckets that did not fit.
   */
  years: [number, number] | null
  presetId: string
  /** Season form or career peak. Applies to your XI and every opponent alike. */
  ratingMode: RatingMode
  /** From Memory mode hides ratings during the draft. */
  hideRatings: boolean
  difficulty: Difficulty
  /** Call the toss yourself before each knockout. */
  liveToss: boolean
  /**
   * Whether the league takes in franchises from around the world.
   *
   * On, the competition is a world league: Sydney and Lahore and Barbados are
   * in the draw alongside the Indian sides, and an overseas cap is meaningless
   * because there is no home country to be overseas from. Off, it is the
   * Indian league on its own, and the cap becomes a rule you can choose.
   */
  worldTeams: boolean
  /** Cap overseas players in the XI. Only meaningful when worldTeams is off. */
  overseasCap: boolean
  /** Named once, then shown on the result and in the share card. */
  teamName: string
}

export interface DraftState {
  mode: DraftMode
  config: DraftConfig
  slots: Slot[]
  currentSquad: Squad | null
  /** Re-rolls allowed, set by difficulty. */
  maxSkips: number
  skipsUsed: number
  /** Draws started and walked away from, counted across restarts. */
  restartsUsed: number
  dailyCursor: number
  dailyId: number | null
  captainId: string | null
  /** Squad ids seen recently, to keep consecutive draws varied. */
  recent: string[]
}

/* ── Results ──────────────────────────────────────────────────────────────── */

export type Outcome = 'W' | 'L' | 'D'

/** One batter's contribution in a match innings. */
export interface BatLine {
  name: string
  runs: number
  balls: number
  /** False for the not-out batters at the end of the innings. */
  out: boolean
  how: string
  /** True for the players who never got to the crease. */
  dnb?: boolean
}

/** One bowler's figures in a match innings. */
export interface BowlLine {
  name: string
  overs: string
  runs: number
  wickets: number
}

/**
 * Everything needed to replay a match in the viewer: both innings, who did the
 * damage, and the beats the match turned on.
 */
/** One innings of a match, and the figures the other side took in it. */
export interface InningsCard {
  /** 'us' or the opposition — which side was batting. */
  ours: boolean
  /** "First innings", "Second innings", and for a Test the follow-ups. */
  label: string
  score: { runs: number; wickets: number; overs: string }
  batting: BatLine[]
  bowling: BowlLine[]
  extras: number
}

export interface MatchCard {
  /**
   * Set for Tests, where two innings a side is the whole point.
   *
   * The limited-overs fields below describe one innings each, which is all a
   * one-day game has. A Test played out over four innings was being shown as
   * two, so a first-innings lead and a fourth-innings chase — the shape of the
   * match — simply were not on the card.
   */
  innings?: InningsCard[]
  /**
   * The two things a crowd talks about on the way home and a scorecard never
   * records. Simulated like everything else on this card, from the players who
   * did it — absent when nobody in the side could have.
   */
  spectacle?: {
    six: { who: string; metres: number } | null
    fastest: { who: string; kph: number } | null
  }
  /** Runs we made, and the wickets we lost. */
  ourScore: { runs: number; wickets: number; overs: string }
  theirScore: { runs: number; wickets: number; overs: string }
  /** Our batting card, and our bowling figures in their innings. */
  batting: BatLine[]
  bowling: BowlLine[]
  /** Their batting card, and their bowling figures in our innings. */
  theirBatting: BatLine[]
  theirBowling: BowlLine[]
  /** Byes, wides and no-balls in each innings. */
  ourExtras: number
  theirExtras: number
  /** Chronological beats — the story of the match in five or six lines. */
  moments: { over: string; text: string; kind: 'good' | 'bad' | 'neutral' }[]
  /** One-line summary shown in the ticker before the card is opened. */
  summary: string
  /** Opposition's danger man — a real player from that squad. */
  theirBest: string
  /** Their overall rating, so you can see who you just beat. */
  theirRating: number
  /** The exact squad-season faced, e.g. "MUMBAI 2019". */
  theirSquad: string
}

export interface MatchResult {
  no: number
  /** Round label: "MATCH 03", "SEMI-FINAL", "FINAL". */
  round: string
  opponent: string
  /** The side's key, so its colours can be found. */
  opponentKey: string
  outcome: Outcome
  /** e.g. "by 24 runs", "by 5 wickets", "DRAWN" */
  margin: string
  /** Our innings, e.g. "186/4" */
  us: string
  them: string
  /** True when we batted first. */
  battedFirst: boolean
  knockout: boolean
  pitch: PitchType
  /** The afternoon it was played in — sky, lights, dew. */
  conditions: Conditions
  /** Only set for knockouts the player called themselves. */
  tossWon?: boolean
  /** Standout performance of the match, for the scorecard. */
  hero: { name: string; line: string }
  /** Full match detail — the ball-by-ball view lives off this. */
  card: MatchCard
}

/** One row of the league/group table shown alongside the result. */
export interface TableRow {
  name: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  nrr: number
  /** True for the player's own side. */
  us: boolean
}

/* ── Champions Trophy ─────────────────────────────────────────────────────── */

export interface TeamRatings {
  ovr: number
  batting: number
  bowling: number
  balance: number
}

/**
 * A side you play against: a real squad-season from the archive, rated on the
 * same scale as your own XI. Built in `opponents.ts`, declared here so the
 * shared types stay in one module and nothing has to import in a circle.
 */
export interface Opponent {
  /** Full name, e.g. "MUMBAI INDIANS". */
  name: string
  short: string
  season: string
  comp: string
  /** Groups seasons of the same side, so a fixture list never repeats a team. */
  teamKey: string
  ratings: TeamRatings
  /** Which surfaces this attack is built for. */
  attack: { pace: number; spin: number }
  /** The squad itself, for danger men and scorecard colour. */
  players: PlayerSeason[]
}

/** One tie in the invitational, against a real T20 League squad-season. */
export interface TrophyTie {
  round: string
  opponent: Opponent
  match: MatchResult
}

export interface TrophyRun {
  ties: TrophyTie[]
  won: boolean
  /** The eight-side draw, shown before a ball is bowled. */
  field: Opponent[]
  /** Surface for each round, drawn up front so the toss call means something. */
  pitches: PitchType[]
}

/** Rounds of the Champions Trophy, in order. Eight sides, three ties to win. */
export const TROPHY_ROUNDS = ['QUARTER-FINAL', 'SEMI-FINAL', 'FINAL'] as const

/** Only the league's top three are invited. */
export const TROPHY_QUALIFY_STANDING = 3

export interface TournamentResult {
  format: Format
  wins: number
  losses: number
  draws: number
  points: number
  matches: MatchResult[]
  knockouts: MatchResult[]
  qualified: boolean
  outcome: 'CHAMPIONS' | 'RUNNERS-UP' | 'ELIMINATED' | 'MISSED KNOCKOUTS'
  perfect: boolean
  ratings: TeamRatings
  mvp: { name: string; detail: string }
  topBowler: { name: string; detail: string }
  slots: Slot[]
  captainId: string | null
  mode: DraftMode
  dailyId: number | null
  presetId: string
  teamName: string
  ratingMode: RatingMode
  /** Kept with the result: a run on Hard is not the same run as one on Easy. */
  difficulty: Difficulty
  /** What the season is worth on a ladder — results, runs and wickets. */
  score: { points: number; runs: number; wickets: number; wins: number; draws: number }
  /** Set for daily runs: did the XI meet today's objective? */
  objective?: { title: string; desc: string; met: boolean }
  /** Test Championship only — win percentage table position. */
  pct?: number
  /** The collectable earned for this run. */
  cardEarned?: { name: string; tier: Tier; season: string; team: string }
  /** Where the side finished, 1–3 unlocks the Champions Trophy. */
  standing: number
  /** Final league/group table, the player's side included. */
  table: TableRow[]
}

/* ── Ladder scoring ───────────────────────────────────────────────────────── */

/**
 * What a season is worth on a ladder.
 *
 * Ranking on wins alone produces a table of ties — a fourteen-game league has
 * fifteen possible records, so hundreds of players share one and the order
 * inside a tie is whatever the sort happens to do. It also says nothing about
 * *how* a season was won: nine wins by two runs ranks level with nine by
 * seventy.
 *
 * Results dominate, because winning is the point. Runs and wickets separate
 * sides that won the same number, and are granular enough that two players
 * rarely land on the same total.
 *
 * The run rate is scaled per format so a par innings is worth about the same
 * everywhere: 165 in a T20, 285 in a one-dayer and 380 in a Test are the same
 * afternoon's work, and a Test batter should not out-rank a T20 one simply for
 * playing a longer format.
 */
export const SCORING: Record<Format, { win: number; draw: number; perRun: number; perWicket: number }> = {
  T20L: { win: 100, draw: 0, perRun: 0.3, perWicket: 10 },
  T20WC: { win: 100, draw: 0, perRun: 0.32, perWicket: 10 },
  ODIWC: { win: 100, draw: 0, perRun: 0.18, perWicket: 12 },
  TEST: { win: 100, draw: 35, perRun: 0.13, perWicket: 8 },
}

/** The same arithmetic wherever a season is scored. */
export const scoreOf = (
  format: Format,
  parts: { wins: number; draws: number; runs: number; wickets: number },
) => {
  const s = SCORING[format]
  return Math.round(
    parts.wins * s.win + parts.draws * s.draw + parts.runs * s.perRun + parts.wickets * s.perWicket,
  )
}

/* ── Levels ───────────────────────────────────────────────────────────────── */

/**
 * One level per player, earned from every draft in every format.
 *
 * Experience *is* the points a season scores — the same number the ladder ranks
 * that season by — so a season that scores well is a season that levels you up,
 * whichever tournament it was played in, and the four formats feed one career
 * rather than four. They used to be two currencies, with XP at forty a run plus
 * eight a win while boards sorted on something else, and neither number ever
 * explained the other.
 *
 * Levels are set in **seasons played**, not in raw points, so the pace is the
 * same whatever you play: about three seasons a level to begin with, easing to
 * two once you are past thirty seasons and the levels themselves are the
 * achievement.
 *
 *      level  1  ·   3 seasons        level 20  ·  50 seasons
 *      level  5  ·  15 seasons        level 30  ·  70 seasons
 *      level 10  ·  30 seasons
 *
 * A season is worth about two thousand points averaged across the four
 * tournaments — a T20 League season scores more than a T20 World Cup simply
 * because it is longer — so playing the bigger tournaments advances you a
 * little faster, which is the point of earning it in points rather than in
 * appearances.
 */
const SEASON_XP = 2000

/** Seasons needed to reach a level: three each, then two beyond level ten. */
const seasonsForLevel = (level: number) => (level <= 10 ? level * 3 : level * 2 + 10)

export const pointsForLevel = (level: number) =>
  level <= 1 ? 0 : SEASON_XP * seasonsForLevel(level)

export function levelFromPoints(points: number) {
  const seasons = Math.max(0, points) / SEASON_XP
  const level = seasons <= 30 ? Math.floor(seasons / 3) : Math.floor((seasons - 10) / 2)
  return Math.max(1, level)
}

/** How far through the current level, 0 to 1. */
export function levelProgressOf(points: number) {
  const level = levelFromPoints(points)
  const base = pointsForLevel(level)
  const next = SEASON_XP * seasonsForLevel(level + 1)
  return {
    level,
    into: Math.max(0, points - base),
    needed: Math.max(1, next - base),
    fraction: Math.min(1, Math.max(0, (points - base) / Math.max(1, next - base))),
    toNext: Math.max(0, next - points),
  }
}

/**
 * What a level is called — the ladder a cricketer actually climbs, so the title
 * says something about where you are rather than repeating the number.
 */
const TITLES: [number, string][] = [
  [1, 'Club cricketer'],
  [3, 'Grade cricketer'],
  [6, 'First-class'],
  [10, 'List A regular'],
  [15, 'International'],
  [22, 'Test regular'],
  [30, 'All-time great'],
]

export const titleForLevel = (level: number) =>
  [...TITLES].reverse().find(([at]) => level >= at)?.[1] ?? TITLES[0][1]

/* ── Rating ───────────────────────────────────────────────────────────────── */

/**
 * A level and a rating answer different questions, and one number cannot do
 * both.
 *
 * **Level** measures how much you have played. It only ever goes up, because
 * taking someone's progress away for a bad week is a punishment nobody enjoys —
 * that is why every game that has both keeps them apart, an account level beside
 * a competitive rank.
 *
 * **Rating** measures how well. It moves both ways, and it is what a ladder
 * should sort on if the ladder is meant to be a contest: ranked on career
 * points, somebody who plays seventy ordinary seasons finishes above somebody
 * who plays ten brilliant ones, which measures stamina rather than cricket.
 *
 * The method is golf's, because golf has the same problem — players who compete
 * against each other while playing different courses, different numbers of
 * times. A handicap takes the **best eight of your last twenty rounds**, which
 * is comparable however much you play, rewards your peak without demanding you
 * hit it every time, and drifts down when recent form does.
 *
 * Each season is first converted to a number that means the same thing in every
 * tournament: how far above or below par it scored, in standard deviations,
 * where par is 1000 and each deviation is 100. Par and spread were measured
 * across roughly 120 simulated seasons per format at a range of draft
 * qualities, not guessed.
 */
const PAR: Record<Format, { par: number; spread: number }> = {
  T20L: { par: 2669, spread: 224 },
  T20WC: { par: 1298, spread: 158 },
  ODIWC: { par: 1876, spread: 166 },
  TEST: { par: 2269, spread: 209 },
}

/** One season, on a scale every tournament shares. Par is 1000. */
export const seasonIndex = (format: Format, points: number) => {
  const { par, spread } = PAR[format]
  return Math.round(1000 + ((points - par) / spread) * 100)
}

export interface SeasonRecord {
  format: Format
  points: number
  index: number
  at: string
}

/** How many recent seasons count, and how many of them are kept. */
export const RATING_WINDOW = 20
export const RATING_COUNTED = 8

export interface Rating {
  value: number
  /** How many seasons went into it. */
  counted: number
  /** True until there are enough seasons for the figure to mean much. */
  provisional: boolean
  /** Seasons still to play before it settles. */
  toEstablish: number
}

export function ratingOf(history: SeasonRecord[]): Rating {
  const recent = history.slice(0, RATING_WINDOW)
  if (!recent.length) {
    return { value: 1000, counted: 0, provisional: true, toEstablish: RATING_COUNTED }
  }
  // Best half of a short history, so an early rating is not decided by one round.
  const take = recent.length >= RATING_WINDOW ? RATING_COUNTED : Math.max(1, Math.ceil(recent.length / 2))
  const best = [...recent].sort((a, b) => b.index - a.index).slice(0, take)
  const value = Math.round(best.reduce((a, r) => a + r.index, 0) / best.length)
  return {
    value,
    counted: recent.length,
    provisional: recent.length < RATING_COUNTED,
    toEstablish: Math.max(0, RATING_COUNTED - recent.length),
  }
}

/** What a rating is worth calling. Par is 1000, a deviation is 100. */
const BANDS: [number, string][] = [
  [0, 'Developing'],
  [900, 'Steady'],
  [1000, 'Competitive'],
  [1100, 'Strong'],
  [1200, 'Elite'],
  [1300, 'World class'],
]

export const bandForRating = (value: number) =>
  [...BANDS].reverse().find(([at]) => value >= at)?.[1] ?? BANDS[0][1]
