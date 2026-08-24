/**
 * Turns .cricsheet/aggregate.json into SQL for the game's schema.
 *
 *   npm run archive
 *
 * Three things have to be resolved that the ball-by-ball data does not state
 * outright:
 *
 *   identity      franchises rename themselves — Kings XI Punjab and Punjab
 *                 Kings are one history, and a draft on "one team's seasons"
 *                 has to see them as such
 *   names         Cricsheet writes scorecard names, "V Kohli". The archive we
 *                 wrote by hand has full names for a thousand of them, so those
 *                 get upgraded and the rest keep the scorecard form, which is
 *                 how a scoreboard would print them anyway
 *   nationality   never stated, but a player who has turned out for a country
 *                 is that nationality — and with 3,521 T20Is and 2,569 ODIs in
 *                 the archive that now settles nearly everyone
 */
import { challengeRows } from './challenges.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

/* ── Identity ──────────────────────────────────────────────────────────── */

/** Names a franchise has traded under → the key its history lives on. */
const RENAMES = {
  'Kings XI Punjab': 'PUNJAB',
  'Punjab Kings': 'PUNJAB',
  'Delhi Daredevils': 'CAPITALS',
  'Delhi Capitals': 'CAPITALS',
  'Royal Challengers Bangalore': 'CHALLENGERS',
  'Royal Challengers Bengaluru': 'CHALLENGERS',
  'Rising Pune Supergiant': 'SUPERGIANT',
  'Rising Pune Supergiants': 'SUPERGIANT',
  'Chennai Super Kings': 'CHENNAI',
  'Mumbai Indians': 'MUMBAI',
  'Kolkata Knight Riders': 'KOLKATA',
  'Sunrisers Hyderabad': 'HYDERABAD',
  'Rajasthan Royals': 'RAJASTHAN',
  'Gujarat Titans': 'TITANS',
  'Gujarat Lions': 'LIONS',
  'Lucknow Super Giants': 'LUCKNOW',
  'Deccan Chargers': 'DECCAN',
  'Kochi Tuskers Kerala': 'KOCHI',
  'Pune Warriors': 'WARRIORS',
}

/** Short label for a card, where space is tight. */
const SHORT = {
  PUNJAB: 'PUNJAB', CAPITALS: 'DELHI', CHALLENGERS: 'CHALLENGERS', SUPERGIANT: 'PUNE',
  CHENNAI: 'CHENNAI', MUMBAI: 'MUMBAI', KOLKATA: 'KOLKATA', HYDERABAD: 'HYDERABAD',
  RAJASTHAN: 'RAJASTHAN', TITANS: 'TITANS', LIONS: 'LIONS', LUCKNOW: 'LUCKNOW',
  DECCAN: 'DECCAN', KOCHI: 'KOCHI', WARRIORS: 'PUNE WARRIORS',
}

/**
 * How a national side is written where space is short.
 *
 * Taking the first word gave "WEST" for the West Indies and "UNITED" for two
 * different countries. These are the forms scoreboards actually use.
 */
const INTL_SHORT = {
  'WEST INDIES': 'WINDIES',
  'SOUTH AFRICA': 'S AFRICA',
  'NEW ZEALAND': 'NZ',
  'SRI LANKA': 'SRI LANKA',
  'UNITED ARAB EMIRATES': 'UAE',
  'UNITED STATES OF AMERICA': 'USA',
  'PAPUA NEW GUINEA': 'PNG',
  'HONG KONG': 'HONG KONG',
}

/**
 * The international sides the game recognises, and the code its flags and
 * overseas cap use.
 *
 * The line is drawn at ICC Full Membership plus the associates that hold, or
 * have held, one-day international status — the sides that actually turn up
 * at a World Cup. Cricsheet's archive goes far wider than that, down to
 * Mongolia and Bhutan playing one another, and those matches are real but
 * they are not what a World Cup squad is drafted from: ninety-odd such sides
 * would swamp the opponent pool with teams nobody has heard of, and drag in
 * three thousand players who appear nowhere else.
 */
