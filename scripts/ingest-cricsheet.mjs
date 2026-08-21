/**
 * Builds the archive from Cricsheet ball-by-ball data.
 *
 *   npm run ingest            all competitions
 *   npm run ingest -- ipl     just one
 *
 * Cricsheet (https://cricsheet.org) publishes every match as JSON, free, for
 * exactly this purpose. Nothing here is scraped.
 *
 * What comes out is a squad list and a rating for every player-season, both
 * derived rather than asserted:
 *
 *   squads   whoever actually took the field for that team that season
 *   roles    inferred from behaviour, since the data records what happened
 *            rather than what anyone is labelled — see inferRole
 *   ratings  computed from runs, average, strike rate, wickets and economy,
 *            then mapped onto 40–99 by percentile *within a format*, because a
 *            Test average of 50 and a T20 average of 30 are both excellent and
 *            no fixed formula makes them comparable
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const CACHE = join(ROOT, '.cricsheet')

/** Competition → how the game files it. */
const COMPS = {
  ipl: { label: 'T20 LEAGUE', format: 'T20L', region: 'IN', kind: 'league' },
  bbl: { label: 'BIG BASH', format: 'T20L', region: 'WORLD', kind: 'league' },
  psl: { label: 'PSL', format: 'T20L', region: 'WORLD', kind: 'league' },
  cpl: { label: 'CPL', format: 'T20L', region: 'WORLD', kind: 'league' },
  sat: { label: 'SA20', format: 'T20L', region: 'WORLD', kind: 'league' },
  hnd: { label: 'THE HUNDRED', format: 'T20L', region: 'WORLD', kind: 'league' },
  ntb: { label: 'T20 BLAST', format: 'T20L', region: 'WORLD', kind: 'league' },
  mlc: { label: 'MLC', format: 'T20L', region: 'WORLD', kind: 'league' },
  lpl: { label: 'LPL', format: 'T20L', region: 'WORLD', kind: 'league' },
  bpl: { label: 'BPL', format: 'T20L', region: 'WORLD', kind: 'league' },
  msl: { label: 'MZANSI SUPER LEAGUE', format: 'T20L', region: 'WORLD', kind: 'league' },
  t20s: { label: 'T20 INTERNATIONAL', format: 'T20WC', region: 'INTL', kind: 'intl' },
  odis: { label: 'ODI', format: 'ODIWC', region: 'INTL', kind: 'intl' },
  tests: { label: 'TEST', format: 'TEST', region: 'INTL', kind: 'intl' },
}

/* ── Download ──────────────────────────────────────────────────────────── */

async function ensure(key) {
  const dir = join(CACHE, key)
  if (existsSync(dir)) return dir
  const zip = join(CACHE, `${key}.zip`)
  await mkdir(CACHE, { recursive: true })
  process.stdout.write(`  downloading ${key}… `)
  execFileSync('curl', ['-sfL', '-o', zip, `https://cricsheet.org/downloads/${key}_json.zip`])
  await mkdir(dir, { recursive: true })
  execFileSync('unzip', ['-oq', zip, '-d', dir])
  console.log('ok')
  return dir
}

/* ── Aggregation ───────────────────────────────────────────────────────── */

const blank = () => ({
  matches: 0,
  runs: 0,
  balls: 0,
  outs: 0,
  fifties: 0,
  positions: [],
  bowlBalls: 0,
  bowlRuns: 0,
  wickets: 0,
  midOvers: 0,
  keeperDismissals: 0,
  catches: 0,
  stumpings: 0,
  oppStrength: 0,
})

/**
 * Key a player-season to a team, because that is the draftable unit.
 *
 * Keyed on Cricsheet's registry identifier rather than the name: two different
 * cricketers can share a scorecard name — there is an Afghan Rashid Khan and a
 * Nepali one — and merging them invents a player who never existed.
 */
const SEP = '|~|'
const key = (player, team, season, comp) => `${player}|~|${team}|~|${season}|~|${comp}`

