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

/* ── Full names, borrowed from the hand-written archive ────────────────── */

let fullNames = new Map()
try {
  const { execFileSync } = await import('node:child_process')
  const { build } = await import('esbuild')
  const tmp = join(ROOT, '.cricsheet/names-entry.mjs')
  await writeFile(
    tmp,
    `import { ROSTERS } from ${JSON.stringify(join(ROOT, 'src/data/rosters.ts'))}
     const out = new Set()
     for (const r of ROSTERS) for (const row of r[6]) out.add(row[0])
     process.stdout.write(JSON.stringify([...out]))`,
  )
  const bundled = join(ROOT, '.cricsheet/names.mjs')
  await build({ entryPoints: [tmp], bundle: true, platform: 'node', format: 'esm', outfile: bundled, logLevel: 'error' })
  const names = JSON.parse(execFileSync(process.execPath, [bundled]).toString())
  /**
   * "Virat Kohli" is findable from "V Kohli" — same surname, same first
   * initial. But "R Khan" fits Rashid, Rahel, Robiul and Rameez alike, and
   * guessing there would put one man's name on five different cricketers. Any
   * key that more than one full name answers to is dropped.
   */
  const ambiguous = new Set()
  for (const full of names) {
    const parts = full.split(' ')
    if (parts.length < 2) continue
    const k = `${parts[0][0]}|${upper(parts.slice(1).join(' '))}`
    if (fullNames.has(k) && fullNames.get(k) !== full) ambiguous.add(k)
    fullNames.set(k, full)
  }
  for (const k of ambiguous) fullNames.delete(k)
  if (ambiguous.size) console.log(`  ${ambiguous.size} names too ambiguous to match, left as scorecard form`)
  console.log(`  ${names.length} hand-written names available for upgrading`)
} catch (err) {
  console.log(`  (no hand-written names to merge: ${err.message})`)
}

/**
 * Only an abbreviated scorecard name gets expanded. "Rashid Khan" is already
 * written out in full, so there is nothing to look up and nothing to get wrong.
 */
/**
 * The name to print on a card.
 *
 * A scorecard abbreviates — "RG Sharma" — because a scorecard has a column to
 * fit. A player card has a line for the given name above the surname, and
 * "RG" is not a given name. Wikidata is asked first, since it is joined on an
 * identifier and so cannot mistake one man for another; the hand-written
 * archive is the fallback, and it matches on initial and surname, which three
 * different Khans can share.
 */
const displayName = (scorecard) => {
  const parts = scorecard.split(' ')
  const abbreviated = parts.length >= 2 && /^[A-Z]{1,3}$/.test(parts[0])
  if (!abbreviated) return scorecard
  return fullNames.get(`${parts[0][0]}|${surnameOf(scorecard)}`) ?? scorecard
}

/* ── Shape ─────────────────────────────────────────────────────────────── */

const teams = new Map()
const players = new Map()
const squads = new Map()
const rosterRows = []
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
const MID_OVER_SHARE = 0.45   // validated against 29 bowlers of known type
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

/** Null when there is not enough bowling to say, leaving the season's own guess. */
function bowlingType(id) {
  const t = bowlingTally.get(id)
  if (!t) return null
  const [mid, balls] =
    t.t20Balls >= MIN_TYPE_BALLS ? [t.t20Mid, t.t20Balls] : [t.allMid, t.allBalls]
  if (balls < MIN_TYPE_BALLS) return null
  return mid / balls >= MID_OVER_SHARE ? 'SPIN' : 'PACE'
}

let retyped = 0

const INTL_COMPS = new Set(['t20s', 'odis', 'tests'])
/* ── Who kept wicket ───────────────────────────────────────────────────── */

/**
 * Every side that took the field had a wicketkeeper, so every squad here
 * needs one.
 *
 * Nothing in a scorecard says who it was, and reading it off stumpings alone
 * left a quarter of squads without a keeper — a keeper can easily go a whole
 * season without a stumping, and then the draft has nobody to put in the WK
 * slot. Catches are the broader signal: the keeper takes more of them than
 * any fielder, and a stumping is still proof, so it counts for more.
 *
 * The best candidate in each squad takes the gloves. Somebody has to.
 */
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
    const scored = (candidates.length ? candidates : men)
      .map((r) => ({ r, score: r.stats.stumpings * 4 + r.stats.catches }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
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
  const hollow = [...squads.keys()].filter((id) => !bowledIn.has(id))
  if (hollow.length) {
    for (const id of hollow) squads.delete(id)
    const kept = rosterRows.filter((r) => !hollow.includes(r.squad))
    rosterRows.length = 0
    rosterRows.push(...kept)
    console.log(`  ${hollow.length} squads dropped for having no bowling recorded`)
  }

  // A player or team left with nothing to appear in should not be listed.
  const livePlayers = new Set(rosterRows.map((r) => r.player))
  for (const id of [...players.keys()]) if (!livePlayers.has(id)) players.delete(id)
  const liveTeams = new Set([...squads.values()].map((s) => s.key))
  for (const key of [...teams.keys()]) if (!liveTeams.has(key)) teams.delete(key)
}

console.log(`  ${upgraded} scorecard names upgraded to full names`)
console.log(`  ${skippedMinor} rows dropped for sides outside the recognised nations`)
console.log(`  ${retyped} seasons re-typed to the bowler's career pace/spin reading`)
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

/* ── Daily challenges ──────────────────────────────────────────────────── */

/**
 * The day's puzzle is a rotation rather than a row per date, so every player
 * sees the same challenge on the same day without anyone having to keep a
 * calendar topped up. Eighty-four slots is the lowest common multiple of the
 * three cycles below, which is the point at which a pairing of format, shape
 * and objective would start repeating.
 */
const FORMAT_CYCLE = ['T20L', 'ODIWC', 'T20L', 'T20WC', 'T20L', 'TEST', 'ODIWC']
const PRESET_CYCLE = ['BALANCED', 'CLASSIC_ODI', 'BALANCED', 'PACE_BATTERY', 'BALANCED', 'AR_ARMY']
const OBJECTIVES = [
  ['SET AND DEFEND', 'Win 4+ matches batting first.'],
  ['CHASE MASTER', 'Win 5+ matches chasing a target.'],
  ['GO UNBEATEN', 'Finish the group stage without a loss.'],
  ['LIFT THE TROPHY', 'Win the final. Nothing else counts.'],
]
const challengeRows = Array.from({ length: 84 }, (_, slot) => {
  const [title, desc] = OBJECTIVES[slot % OBJECTIVES.length]
  return [
    slot,
    `'${FORMAT_CYCLE[slot % FORMAT_CYCLE.length]}'`,
    `'${PRESET_CYCLE[slot % PRESET_CYCLE.length]}'`,
    `'${title}'`,
    `'${desc}'`,
    'true',
  ]
})

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

${insert('players', ['id', 'name', 'surname', 'nation'], [...players.values()].map((p) => [q(p.id), q(p.name), q(p.surname), q(p.nation)]))}

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