const NATIONS = {
  // Full Members
  India: 'IN', Australia: 'AU', England: 'EN', Pakistan: 'PK', 'Sri Lanka': 'LK',
  'West Indies': 'WI', 'South Africa': 'ZA', 'New Zealand': 'NZ', Afghanistan: 'AF',
  Bangladesh: 'BD', Ireland: 'IE', Zimbabwe: 'ZW',
  // Associates with ODI status, current or former
  Netherlands: 'NL', Scotland: 'SC', 'United Arab Emirates': 'AE', Nepal: 'NP',
  Oman: 'OM', Namibia: 'NA', 'United States of America': 'US',
  'Papua New Guinea': 'PG', Canada: 'CA', Kenya: 'KE', 'Hong Kong': 'HK',
  Bermuda: 'BM',
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const upper = (s) => s.toUpperCase()

/** The key a team-season is filed under. */
function teamKey(team, comp) {
  if (RENAMES[team]) return RENAMES[team]
  if (NATIONS[team]) return upper(team)
  return `${comp.toUpperCase()}-${upper(team).replace(/[^A-Z0-9]+/g, '')}`.slice(0, 40)
}

/**
 * Surname as a scoreboard would print it: strip the leading initials, keep any
 * particle. "AB de Villiers" → DE VILLIERS, "V Kohli" → KOHLI, "Ishan Kishan"
 * → KISHAN, "Rashid Khan" → RASHID KHAN.
 */
function surnameOf(name) {
  const parts = name.split(' ')
  const first = parts.findIndex((p) => !/^[A-Z]{1,4}$/.test(p))
  // No initials at all — "Rashid Khan", "Yuvraj Singh" — is how subcontinental
  // names are printed in full, and shortening them picks the wrong half.
  if (first <= 0) return upper(name)
  return upper(parts.slice(first).join(' '))
}

/* ── Load ──────────────────────────────────────────────────────────────── */

const rows = JSON.parse(await readFile(join(ROOT, '.cricsheet/aggregate.json'), 'utf8'))

const COMP_META = {
  ipl: ['T20 LEAGUE', ['T20L'], 'IN'],
  bbl: ['BIG BASH', ['T20L'], 'WORLD'],
  psl: ['PSL', ['T20L'], 'WORLD'],
  cpl: ['CPL', ['T20L'], 'WORLD'],
  sat: ['SA20', ['T20L'], 'WORLD'],
  hnd: ['THE HUNDRED', ['T20L'], 'WORLD'],
  ntb: ['T20 BLAST', ['T20L'], 'WORLD'],
  mlc: ['MLC', ['T20L'], 'WORLD'],
  lpl: ['LPL', ['T20L'], 'WORLD'],
  bpl: ['BPL', ['T20L'], 'WORLD'],
  msl: ['MZANSI SUPER LEAGUE', ['T20L'], 'WORLD'],
  // These hold every international in the format, not one tournament. Calling
  // them World Cups produced "WORLD T20 2005/06" — a competition that did not
  // exist until 2007, sitting on a squad that is a perfectly real West Indies
  // T20 side from the season T20 internationals began.
  t20s: ['T20 INTERNATIONAL', ['T20WC'], 'INTL'],
  odis: ['ONE-DAY INTERNATIONAL', ['ODIWC'], 'INTL'],
  tests: ['TEST CRICKET', ['TEST'], 'INTL'],
}

/* ── Nationality, from international appearances ───────────────────────── */

const nationOf = new Map()
for (const r of rows) {
  if (!['t20s', 'odis', 'tests'].includes(r.comp)) continue
  const code = NATIONS[r.team]
  if (!code) continue
  // Most caps wins, for the handful who switched allegiance.
  const seen = nationOf.get(r.id) ?? new Map()
  seen.set(code, (seen.get(code) ?? 0) + r.stats.matches)
  nationOf.set(r.id, seen)
}
const nation = new Map(
  [...nationOf].map(([p, seen]) => [p, [...seen].sort((a, b) => b[1] - a[1])[0][0]]),
)

/** The country each league is played in, for players placed no other way. */
const LEAGUE_HOME = {
  ipl: 'IN', bbl: 'AU', psl: 'PK', cpl: 'WI', sat: 'ZA',
  hnd: 'EN', ntb: 'EN', mlc: 'US', lpl: 'LK', bpl: 'BD', msl: 'ZA',
}

/**
 * Wikidata's reading, joined on the Cricinfo id in Cricsheet's own register.
 * Built by scripts/fetch-nations.mjs. It exists because caps alone cannot see
 * Afghanistan: Cricsheet withholds every Afghanistan men's match, so Rashid
 * Khan holds no cap here and would otherwise be filed as Indian.
 */
let wikidata = {}
let wikidataNames = {}
try {
  const table = JSON.parse(await readFile(join(ROOT, '.cricsheet/nations.json'), 'utf8'))
  wikidata = table.nations
  wikidataNames = table.names ?? {}
} catch {
  console.log('  ! no .cricsheet/nations.json — run `npm run nations` first for accurate nationality')
}

/**
 * Which league a player calls home, used only when nothing better is known.
 *
 * Counted in seasons rather than matches, because a domestic professional
 * turns out for his own competition every year while an overseas signing
 * appears for a season or two. Judged over a player's whole career and
 * applied once, not per competition: deciding this row by row is what made
 * Mujeeb Ur Rahman Indian in one league and Australian in the next, and a
 * player who is a local everywhere he plays never costs anyone an overseas
 * slot.
 */
const leagueSeasons = new Map()
for (const r of rows) {
  if (!LEAGUE_HOME[r.comp]) continue
  const seen = leagueSeasons.get(r.id) ?? new Map()
  seen.set(r.comp, (seen.get(r.comp) ?? new Set()).add(r.season))
  leagueSeasons.set(r.id, seen)
}
function homeLeague(id) {
  const seen = leagueSeasons.get(id)
  if (!seen) return null
  const ranked = [...seen].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
  // The Indian board does not release its contracted players to foreign T20
  // leagues, so a player who turns out in one is, with very few exceptions,
  // not Indian — whatever the Indian league says about where he plays most.
  const abroad = ranked.filter(([comp]) => comp !== 'ipl')
  const pick = ranked[0][0] === 'ipl' && abroad.length ? abroad[0] : ranked[0]
  return LEAGUE_HOME[Array.isArray(pick) ? pick[0] : pick]
}

/**
 * Nationality, best evidence first: a cap is a fact about who a player has
 * actually represented, Wikidata is a sourced claim, and the home league is
 * an inference of last resort.
 */
const nationSource = { cap: 0, wikidata: 0, league: 0, unknown: 0 }
const nationOfPlayer = new Map()
for (const id of new Set(rows.map((r) => r.id))) {
  const settled = nation.get(id)
  const claimed = wikidata[id]
  const home = homeLeague(id)
  if (settled) nationSource.cap++
  else if (claimed) nationSource.wikidata++
  else if (home) nationSource.league++
  else nationSource.unknown++
  nationOfPlayer.set(id, settled ?? claimed ?? home ?? 'IN')
}

/**
 * The name to print on a card.
 *
 * A scorecard abbreviates — "RG Sharma" — because a scorecard has a column to
 * fit. A player card has a line for the given name above the surname, and
 * "RG" is not a given name.
 *
 * Wikidata supplies these, joined on an identifier so it cannot mistake one
 * man for another. There used to be a second source — the hand-written roster
 * file — matched on initial and surname, which three different Khans can
 * share. That file is gone, and with it the guessing.
 */
const displayName = (scorecard) => scorecard

/* ── Shape ─────────────────────────────────────────────────────────────── */

const teams = new Map()
const players = new Map()
const squads = new Map()
const rosterRows = []
/** Emitted player id back to the Cricsheet id its career was tallied under. */
const sourceIdOf = new Map()
let upgraded = 0

/* ── Pace or spin ──────────────────────────────────────────────────────── */

/**
 * Which kind of bowler a player is, decided once for their whole career.
 *
 * Nothing in a scorecard says "leg spin", so the type is read from where in
 * the innings a bowler is used: spinners bowl the middle overs, quicks take
 * the new ball and come back at the death. Judged a season at a time that
 * reading is far too jumpy — 35% of bowlers came out as pace in one year and
 * spin in another, which put Mitchell Starc on as a spinner and left Olly
 * Stone bowling off breaks. Nobody changes their action between seasons, so
 * the whole career decides it, and the answer is applied to every season.
 *
 * Only T20 cricket counts towards the reading. "Middle overs" means overs 6
 * to 15, which is a fifty-over-a-side idea and describes nothing in a Test:
 * measured across his Tests, Ravichandran Ashwin looks like a fast bowler.
 */
/*
 * Where spin starts, measured rather than guessed.
 *
 * 0.45 called Ajit Agarkar a spinner. He bowled 58% of his T20 balls in the
 * middle overs — a fast-medium containment role that reads exactly like a
 * spinner to this signal. Checked against bowlers whose type nobody disputes,
 * the two groups do not overlap: every genuine spinner sits at 0.64 or above
 * (Narine .64, Ashwin .68, Harbhajan .73, Rashid .75, Zampa .79, Tahir .81,
 * Chahal .83) and every quick at 0.58 or below (Lee .15, Zaheer .17, Boult
 * .19, Steyn .25, Archer .26, Bumrah .28, Malinga .30, Johnson .40, Agarkar
 * .58). The gap between them is where the line belongs.
 */
const MID_OVER_SHARE = 0.62
const MIN_TYPE_BALLS = 60     // ten overs, below which the reading is noise

const bowlingTally = new Map()
for (const r of rows) {
  const t20 = r.comp !== 'odis' && r.comp !== 'tests'
  const tally = bowlingTally.get(r.id) ?? { t20Balls: 0, t20Mid: 0, allBalls: 0, allMid: 0 }
  tally.allBalls += r.stats.bowlBalls
  tally.allMid += r.stats.midOvers
  if (t20) {
    tally.t20Balls += r.stats.bowlBalls
    tally.t20Mid += r.stats.midOvers
  }
  bowlingTally.set(r.id, tally)
}

/*
 * What each bowler actually bowled, where anybody has written it down.
 *
 * Built by scripts/fetch-bowling.mjs: Cricsheet's identifier gives a Cricinfo
 * key, Wikidata turns that into an English Wikipedia article, and the article
 * states the style in words. Cricsheet has no such field of its own — its
 * register is identifiers and its match data is deliveries — so this is the
 * nearest thing to being told rather than inferring.
 *
 * The middle-over reading stays as the fallback. It is a proxy and it is
 * wrong at the edges, which is the whole reason for this file.
 */
let STATED_TYPE = {}
try {
  STATED_TYPE = JSON.parse(await readFile(join(ROOT, 'data/bowling.json'), 'utf8')).players
  console.log(`  ${Object.keys(STATED_TYPE).length} bowling styles read from their own articles`)
} catch {
  console.log('  ! no data/bowling.json — run `npm run bowling` to type bowlers from source')
}
let stated = 0

/** Null when there is not enough bowling to say, leaving the season's own guess. */
/*
 * Who a player was, from everything they played.
 *
 * A season is often too thin to say. Read one at a time, Hiren Varaiya is a
 * spinner in fourteen of his sixteen and a batter in the two with nothing
 * recorded; a batter who sends down a few overs on a flat day reads as a
 * bowler. So the career is added up first and asked the same question, and
 * that answer becomes the player's primary role — the thing a thin season
 * falls back to, and the thing a substantial season is allowed to overrule.
 */
const CAREER = new Map()
for (const r of rows) {
  /*
   * Only the cricket the archive actually keeps. The career was tallied over
   * every row Cricsheet had, including competitions this build drops, so a
   * player's primary role could be decided by matches that never reach the
   * game — Ashen Bandara read as an all-rounder on bowling the archive does
   * not contain, next to a career record showing one wicket in thirty-six.
   */
  if (!COMP_META[r.comp]) continue
  const c = CAREER.get(r.id) ?? {
    matches: 0, balls: 0, runs: 0, outs: 0, bowlBalls: 0, bowlRuns: 0, wickets: 0,
    midOvers: 0, keeperDismissals: 0, posSum: 0, posCount: 0, seasons: 0,
    best: null, teams: new Map(),
  }
  const t = r.stats
  c.matches += t.matches; c.balls += t.balls; c.runs += t.runs; c.outs += t.outs
  c.bowlBalls += t.bowlBalls; c.bowlRuns += t.bowlRuns; c.wickets += t.wickets
  c.midOvers += t.midOvers; c.keeperDismissals += t.keeperDismissals
  for (const p of t.positions ?? []) { c.posSum += p; c.posCount++ }
  c.seasons++
  if (!c.best || r.ovr > c.best.ovr) c.best = r
  c.teams.set(r.team, (c.teams.get(r.team) ?? 0) + 1)
  CAREER.set(r.id, c)
}

/**
 * The same reading as a season gets, on career totals — but the bars have to
 * be rates rather than counts, or a long career trips every one of them.
 *
 * Three stumpings and catches is a season's worth of evidence that somebody
 * kept wicket; across six hundred matches it is evidence that they stood in
 * once. Tendulkar came out an all-rounder and Sehwag with him, on part-time
 * overs that add up over three hundred matches and never amounted to a spell
 * in any of them. So a keeper has to keep at something like a keeper's rate,
 * and an all-rounder has to bowl two overs a match — the same spell the season
 * reading already asks for, applied to the whole career.
 */
function roleOf(c, id) {
  const battedALot = c.balls >= c.matches * 8
  const bowledALot = c.bowlBalls >= c.matches * 12
  const avgPos = c.posCount ? c.posSum / c.posCount : 11
  const type = () => bowlingType(id) ?? (c.bowlBalls && c.midOvers / c.bowlBalls >= MID_OVER_SHARE ? 'SPIN' : 'PACE')
  if (c.keeperDismissals >= Math.max(5, c.matches * 0.3)) return 'WK'
  /*
   * An all-rounder takes wickets. Overs alone made Sehwag one on part-time
   * off-spin — ninety-five wickets in three hundred and fifty-seven matches,
   * which is a batter who bowls, not a second bowling option. A wicket every
   * other match is the difference, and it is what a draft slot marked AR is
   * actually asking for.
   */
  const tookWickets = c.wickets >= c.matches * 0.5

  /*
   * Where somebody bats settles which family they are in; what they take with
   * the ball settles whether they are an all-rounder inside it. Kallis batted
   * top order and took three hundred and twenty-one wickets in three hundred
   * and seventy matches, so he is an all-rounder and comes out as one. Sehwag
   * batted top order and took ninety-five in three hundred and fifty-seven,
   * so he is a batter who bowls.
   *
   * The order matters as much as the test. Failing the all-rounder check used
   * to drop through to the next line and make them a bowler, which turned
   * Sehwag and Maxwell into spinners on the strength of the very overs they
   * had just been judged not to have earned.
   */
  if (battedALot && avgPos <= 7.5) return bowledALot && tookWickets ? 'AR' : 'BAT'
  if (bowledALot) return type()
  if (c.bowlBalls >= c.matches * 6 && avgPos >= 6.5) return type()
  return 'BAT'
}

/**
 * Whether a season has enough behind it to speak over the career.
 *
 * Volume in the discipline the season is claiming, not a match count. Counting
 * matches called a three-match tour thin and overruled it with the career,
 * which stamped Anshuman Rath a wicketkeeper over a season where he sent down
 * a hundred and eighty deliveries.
 *
 * The asymmetry is the point. Overs bowled and dismissals taken are evidence
 * that something happened; runs scored are not evidence that nothing else did.
 * So a bowling season needs overs and a keeping season needs dismissals, while
 * a batting season only overrules a bowler when there was a real summer of
 * cricket in which they did not bowl — which is what says something.
 */
const seasonSpeaks = (t, role) => {
  if (role === 'PACE' || role === 'SPIN' || role === 'AR') return t.bowlBalls >= 60
  if (role === 'WK') return t.keeperDismissals >= 3
  return t.balls >= 60 && t.matches >= 4
}

function bowlingType(id) {
  const said = STATED_TYPE[id]
  if (said) {
    stated++
    return said.type
  }
  const t = bowlingTally.get(id)
  if (!t) return null
  const [mid, balls] =
    t.t20Balls >= MIN_TYPE_BALLS ? [t.t20Mid, t.t20Balls] : [t.allMid, t.allBalls]
  if (balls < MIN_TYPE_BALLS) return null
  return mid / balls >= MID_OVER_SHARE ? 'SPIN' : 'PACE'
}

/*
 * What the player's own article says they were.
 *
 * The career reading below is good and it is still a reading: it sees overs
 * and batting positions and infers. An infobox states it — "Batsman",
 * "All-rounder", "Wicket-keeper-batsman" — which is a fact about the player
 * rather than an inference from a sample, and it settles the cases the
 * reading gets wrong in both directions.
 *
 * The reading stays for everyone with no article, which is mostly domestic
 * players with short careers.
 */
let STATED_ROLE = {}
try {
  STATED_ROLE = JSON.parse(await readFile(join(ROOT, 'data/roles.json'), 'utf8')).players
} catch {
  console.log('  no data/roles.json — roles fall back to the career reading (npm run roles)')
}
let saidRole = 0
let readRole = 0

/** Every player's primary role: what they said, else what their career shows. */
const PRIMARY_ROLE = new Map()
for (const [id, c] of CAREER) {
  const said = STATED_ROLE[id]?.role
  if (said) saidRole++
  else readRole++
  let primary = said ?? roleOf(c, id)
  /*
   * A keeper who bowls two overs a match across an entire career is not a
   * keeper, whatever anybody calls him. This catches both halves: Marillier's
   * article says wicket-keeper and he bowled five overs a match, and
   * Lokuhettige was read as one off a handful of dismissals while bowling
   * seam. Standing back once or twice is not the job.
   */
  if (primary === 'WK' && c.bowlBalls > c.matches * 12) {
    primary = roleOf({ ...c, keeperDismissals: 0 }, id)
  }
  PRIMARY_ROLE.set(id, primary)
}


let retyped = 0
let demoted = 0
let restored = 0

/**
 * What counts as a spell, by format.
 *
 * A flat bar cannot work across formats: two overs a match is a real share of
 * a T20 innings, where nobody may bowl more than four, and nothing at all in
 * a Test, where a frontline bowler sends down twenty. Kohli cleared a flat bar
 * in Test seasons on about thirteen balls a match — which is a captain turning
 * his arm over before lunch, not an all-rounder.
 *
 * A quarter of a full quota in the limited-overs games, five overs in a Test.
 */
const MIN_AR_BALLS = { T20L: 12, T20WC: 12, ODIWC: 18, TEST: 30 }
const arBar = (comp) => {
  const formats = COMP_META[comp]?.[1] ?? ['T20L']
  return Math.max(...formats.map((f) => MIN_AR_BALLS[f] ?? 12))
}

const INTL_COMPS = new Set(['t20s', 'odis', 'tests'])
/* ── Who kept wicket ───────────────────────────────────────────────────── */

/**
 * Every side that took the field had a wicketkeeper, so every squad here
 * needs one.
 *
 * Nothing in a scorecard says who it was, and a keeper can go a whole season
 * without a stumping, so stumpings alone leave squads with nobody to put in
 * the WK slot.
 *
 * But catches cannot stand in for the gloves, which is what this used to
 * assume. Scoring stumpings*4 + catches put Virat Kohli — 464 catches and not
 * one stumping in a hundred seasons — level with Dinesh Karthik at Royal
 * Challengers Bengaluru in 2024, and the tie broke toward whoever the sort
 * happened to see first. A brilliant outfielder who does not bowl looks
 * exactly like a keeper to that formula.
 *
 * A stumping is different in kind: nobody but the keeper makes one. So it is
 * used as proof rather than as weight — across a whole career, because a
 * player who kept in any season is a keeper, and one who never has is not,
 * however many catches they hold. Catches only rank the men who have already
 * proved they keep.
 */
/*
 * How much of a keeper somebody is, over a whole career.
 *
 * "Has ever kept" is too blunt. Ranking those players by their catches in one
 * season picks the best pair of hands rather than the specialist: Bangladesh's
 * 2019 T20 side handed the gloves to Mahmudullah, who has kept perhaps twice,
 * while Mushfiqur Rahim — one of the format's busiest keepers — stood in the
 * same squad as a batter. Stumpings across a career separate the two, because
 * only a keeper standing up makes them, and a specialist makes many.
 */
const KEPT_CAREER = new Map()
for (const r of rows) {
  if (!r.stats.stumpings) continue
  KEPT_CAREER.set(r.id, (KEPT_CAREER.get(r.id) ?? 0) + r.stats.stumpings)
}
const EVER_KEPT = new Set(KEPT_CAREER.keys())

const KEEPER_GLOVES = new Map()
{
  const bySquad = new Map()
  for (const r of rows) {
    if (!COMP_META[r.comp]) continue
    if (INTL_COMPS.has(r.comp) && !NATIONS[r.team]) continue
    const squadId = `${slug(teamKey(r.team, r.comp))}-${slug(r.comp)}-${r.season}`
    const list = bySquad.get(squadId) ?? []
    list.push(r)
    bySquad.set(squadId, list)
  }
  for (const [squadId, men] of bySquad) {
    // A keeper does not bowl. Anyone who sent down more than a couple of
    // overs a match is a fielder who took catches, not the man behind them.
    const candidates = men.filter((r) => r.stats.bowlBalls <= r.stats.matches * 12)
    const pool = candidates.length ? candidates : men

    const rank = (list, needEvidence) =>
      list
        .map((r) => ({ r, score: r.stats.stumpings * 100 + r.stats.catches }))
        // Only the last resort needs a dismissal to go on. A known keeper who
        // took nothing all season is still the keeper: India's single T20 of
        // 2010/11 had Dhoni behind the stumps and no dismissal to his name,
        // and requiring one handed the gloves to Kohli and his one catch.
        .filter((c) => !needEvidence || c.score > 0)
        .sort((a, b) => b.score - a.score)

    // Kept this season, then kept at some point in their career, and only
    // then — for a squad where nobody ever kept — the best pair of hands.
    const stumpedHere = pool.filter((r) => r.stats.stumpings > 0)
    // Among career keepers, the one who has kept most, then the one who took
    // most this season. Catches alone put the best fielder behind the stumps.
    const careerKeepers = pool
      .filter((r) => EVER_KEPT.has(r.id))
      .sort((a, b) => (KEPT_CAREER.get(b.id) ?? 0) - (KEPT_CAREER.get(a.id) ?? 0))
    const scored = stumpedHere.length
      ? rank(stumpedHere, false)
      : careerKeepers.length
        ? careerKeepers.map((r) => ({ r, score: KEPT_CAREER.get(r.id) ?? 0 }))
        : rank(pool, true)

    if (scored.length) KEEPER_GLOVES.set(squadId, scored[0].r.id)
  }
}

let gloved = 0

const emittedFrom = new Map()
let skippedMinor = 0

for (const r of rows) {
  const meta = COMP_META[r.comp]
  if (!meta) continue
  // A national side the game does not recognise is not a draftable opponent.
  if (INTL_COMPS.has(r.comp) && !NATIONS[r.team]) {
    skippedMinor++
    continue
  }
  const [label, formats, region] = meta
  const key = teamKey(r.team, r.comp)
  const season = r.season
  const squadId = `${slug(key)}-${slug(r.comp)}-${season}`

  if (!teams.has(key)) {
    teams.set(key, {
      key,
      region: region === 'INTL' ? 'INTL' : region,
      home: NATIONS[r.team] ?? LEAGUE_HOME[r.comp] ?? null,
    })
  }

  if (!squads.has(squadId)) {
    squads.set(squadId, {
      id: squadId,
      key,
      name: upper(r.team),
      short: SHORT[key] ?? INTL_SHORT[key] ?? upper(r.team).split(' ')[0],
      season,
      comp: `${label} ${season}`,
      formats,
    })
  }

  const pid = r.id.startsWith('name:') ? slug(r.player) : r.id
  emittedFrom.set(r.id, pid)
  if (!sourceIdOf.has(pid)) sourceIdOf.set(pid, r.id)
  if (!players.has(pid)) {
    const display = wikidataNames[r.id] ?? displayName(r.player)
    if (display !== r.player) upgraded++
    players.set(pid, {
      id: pid,
      name: display,
      surname: surnameOf(r.player),
      nation: nationOfPlayer.get(r.id) ?? 'IN',
    })
  }

  // A bowler's type is a fact about the player, not about the season.
  let role = r.role

  /*
   * An all-rounder bowls a spell. Somebody who rolls over the occasional over
   * is a batter who bowls a bit, and calling them an all-rounder puts them in
   * a draft slot meant for a second bowling option.
   *
   * Virat Kohli came out an all-rounder for six seasons on the strength of
   * about a over and a quarter a match — 151 balls across twenty one-day
   * internationals in 2013/14, two wickets. Two overs a match is the bar: it
   * is a spell, not a cameo, and it is well under what any real all-rounder
   * sends down.
   */
  if (role === 'AR' && r.stats.bowlBalls < r.stats.matches * arBar(r.comp)) {
    role = 'BAT'
    demoted++
  }

  /*
   * The career decides, unless the season has earned the right to disagree.
   *
   * A substantial season is the better description of that summer — a batter
   * who genuinely opened the bowling for a season was that, whatever the rest
   * of his career says. A thin one is not a description of anything, and used
   * to overwrite the player with an accident of what got recorded.
   */
  if (!seasonSpeaks(r.stats, role)) {
    const primary = PRIMARY_ROLE.get(r.id)
    // Never invent a bowler out of a season with no overs in it: the card would
    // read PACE beside nought overs bowled.
    /*
     * The career fills a gap; it never contradicts what is on the page.
     *
     * A bowler's role is not applied to a season with no overs in it, and a
     * keeper's is not applied to a season where the player bowled more than
     * any keeper does — Lokuhettige turned out at wicketkeeper over a season
     * he spent bowling seam. Whatever the career says, the row has to describe
     * the cricket it is a record of.
     */
    const bowls = primary === 'PACE' || primary === 'SPIN' || primary === 'AR'
    const contradicts =
      (bowls && r.stats.bowlBalls === 0) ||
      // An all-rounder who barely turned his arm over that season is not one.
      (primary === 'AR' && r.stats.bowlBalls < r.stats.matches * 6) ||
      (primary === 'WK' && r.stats.bowlBalls > r.stats.matches * 24)
    if (primary && primary !== role && !contradicts) {
      role = primary
      restored++
    }
  }

  if (KEEPER_GLOVES.get(squadId) === r.id && role !== 'WK') {
    role = 'WK'
    gloved++
  }
  if (role === 'PACE' || role === 'SPIN') {
    const settled = bowlingType(r.id)
    if (settled && settled !== role) retyped++
    role = settled ?? role
  }

  rosterRows.push({
    squad: squadId,
    player: pid,
    role,
    ovr: r.ovr,
    bat: Math.round(r.bat),
    bowl: Math.round(r.bowl),
    source: r,
  })
}

/**
 * A squad with no bowling in it is a gap in the record, not a team.
 *
 * Three sides came through with eleven batters and not one delivery bowled
 * between them — India at the 2003 World Cup among them. Nobody fielded that
 * side; it is what is left when a team's bowling innings never made it into
 * the archive. Kept, it would offer a draft eleven players who cannot bowl.
 */
{
  const bowledIn = new Set()
  for (const r of rosterRows) if (r.source.stats.bowlBalls > 0) bowledIn.add(r.squad)
  /*
   * And a side that can only find three bowlers is nearly as hollow. Kenya's
   * 2008 one-day squad came through with three, which is not an attack — the
   * shortfall is in what the archive recorded, not in the cricket, and a draft
   * offered that squad has nothing useful to take from it.
   */
  const canBowl = new Map()
  for (const r of rosterRows) {
    const bowls = r.role === 'PACE' || r.role === 'SPIN' || r.role === 'AR'
    if (bowls) canBowl.set(r.squad, (canBowl.get(r.squad) ?? 0) + 1)
  }
  const hollow = [...squads.keys()].filter(
    (id) => !bowledIn.has(id) || (canBowl.get(id) ?? 0) < 4,
  )
  if (hollow.length) {
    for (const id of hollow) squads.delete(id)
    const kept = rosterRows.filter((r) => !hollow.includes(r.squad))
    rosterRows.length = 0
    rosterRows.push(...kept)
    console.log(`  ${hollow.length} squads dropped for having no bowling attack to speak of`)
  }

  // A player or team left with nothing to appear in should not be listed.
  const livePlayers = new Set(rosterRows.map((r) => r.player))
  for (const id of [...players.keys()]) if (!livePlayers.has(id)) players.delete(id)
  const liveTeams = new Set([...squads.values()].map((s) => s.key))
  for (const key of [...teams.keys()]) if (!liveTeams.has(key)) teams.delete(key)
}

console.log(`  ${upgraded} scorecard names upgraded to full names`)
console.log(`  ${skippedMinor} rows dropped for sides outside the recognised nations`)
console.log(`  ${retyped} seasons re-typed — ${stated} of them from a stated style, the rest from the middle-over reading`)
console.log(`  ${demoted} all-rounders who never bowled a spell returned to batting`)
console.log(`  ${restored} blank seasons given back the role the player's career shows`)
console.log(`  ${gloved} players given the gloves so every squad has a keeper`)
{
  const emitted = new Set(rosterRows.map((r) => r.player))
  const tally = { cap: 0, wikidata: 0, league: 0, unknown: 0 }
  for (const [id, pid] of emittedFrom) {
    if (!emitted.has(pid)) continue
    if (nation.get(id)) tally.cap++
    else if (wikidata[id]) tally.wikidata++
    else if (homeLeague(id)) tally.league++
    else tally.unknown++
  }
  console.log(
    `  nationality: ${tally.cap} from caps, ${tally.wikidata} from Wikidata, ` +
      `${tally.league} from home league, ${tally.unknown} defaulted`,
  )
}

/* ── The three numbers on a card ───────────────────────────────────────── */

/**
 * A player card shows three figures whose meaning depends on the role —
 * BAT/CONS/SR for a batter, GUILE/WKT/ECON for a spinner. They used to be
 * invented: the overall rating, nudged by role and jittered by a hash of the
 * player's name. That reads as detail and is in fact noise, and it meant a
 * card could say a batter struck at 88 when the man had actually struck at
 * 142.
 *
 * They are now the record. Each component is ranked against everyone who
 * played the same kind of cricket, because a strike rate of 130 is ordinary
 * in a T20 and extraordinary in a Test, and a rating that ignores that says
 * nothing. Where a player did too little of something to judge — a batter who
 * faced nine balls — the figure is left null rather than guessed, and the
 * client falls back to deriving one.
 */
const FAMILY = (comp) => (comp === 'tests' ? 'TEST' : comp === 'odis' ? 'ODI' : 'T20')

const MIN_BALLS = 30       // enough to have a strike rate worth ranking
const MIN_BOWL_BALLS = 30  // five overs
const MIN_KEEP_MATCHES = 3

const metrics = {
  average: (t) => (t.balls >= MIN_BALLS ? t.runs / Math.max(1, t.outs) : null),
  strikeRate: (t) => (t.balls >= MIN_BALLS ? (100 * t.runs) / t.balls : null),
  // Lower is better, so it is negated before ranking and the percentile then
  // runs the right way round without a special case downstream.
  economy: (t) =>
    t.bowlBalls >= MIN_BOWL_BALLS ? -((6 * t.bowlRuns) / t.bowlBalls) : null,
  wicketsPerMatch: (t) =>
    t.bowlBalls >= MIN_BOWL_BALLS ? t.wickets / Math.max(1, t.matches) : null,
  keeping: (t) =>
    t.matches >= MIN_KEEP_MATCHES ? t.keeperDismissals / Math.max(1, t.matches) : null,
}

/** Percentile rank within a population, on the same 40–99 scale as ovr. */
function scaler(values) {
  const sorted = values.filter((v) => v !== null).sort((a, b) => a - b)
  return (v) => {
    if (v === null || !sorted.length) return null
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < v) lo = mid + 1
      else hi = mid
    }
    return Math.round(40 + (lo / Math.max(1, sorted.length - 1)) * 59)
  }
}