async function collect(compKey, agg, teamSeasons) {
  const dir = await ensure(compKey)
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'README.txt')
  let used = 0

  for (const file of files) {
    let match
    try {
      match = JSON.parse(await readFile(join(dir, file), 'utf8'))
    } catch {
      continue
    }
    const info = match.info ?? {}
    /**
     * The season, exactly as recorded — "2019" or "2019/20".
     *
     * Taking the year before the slash looked tidier and merged seasons that
     * are not the same season: the Indian league's 2009 and 2009/10 are two
     * different tournaments a year apart, and both were being filed as 2009,
     * so one squad ended up holding two years of players. Seventy pairs of
     * seasons collapsed that way, most of them international. A split season
     * is what cricket calls it, and it is the only label that keeps them
     * apart.
     */
    const season = String(info.season ?? '')
    if (!season || !info.players) continue
    // Men's cricket only, to keep one rating scale honest.
    if (info.gender && info.gender !== 'male') continue
    used++

    // name → stable identifier, for this match
    const idOf = info.registry?.people ?? {}
    const ident = (name) => idOf[name] ?? `name:${name}`

    const sides = Object.keys(info.players)
    const teamOf = {}
    for (const [team, players] of Object.entries(info.players)) {
      const opponent = sides.find((t) => t !== team)
      const id = `${team}|~|${season}|~|${compKey}`
      const set = teamSeasons.get(id) ?? { team, season, comp: compKey, players: new Set() }
      teamSeasons.set(id, set)
      for (const p of players) {
        set.players.add(p)
        teamOf[p] = team
        const k = key(ident(p), team, season, compKey)
        if (!agg.has(k)) agg.set(k, { ...blank(), name: p, id: ident(p) })
        agg.get(k).matches++
        agg.get(k).oppStrength += standardOf(compKey, opponent)
      }
    }

    const get = (p) => {
      const t = teamOf[p]
      if (!t) return null
      const k = key(ident(p), t, season, compKey)
      if (!agg.has(k)) agg.set(k, { ...blank(), name: p, id: ident(p) })
      return agg.get(k)
    }

    for (const inn of match.innings ?? []) {
      const order = new Map()
      let seasonRuns = new Map()
      for (const over of inn.overs ?? []) {
        for (const ball of over.deliveries ?? []) {
          const extras = ball.extras ?? {}

          const bat = get(ball.batter)
          if (bat) {
            bat.runs += ball.runs.batter
            if (!('wides' in extras)) bat.balls++
            seasonRuns.set(ball.batter, (seasonRuns.get(ball.batter) ?? 0) + ball.runs.batter)
          }
          for (const nm of [ball.batter, ball.non_striker]) {
            if (!order.has(nm)) order.set(nm, order.size + 1)
          }

          const bowl = get(ball.bowler)
          if (bowl) {
            bowl.bowlRuns += ball.runs.total - (extras.byes ?? 0) - (extras.legbyes ?? 0)
            if (!('wides' in extras) && !('noballs' in extras)) bowl.bowlBalls++
            // Middle overs are spin's territory; the new ball and the death are not.
            if (over.over >= 6 && over.over < 16) bowl.midOvers++
          }

          for (const w of ball.wickets ?? []) {
            const out = get(w.player_out)
            if (out) out.outs++
            if (bowl && !['run out', 'retired hurt', 'retired out', 'obstructing the field'].includes(w.kind)) {
              bowl.wickets++
            }
            /**
             * Who kept wicket is never stated, so it is read off the
             * dismissals. Stumping is proof — nobody else can do it — but
             * counting only stumpings missed every keeper who went a season
             * without one, which left a quarter of squads with nobody to
             * take the gloves. Catches are the weaker signal and are counted
             * too; the keeper takes more of them than anyone else.
             */
            for (const f of w.fielders ?? []) {
              const k = get(f.name)
              if (!k) continue
              if (w.kind === 'stumped') { k.stumpings++; k.keeperDismissals += 3 }
              else if (w.kind === 'caught') k.catches++
            }
          }
        }
      }
      for (const [nm, pos] of order) get(nm)?.positions.push(pos)
      for (const [nm, r] of seasonRuns) if (r >= 50) get(nm).fifties++
    }
  }
  return used
}

/* ── Roles ─────────────────────────────────────────────────────────────── */

/**
 * The data says who bowled which over and who took the stumping; it never says
 * "off-spinner". These are the three questions that can be answered from
 * behaviour, in the order that matters.
 */
