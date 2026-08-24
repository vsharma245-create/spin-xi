/**
 * Re-rates every player-season in the cached aggregate.
 *
 * Reads .cricsheet/aggregate.json, grades the competitions against one
 * another, re-scores everybody against that, and writes the file back for
 * `npm run archive` to turn into SQL. Separate from ingest because ingest
 * re-reads two gigabytes of ball-by-ball to produce the same aggregate, and
 * the rating model is worth iterating on without paying that every time.
 *
 *   npm run rerate            recompute and write
 *   npm run rerate -- --dry   report what would change, write nothing
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  battingImpact, bowlingImpact, competitionEase, SHRINK_K, zScaler,
} from './lib/ratings.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const dry = process.argv.includes('--dry')

const FORMAT_OF = {
  ipl: 'T20L', bbl: 'T20L', psl: 'T20L', cpl: 'T20L', sat: 'T20L', hnd: 'T20L',
  ntb: 'T20L', mlc: 'T20L', lpl: 'T20L', bpl: 'T20L', msl: 'T20L',
  t20s: 'T20WC', odis: 'ODIWC', tests: 'TEST',
}

/*
 * Competitions are graded within the kind of cricket they are, not within the
 * game mode they feed. T20 internationals belong with the T20 leagues — the
 * same people play both, and that overlap is the only thing that lets one be
 * measured against the other. Grouped by game mode instead, t20s sat alone in
 * its own bracket with nothing to compare against, was handed an ease of 1.00
 * by default, and every international career came out flat.
 *
 * One-day and Test cricket genuinely have no domestic peer in the archive, so
 * they keep an ease of one and lean on opponent strength, which is already
 * measured ball by ball.
 */
const FAMILY_OF = {
  ipl: 'T20', bbl: 'T20', psl: 'T20', cpl: 'T20', sat: 'T20', hnd: 'T20',
  ntb: 'T20', mlc: 'T20', lpl: 'T20', bpl: 'T20', msl: 'T20', t20s: 'T20',
  odis: 'ODI', tests: 'TEST',
}

const seasons = JSON.parse(await readFile(join(ROOT, '.cricsheet/aggregate.json'), 'utf8'))
console.log(`\n  ${seasons.length} player-seasons\n`)

/* ── Grade the competitions, by family ─────────────────────────────────── */
const byFamily = new Map()
for (const s of seasons) {
  const f = FAMILY_OF[s.comp]
  if (!f) continue
  if (!byFamily.has(f)) byFamily.set(f, [])
  byFamily.get(f).push(s)
}
const BAT_EASE = new Map()
const BOWL_EASE = new Map()
for (const [, entries] of byFamily) {
  const batable = entries.filter((s) => s.stats.balls >= 10)
  const bowlable = entries.filter((s) => s.stats.bowlBalls >= 30)
  const flat = {
    k: 0, impact: 0,
    sr: (100 * batable.reduce((n, s) => n + s.stats.runs, 0)) /
        Math.max(1, batable.reduce((n, s) => n + s.stats.balls, 0)),
    econ: (6 * bowlable.reduce((n, s) => n + s.stats.bowlRuns, 0)) /
          Math.max(1, bowlable.reduce((n, s) => n + s.stats.bowlBalls, 0)),
  }
  const b = competitionEase(batable, (s) => battingImpact(s.stats, flat, 1))
  const w = competitionEase(bowlable, (s) => bowlingImpact(s.stats, flat, 1))
  for (const [c, e] of b.ease) BAT_EASE.set(c, e)
  for (const [c, e] of w.ease) BOWL_EASE.set(c, e)
}

const byFormat = new Map()
for (const s of seasons) {
  const f = FORMAT_OF[s.comp]
  if (!f) continue
  if (!byFormat.has(f)) byFormat.set(f, [])
  byFormat.get(f).push(s)
}

const before = new Map(seasons.map((s) => [`${s.id}|${s.season}|${s.comp}`, s.ovr]))
const easeReport = []