// One set of scales per kind of cricket, built from every season in it.
const scales = new Map()
for (const family of ['TEST', 'ODI', 'T20']) {
  const pool = rows.filter(
    (r) =>
      FAMILY(r.comp) === family &&
      COMP_META[r.comp] &&
      !(INTL_COMPS.has(r.comp) && !NATIONS[r.team]),
  )
  const built = {}
  for (const [name, fn] of Object.entries(metrics)) built[name] = scaler(pool.map((r) => fn(r.stats)))
  scales.set(family, built)
}

const clamp = (v) => (v === null ? null : Math.max(20, Math.min(99, v)))
const mean = (a, b) => (a === null ? b : b === null ? a : Math.round((a + b) / 2))

/** The three card figures for one player-season, in role order. */
function cardStats(r, role = r.role) {
  const sc = scales.get(FAMILY(r.comp))
  const t = r.stats
  const rate = (name) => clamp(sc[name](metrics[name](t)))
  const bat = clamp(Math.round(r.bat))
  const bowl = clamp(Math.round(r.bowl))

  switch (role) {
    case 'BAT':  return [bat, rate('average'), rate('strikeRate')]            // BAT, CONS, SR
    case 'WK':   return [rate('keeping'), bat, rate('strikeRate')]            // KEEP, BAT, SR
    case 'AR':   return [bat, bowl, mean(bat, bowl)]                          // BAT, BOWL, IMPCT
    default:     return [bowl, rate('wicketsPerMatch'), rate('economy')]      // PACE/GUILE, WKT, ECON
  }
}