/**
 * How good the opposition was, on a scale where a Full Member is 1.
 *
 * A hundred against Australia and a hundred against Bermuda are the same
 * number and not the same innings. Ranked on raw output alone, the associate
 * game wins: Canada's Sunil Dhaniram came out the highest-rated one-day
 * season in the archive, ahead of every player who has actually faced a
 * Test attack, because he made his runs against sides that could not bowl.
 *
 * The tiers are ICC status, not opinion — Full Membership, then the
 * associates trusted with one-day internationals, then everyone else.
 * Franchise cricket needs none of this: a league plays itself, so every side
 * in it faces the same standard.
 */
const FULL_MEMBERS = new Set([
  'India', 'Australia', 'England', 'Pakistan', 'Sri Lanka', 'West Indies',
  'South Africa', 'New Zealand', 'Afghanistan', 'Bangladesh', 'Ireland', 'Zimbabwe',
])
const ODI_ASSOCIATES = new Set([
  'Netherlands', 'Scotland', 'United Arab Emirates', 'Nepal', 'Oman', 'Namibia',
  'United States of America', 'Papua New Guinea', 'Canada', 'Kenya', 'Hong Kong', 'Bermuda',
])
const INTERNATIONAL = new Set(['t20s', 'odis', 'tests'])

function standardOf(compKey, opponent) {
  if (!INTERNATIONAL.has(compKey)) return 1
  if (!opponent) return 0.8
  if (FULL_MEMBERS.has(opponent)) return 1
  if (ODI_ASSOCIATES.has(opponent)) return 0.78
  return 0.6
}

function inferRole(s) {
  const overs = s.bowlBalls / 6
  const battedALot = s.balls >= s.matches * 8
  const bowledALot = overs >= s.matches * 1.2
  const midShare = s.bowlBalls ? s.midOvers / s.bowlBalls : 0
  const bowlingType = midShare >= 0.45 ? 'SPIN' : 'PACE'
  const avgPos = s.positions.length
    ? s.positions.reduce((a, b) => a + b, 0) / s.positions.length
    : 11

  if (s.keeperDismissals >= 3) return 'WK'
  if (bowledALot && battedALot && avgPos <= 7.5) return 'AR'
  if (bowledALot) return bowlingType
  if (overs >= s.matches * 0.5 && avgPos >= 6.5) return bowlingType
  return 'BAT'
}

/* ── Ratings ───────────────────────────────────────────────────────────── */

/**
 * Small samples are mostly noise, so both measures are pulled toward the
 * format's own average in proportion to how little was seen. A player with two
 * innings ends up near the middle where they belong, rather than at 99 or 40
 * on the strength of one shot.
 */

/** Average standard of the sides this player-season was played against. */
const standard = (s) => (s.matches ? s.oppStrength / s.matches : 1)

/**
 * Regression to the mean, measured in matches rather than deliveries.
 *
 * Impact is a per-match rate, so it is a short season that inflates it, not a
 * short spell — and shrinking by balls faced could not see that. Andrew
 * McBrine played two Tests in 2024, made 189 runs and took 11 wickets, and
 * came out the highest-rated Test season in the archive, ahead of every
 * player who has done it for a summer. Five hundred deliveries is plenty by
 * the old measure; two matches is no evidence at all by this one.
 *
 * K is roughly a third of a full season, so a player with a season behind
 * them is judged mostly on themselves, and a player with two matches is
 * judged mostly on the average.
 */
const regress = (rate, matches, mean, k) => (rate * matches + mean * k) / (matches + k)

function battingImpact(s, prior) {
  if (s.balls < 10) return null
  const perInnings = s.runs / Math.max(1, s.matches)
  const sr = (100 * s.runs) / s.balls
  const raw = perInnings * (sr / prior.sr) * standard(s)
  return regress(raw, s.matches, prior.impact, prior.k)
}

function bowlingImpact(s, prior) {
  if (s.bowlBalls < 30) return null
  const perMatch = s.wickets / Math.max(1, s.matches)
  const econ = (6 * s.bowlRuns) / s.bowlBalls
  const raw = perMatch * (prior.econ / Math.max(2, econ)) * standard(s)
  return regress(raw, s.matches, prior.impact, prior.k)
}