for (const [format, entries] of byFormat) {
  const batable = entries.filter((s) => s.stats.balls >= 10)
  const bowlable = entries.filter((s) => s.stats.bowlBalls >= 30)
  const k = SHRINK_K[format] ?? 6

  const prior = {
    k,
    sr: (100 * batable.reduce((n, s) => n + s.stats.runs, 0)) /
        Math.max(1, batable.reduce((n, s) => n + s.stats.balls, 0)),
    econ: (6 * bowlable.reduce((n, s) => n + s.stats.bowlRuns, 0)) /
          Math.max(1, bowlable.reduce((n, s) => n + s.stats.bowlBalls, 0)),
    impact: 0,
  }
  const batPrior = { ...prior, impact: 0 }
  const bowlPrior = { ...prior, impact: 0 }

  const bi = (s) => battingImpact(s.stats, batPrior, BAT_EASE.get(s.comp) ?? 1)
  const wi = (s) => bowlingImpact(s.stats, bowlPrior, BOWL_EASE.get(s.comp) ?? 1)

  const rb = batable.map(bi).filter((v) => v !== null)
  batPrior.impact = rb.reduce((a, b) => a + b, 0) / Math.max(1, rb.length)
  const rw = bowlable.map(wi).filter((v) => v !== null)
  bowlPrior.impact = rw.reduce((a, b) => a + b, 0) / Math.max(1, rw.length)

  const batScale = zScaler(entries.map(bi).filter((v) => v !== null))
  const bowlScale = zScaler(entries.map(wi).filter((v) => v !== null))

  for (const s of entries) {
    const bat = batScale(bi(s)) ?? 40
    const bowl = bowlScale(wi(s)) ?? 40
    const role = s.role
    const ovr =
      role === 'BAT' || role === 'WK' ? bat * 0.88 + bowl * 0.12
      : role === 'AR' ? bat * 0.5 + bowl * 0.5
      : bat * 0.16 + bowl * 0.84
    s.bat = bat
    s.bowl = bowl
    s.ovr = Math.max(40, Math.min(99, Math.round(ovr)))
  }

  for (const comp of [...new Set(entries.map((s) => s.comp))].sort()) {
    easeReport.push({
      format, competition: comp,
      batting: +(BAT_EASE.get(comp) ?? 1).toFixed(3),
      bowling: +(BOWL_EASE.get(comp) ?? 1).toFixed(3),
    })
  }
}

console.log('  How freely runs and wickets came, by competition (1.00 = the game as a whole)')
console.log('  Lower means harder — a run there is worth more.\n')
console.table(easeReport)

const bands = { '95-99': 0, '90-94': 0, '85-89': 0, '80-84': 0, '70-79': 0, 'under 70': 0 }
const best = new Map()
for (const s of seasons) {
  if (!FORMAT_OF[s.comp]) continue
  if (!best.has(s.id) || s.ovr > best.get(s.id).ovr) best.set(s.id, s)
}
for (const s of best.values()) {
  const o = s.ovr
  bands[o >= 95 ? '95-99' : o >= 90 ? '90-94' : o >= 85 ? '85-89' : o >= 80 ? '80-84' : o >= 70 ? '70-79' : 'under 70']++
}
console.log(`\n  Career-best rating, ${best.size} players`)
console.table(Object.entries(bands).map(([band, players]) => ({ band, players })))

console.log('\n  The forty best seasons in the archive — the real test of whether this reads right:')
for (const s2 of [...seasons].filter((x) => FORMAT_OF[x.comp]).sort((a, b) => b.ovr - a.ovr).slice(0, 40)) {
  console.log(`   ${s2.ovr}  ${(s2.player ?? '').padEnd(24)} ${s2.comp} ${s2.season} ${s2.role}`)
}

console.log('\n  The names the feedback raised:')
const look = ['Tendulkar', 'Dravid', 'Ponting', 'Kallis', 'Sehwag', 'Muralitharan', 'Warne',
  'Davison', 'Leverock', 'Dhaniram', 'Brangman', 'Akhtar', 'Brett Lee', 'Johnson']
for (const name of look) {
  const hits = [...best.values()].filter((s) => (s.player ?? '').includes(name))
  for (const h of hits.slice(0, 2)) {
    console.log(`   ${String(h.ovr).padStart(2)}  was ${String(before.get(`${h.id}|${h.season}|${h.comp}`) ?? '?').padStart(2)}   ${h.player} (${h.comp} ${h.season})`)
  }
}

if (dry) { console.log('\n  --dry, nothing written\n'); process.exit(0) }
await writeFile(join(ROOT, '.cricsheet/aggregate.json'), JSON.stringify(seasons))
console.log('\n  written to .cricsheet/aggregate.json — run `npm run archive` next\n')