/*
 * The career record, assembled once the roster is settled.
 *
 * Everything here is about the player rather than any one summer: what they
 * were, the best they ever were, and the side they are remembered for. It is
 * built from the rows that survived, so a squad dropped for having no bowling
 * cannot leave a player pointing at a team that is no longer in the archive.
 */
{
  const career = new Map()
  for (const r of rosterRows) {
    const squad = squads.get(r.squad)
    if (!squad) continue
    const c = career.get(r.player) ?? {
      peak: null, teams: new Map(), seasons: 0, matches: 0, runs: 0, wickets: 0,
    }
    if (!c.peak || r.ovr > c.peak.ovr) {
      c.peak = { ovr: r.ovr, season: squad.season, format: squad.formats[0] ?? 'T20L' }
    }
    c.teams.set(squad.key, (c.teams.get(squad.key) ?? 0) + 1)
    c.seasons++
    c.matches += r.source.stats.matches
    c.runs += r.source.stats.runs
    c.wickets += r.source.stats.wickets
    career.set(r.player, c)
  }

  for (const [pid, p] of players) {
    const c = career.get(pid)
    if (!c || !c.peak) { players.delete(pid); continue }
    // The side they turned out for most often, ties broken by name so a
    // rebuild does not shuffle them about.
    const [mainKey] = [...c.teams].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    const team = teams.get(mainKey)
    const anySquad = [...squads.values()].find((sq) => sq.key === mainKey)
    p.primaryRole = PRIMARY_ROLE.get(sourceIdOf.get(pid) ?? pid) ?? 'BAT'
    p.peakOvr = c.peak.ovr
    p.peakSeason = c.peak.season
    p.peakFormat = c.peak.format
    p.mainTeamKey = mainKey
    p.mainTeam = anySquad?.name ?? mainKey
    p.teamType = team?.region ?? 'WORLD'
    p.seasons = c.seasons
    p.matches = c.matches
    p.runs = c.runs
    p.wickets = c.wickets
  }
  console.log(`  ${players.size} players carry a career record`)
  console.log(`  primary role: ${saidRole} stated in their own article, ${readRole} read from their career`)
}