/** Percentile rank → 40–99. Self-calibrating, so eras and formats compare. */
function scaler(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return (v) => {
    if (v === null) return null
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

/* ── Run ───────────────────────────────────────────────────────────────── */

const want = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const keys = want.length ? want : Object.keys(COMPS)

console.log(`\ningesting ${keys.length} competition${keys.length === 1 ? '' : 's'}\n`)

const agg = new Map()
const teamSeasons = new Map()
let matches = 0
for (const k of keys) {
  if (!COMPS[k]) {
    console.log(`  ${k}: unknown competition, skipping`)
    continue
  }
  const n = await collect(k, agg, teamSeasons)
  matches += n
  console.log(`  ${k}: ${n} matches`)
}

console.log(`\n${matches} matches · ${teamSeasons.size} team-seasons · ${agg.size} player-seasons`)

// Priors and scales are per format, so a Test batter is ranked against Test
// batters rather than against T20 hitters.
const byFormat = new Map()
for (const [k, s] of agg) {
  const comp = k.split(SEP)[3]
  const f = COMPS[comp].format
  if (!byFormat.has(f)) byFormat.set(f, [])
  byFormat.get(f).push([k, s])
}

const ratings = new Map()
for (const [format, entries] of byFormat) {
  const batBalls = entries.filter(([, s]) => s.balls >= 10)
  const bowlBalls = entries.filter(([, s]) => s.bowlBalls >= 30)
  // A season is 14 league games, 8-10 in a World Cup year, 8-12 Tests.
  const K = { T20L: 5, T20WC: 4, ODIWC: 4, TEST: 4 }[format] ?? 5
  const prior = {
    k: K,
    sr:
      (100 * batBalls.reduce((n, [, s]) => n + s.runs, 0)) /
      Math.max(1, batBalls.reduce((n, [, s]) => n + s.balls, 0)),
    econ:
      (6 * bowlBalls.reduce((n, [, s]) => n + s.bowlRuns, 0)) /
      Math.max(1, bowlBalls.reduce((n, [, s]) => n + s.bowlBalls, 0)),
    impact: 0,
  }
  const batPrior = { ...prior, impact: 0 }
  const rawBat = batBalls.map(([, s]) => battingImpact(s, batPrior)).filter((v) => v !== null)
  batPrior.impact = rawBat.reduce((a, b) => a + b, 0) / Math.max(1, rawBat.length)
  const bowlPrior = { ...prior, impact: 0 }
  const rawBowl = bowlBalls.map(([, s]) => bowlingImpact(s, bowlPrior)).filter((v) => v !== null)
  bowlPrior.impact = rawBowl.reduce((a, b) => a + b, 0) / Math.max(1, rawBowl.length)

  const batScale = scaler(entries.map(([, s]) => battingImpact(s, batPrior)).filter((v) => v !== null))
  const bowlScale = scaler(entries.map(([, s]) => bowlingImpact(s, bowlPrior)).filter((v) => v !== null))

  for (const [k, s] of entries) {
    const role = inferRole(s)
    const bat = batScale(battingImpact(s, batPrior)) ?? 40
    const bowl = bowlScale(bowlingImpact(s, bowlPrior)) ?? 40
    // A card's overall leans on whichever discipline the role is judged by.
    const ovr =
      role === 'BAT' || role === 'WK'
        ? bat * 0.88 + bowl * 0.12
        : role === 'AR'
          ? bat * 0.5 + bowl * 0.5
          : bat * 0.16 + bowl * 0.84
    ratings.set(k, { role, bat, bowl, ovr: Math.max(40, Math.min(99, Math.round(ovr))), stats: s })
  }
  console.log(
    `  ${format}: ${entries.length} player-seasons · prior SR ${prior.sr.toFixed(0)} econ ${prior.econ.toFixed(2)}`,
  )
}

await writeFile(
  join(CACHE, 'aggregate.json'),
  JSON.stringify(
    [...ratings].map(([k, v]) => {
      const [id, team, season, comp] = k.split(SEP)
      return { id, player: v.stats.name ?? id, team, season, comp, ...v }
    }),
  ),
)

console.log(`\nwrote ${ratings.size} rated player-seasons to .cricsheet/aggregate.json`)
console.log('Next: scripts/build-seed-from-cricsheet.mjs turns this into SQL.\n')
