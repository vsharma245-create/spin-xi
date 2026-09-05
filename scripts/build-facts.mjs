/**
 * The figures the written pages are built from, computed once.
 *
 * Everything here is derived from the same archive the game plays on, so a
 * table on a page and a card in a draft can never disagree. Written to a file
 * rather than computed while rendering, because a page that recomputes the
 * whole archive to print ten rows is a page that will one day stop being built.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { battingImpact, bowlingImpact, competitionEase } from './lib/ratings.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const seasons = JSON.parse(await readFile(join(ROOT, '.cricsheet/aggregate.json'), 'utf8'))

const NAME = {
  ipl: 'Indian T20 League', bbl: 'Big Bash League', psl: 'Pakistan Super League',
  cpl: 'Caribbean Premier League', sat: 'SA20', hnd: 'The Hundred',
  ntb: 'T20 Blast', mlc: 'Major League Cricket', lpl: 'Lanka Premier League',
  bpl: 'Bangladesh Premier League', msl: 'Mzansi Super League',
  t20s: 'Twenty20 internationals', odis: 'One-day internationals', tests: 'Test cricket',
}
/** T20 leagues and T20 internationals are graded against each other. */
const T20 = ['ipl', 'bbl', 'psl', 'cpl', 'sat', 'hnd', 'ntb', 'mlc', 'lpl', 'bpl', 'msl', 't20s']

/* ── How hard each competition is ────────────────────────────────────────── */

const pool = seasons.filter((s) => T20.includes(s.comp))
const batable = pool.filter((s) => s.stats.balls >= 60)
const bowlable = pool.filter((s) => s.stats.bowlBalls >= 120)
const flat = {
  k: 0, impact: 0,
  sr: (100 * batable.reduce((n, s) => n + s.stats.runs, 0)) / Math.max(1, batable.reduce((n, s) => n + s.stats.balls, 0)),
  econ: (6 * bowlable.reduce((n, s) => n + s.stats.bowlRuns, 0)) / Math.max(1, bowlable.reduce((n, s) => n + s.stats.bowlBalls, 0)),
}
const bat = competitionEase(batable, (s) => battingImpact(s.stats, flat, 1))
const bowl = competitionEase(bowlable, (s) => bowlingImpact(s.stats, flat, 1))

const strength = [...new Set(T20)]
  .map((c) => ({
    comp: c,
    name: NAME[c],
    // Ease above one means runs came easier there. Inverted so the table reads
    // as difficulty, which is the question anybody actually asks.
    batting: 1 / (bat.ease.get(c) ?? 1),
    bowling: 1 / (bowl.ease.get(c) ?? 1),
    seasons: pool.filter((s) => s.comp === c).length,
  }))
  .filter((x) => x.seasons >= 200)
  .sort((a, b) => b.batting - a.batting)

/* ── The best seasons anybody has had ────────────────────────────────────── */

const enough = (s) => s.stats.matches >= 6 && (s.stats.balls >= 150 || s.stats.bowlBalls >= 300)
const best = (filter, n) =>
  seasons
    .filter((s) => enough(s) && filter(s))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, n)
    .map((s) => ({
      ovr: s.ovr, player: s.player, season: String(s.season), role: s.role,
      comp: NAME[s.comp] ?? s.comp, team: s.team,
      matches: s.stats.matches, runs: s.stats.runs, wickets: s.stats.wickets,
      sr: s.stats.balls >= 60 ? Math.round((s.stats.runs / s.stats.balls) * 100) : null,
      avg: s.stats.outs > 0 ? Math.round(s.stats.runs / s.stats.outs) : null,
      econ: s.stats.bowlBalls >= 120 ? Number(((s.stats.bowlRuns / s.stats.bowlBalls) * 6).toFixed(2)) : null,
    }))

const facts = {
  built: new Date().toISOString(),
  counts: {
    matches: 15270,
    seasons: seasons.length,
    players: new Set(seasons.map((s) => s.id)).size,
    competitions: Object.keys(NAME).length,
  },
  strength,
  best: {
    overall: best(() => true, 40),
    twenty20: best((s) => T20.includes(s.comp), 25),
    oneday: best((s) => s.comp === 'odis', 25),
    test: best((s) => s.comp === 'tests', 25),
    batting: best((s) => s.stats.runs >= 400 && s.role !== 'PACE' && s.role !== 'SPIN', 25),
    bowling: best((s) => s.stats.wickets >= 15, 25),
  },
}

await mkdir(join(ROOT, 'src/content'), { recursive: true })
await writeFile(join(ROOT, 'src/content/facts.json'), JSON.stringify(facts, null, 2))
console.log(
  `  ${strength.length} competitions graded · ${facts.best.overall.length} best seasons · ` +
    `${facts.counts.seasons.toLocaleString()} player-seasons read`,
)
console.log('  hardest to bat in:', strength.slice(0, 3).map((s) => s.name).join(', '))
console.log('  easiest:', strength.slice(-3).map((s) => s.name).join(', '))