/*
 * Batting partnerships, joined to the players that survived the build.
 *
 * The pairs come from the ball-by-ball pass, keyed by Cricsheet identifiers;
 * the archive emits players under its own ids, so they are mapped across and
 * anything pointing at a player who did not make the cut is dropped.
 */
const partnerships = []
{
  let raw = []
  try {
    raw = JSON.parse(await readFile(join(ROOT, '.cricsheet/partnerships.json'), 'utf8'))
  } catch {
    console.log('  no partnerships recorded — run npm run ingest to collect them')
  }
  for (const p of raw) {
    const a = emittedFrom.get(p.a)
    const b = emittedFrom.get(p.b)
    if (!a || !b || a === b || !players.has(a) || !players.has(b)) continue
    const [x, y] = a < b ? [a, b] : [b, a]
    partnerships.push([x, y, p.balls, p.runs])
  }
  if (partnerships.length) console.log(`  ${partnerships.length} batting partnerships kept`)
}

/* ── Emit ──────────────────────────────────────────────────────────────── */

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined ? 'null' : String(v))
const arr = (l) => `'{${l.map((v) => `"${v}"`).join(',')}}'`

function insert(table, cols, rows, batch = 500) {
  const out = []
  for (let i = 0; i < rows.length; i += batch) {
    out.push(
      `insert into ${table} (${cols.join(', ')}) values\n` +
        rows.slice(i, i + batch).map((r) => `  (${r.join(', ')})`).join(',\n') +
        `;`,
    )
  }
  return out.join('\n')
}

const sql = `-- SPIN XI — archive derived from Cricsheet ball-by-ball data
-- Generated by scripts/build-archive.mjs. Do not edit by hand.
--
--   ${squads.size} squad-seasons · ${rosterRows.length} player-seasons · ${players.size} players
--
-- Ratings are computed from real runs, averages, strike rates, wickets and
-- economy, ranked by percentile within each format. Roles are inferred from
-- behaviour: keepers from stumpings, spin from the share of middle overs.
--
-- Source: https://cricsheet.org (free, downloadable, published for this use)
--
-- This file is the whole archive, not a patch. It clears the data tables
-- before loading so that a rebuild can *remove* things — a player who turns
-- out to be two people, a squad that should never have been there — which an
-- insert-and-ignore load could never do. Run schema.sql first. It is safe to
-- re-run, and it is safe to run against a populated database.

begin;

-- Children first: squad_players references both squads and players.
delete from squad_players;
delete from squads;
delete from players;
delete from teams;
delete from challenges;

${insert('challenges', ['slot', 'format', 'preset_id', 'objective', 'objective_desc', 'active'], challengeRows)}

${insert('teams', ['key', 'region', 'home_nation'], [...teams.values()].map((t) => [q(t.key), q(t.region), q(t.home)]))}

${insert(
  'players',
  ['id', 'name', 'surname', 'nation', 'primary_role', 'peak_ovr', 'peak_season',
   'peak_format', 'main_team_key', 'main_team', 'team_type', 'seasons', 'matches',
   'runs', 'wickets'],
  [...players.values()].map((p) => [
    q(p.id), q(p.name), q(p.surname), q(p.nation), q(p.primaryRole), n(p.peakOvr),
    q(p.peakSeason), q(p.peakFormat), q(p.mainTeamKey), q(p.mainTeam), q(p.teamType),
    n(p.seasons), n(p.matches), n(p.runs), n(p.wickets),
  ]),
)}

${insert('partnerships', ['player_a', 'player_b', 'balls', 'runs'], partnerships.map((p) => [q(p[0]), q(p[1]), n(p[2]), n(p[3])]))}

${insert('squads', ['id', 'team_key', 'team_name', 'team_short', 'season', 'competition', 'formats'], [...squads.values()].map((s) => [q(s.id), q(s.key), q(s.name), q(s.short), q(s.season), q(s.comp), arr(s.formats)]))}

${insert(
  'squad_players',
  ['squad_id', 'player_id', 'role', 'alt_roles', 'ovr', 'bat', 'bowl', 's1', 's2', 's3',
   'matches', 'runs', 'balls', 'outs', 'wickets', 'bowl_balls', 'bowl_runs'],
  rosterRows.map((r) => {
    const [s1, s2, s3] = cardStats(r.source, r.role)
    const t = r.source.stats
    return [
      q(r.squad), q(r.player), q(r.role), `'{}'`,
      r.ovr, r.bat, r.bowl, n(s1), n(s2), n(s3),
      t.matches, t.runs, t.balls, t.outs, t.wickets, t.bowlBalls, t.bowlRuns,
    ]
  }),
)}

commit;
`

await writeFile(join(ROOT, 'supabase/archive.sql'), sql)

// A manifest of what this build contains, so the push can prove the whole
// archive arrived rather than reporting success on a truncated load.
await writeFile(
  join(ROOT, 'supabase/archive.json'),
  JSON.stringify(
    {
      built: new Date().toISOString(),
      counts: {
        teams: teams.size,
        players: players.size,
        squads: squads.size,
        roster_rows: rosterRows.length,
        challenges: challengeRows.length,
      },
    },
    null,
    2,
  ) + '\n',
)
console.log(`\n  ${teams.size} teams · ${players.size} players · ${squads.size} squads · ${rosterRows.length} roster rows`)
console.log(`  ${(sql.length / 1048576).toFixed(1)} MB → supabase/archive.sql\n`)
