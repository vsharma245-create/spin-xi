/**
 * Reads a thousand scorecards looking for cricket that cannot happen.
 *
 * The card is built by spreading a decided result across the eleven, so it can
 * never disagree with the score — but it could, and did, disagree with the
 * laws. Three runs off one ball and out lbw: the single ball he faced was the
 * one that got him, and he had scored three off it. Eleven dismissals against
 * ten wickets, because the man left stranded was given an entry too. And 4.4
 * overs in a twenty-over game.
 *
 * Every check here is something a scorer would refuse to write down.
 *
 *   npm run cards:check
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { hydrate, SQUADS } from '../src/data/squads'
import { buildSlots, makeRng, openSlotsFor, place, rulesFor } from '../src/game/draft'
import { playSeason } from '../src/game/sim'
import type { DraftConfig, Format, MatchResult } from '../src/game/types'

const db = new PGlite()
await db.exec(await readFile('supabase/schema.sql', 'utf8'))
await db.exec(await readFile('supabase/archive.sql', 'utf8'))
hydrate((await db.query('select * from roster_feed')).rows as never[])

const faults = new Map<string, { n: number; eg: string }>()
const fault = (what: string, eg: string) => {
  const f = faults.get(what) ?? { n: 0, eg }
  f.n++
  faults.set(what, f)
}

function checkMatch(m: MatchResult, format: Format) {
  const c = m.card
  for (const side of [
    { name: 'us', bat: c.batting ?? [], score: c.ourScore, extras: c.ourExtras ?? 0, bowl: c.ourBowling ?? [] },
    { name: 'them', bat: c.theirBatting ?? [], score: c.theirScore, extras: c.theirExtras ?? 0, bowl: c.theirBowling ?? [] },
  ]) {
    const batted = side.bat.filter((b) => !b.dnb)
    const runs = batted.reduce((a, b) => a + b.runs, 0)

    const outs = batted.filter((b) => b.out).length

    if (runs + side.extras !== side.score.runs)
      fault('batting runs do not add up to the total', `${runs}+${side.extras} vs ${side.score.runs}`)
    if (outs !== side.score.wickets)
      fault('batters out do not match the wickets',
        `${outs} out, ${side.score.wickets} down (${format})`)
    if (side.score.wickets > 10) fault('more than ten wickets', String(side.score.wickets))
    if (batted.filter((b) => !b.out).length > 2 && side.score.wickets < 10)
      fault('more than two not out', String(batted.filter((b) => !b.out).length))

    for (const b of batted) {
      if (b.runs > b.balls * 6) fault('more runs than six a ball', `${b.name} ${b.runs} off ${b.balls}`)
      if (b.out && b.how !== 'run out' && b.runs > 6 * (b.balls - 1))
        fault('scored off the ball that dismissed them', `${b.name} ${b.runs} off ${b.balls} ${b.how}`)
      if (b.balls < 0 || b.runs < 0) fault('negative runs or balls', b.name)
    }

    const opp = side.name === 'us' ? c.theirScore : c.ourScore
    const bowlWk = side.bowl.reduce((a, x) => a + x.wickets, 0)
    if (bowlWk > opp.wickets)
      fault('bowlers claim more wickets than fell', `${bowlWk} vs ${opp.wickets}`)
    for (const x of side.bowl) {
      if (x.wickets > 10) fault('a bowler took more than ten', `${x.name} ${x.wickets}`)
      const ov = Number(x.overs)
      if (ov > (format === 'TEST' ? 62 : format === 'ODIWC' ? 10 : 4) + 0.01)
        fault('a bowler exceeded the quota', `${x.name} ${x.overs} in ${format}`)
    }
  }
  if (format !== 'TEST') {
    // Rain moves the target, so a side can win having made fewer runs. That is
    // the whole point of a revised target and not a fault on the card.
    if (m.outcome === 'W' && c.ourScore.runs < c.theirScore.runs && !m.battedFirst && !c.rain)
      fault('won a chase without passing the target', `${c.ourScore.runs} v ${c.theirScore.runs}`)
    // The same the other way: rain can beat a side that made more runs.
    if (m.outcome === 'L' && m.battedFirst && c.ourScore.runs > c.theirScore.runs && !c.rain)
      fault('lost while defending a bigger total', `${c.ourScore.runs} v ${c.theirScore.runs}`)
  }
}

const formats: Format[] = ['T20L', 'ODIWC', 'T20WC', 'TEST']
let matches = 0
for (const format of formats) {
  const config: DraftConfig = {
    format, scope: 'ALL', teamKey: null, years: null, presetId: 'BALANCED',
    ratingMode: 'SEASON', hideRatings: false, difficulty: 'NORMAL', liveToss: false,
    worldTeams: true, overseasCap: false, teamName: 'XI',
  }
  let slots = buildSlots(config.presetId)
  const rules = rulesFor(config)
  outer: for (const squad of SQUADS.filter((s) => s.formats.includes(format))) {
    for (const p of [...squad.players].sort((a, b) => b.ovr - a.ovr)) {
      const open = openSlotsFor(p, slots, rules)
      if (!open.length) continue
      slots = place(slots, p, open[0])
      if (slots.every((s) => s.player)) break outer
    }
  }
  for (let s = 0; s < 25; s++) {
    const r = playSeason(slots, null, makeRng(1000 + s), config, 'XI')
    for (const m of [...r.matches, ...r.knockouts]) { checkMatch(m, format); matches++ }
  }
  slots = buildSlots(config.presetId)
}
/* ── Aggressive players should actually play aggressively ─────────────── */
{
  /*
   * Runs and balls used to be shared out on the batting rating alone, so two
   * players rated alike scored at the same speed and Sehwag ground out fifties
   * off sixty-nine balls. The card carries each batter's strike rate, ranked
   * against the format, and the innings is supposed to follow it.
   *
   * Measured by splitting the batters in every innings into the quick and the
   * slow by what their card says, and comparing what they actually did with
   * the bat. If the two groups score at the same rate then the card is being
   * ignored again, whatever the code looks like.
   */
  const quick: number[] = []
  const slow: number[] = []
  const config: DraftConfig = {
    format: 'T20L', scope: 'ALL', teamKey: null, years: null, presetId: 'BALANCED',
    ratingMode: 'SEASON', hideRatings: false, difficulty: 'NORMAL', liveToss: false,
    worldTeams: true, overseasCap: false, teamName: 'XI',
  }
  const rules = rulesFor(config)
  let xi = buildSlots(config.presetId)
  outer2: for (const squad of SQUADS.filter((s2) => s2.formats.includes('T20L'))) {
    for (const p of [...squad.players].sort((a, b) => b.ovr - a.ovr)) {
      const open = openSlotsFor(p, xi, rules)
      if (!open.length) continue
      xi = place(xi, p, open[0])
      if (xi.every((s2) => s2.player)) break outer2
    }
  }
  const srOf = new Map(
    xi.filter((s2) => s2.player).map((s2) => s2.player!).map((p) => [p.surname.toUpperCase(), p.stats.find((st) => st.label === 'SR')?.value]),
  )
  /*
   * Split by this XI's own spread rather than a fixed number. A side picked
   * for ratings can be all anchors or all hitters, and a fixed cut then puts
   * nobody in one of the groups and measures nothing.
   */
  const spread = [...srOf.values()].filter((v): v is number => v !== undefined).sort((a, b) => a - b)
  const cut = {
    low: spread[Math.floor(spread.length * 0.34)] ?? 0,
    high: spread[Math.floor(spread.length * 0.66)] ?? 99,
  }
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const run = playSeason(xi, null, makeRng(seed), config, 'XI')
    for (const m of [...run.matches, ...run.knockouts]) {
      for (const line of m.card?.batting ?? []) {
        if (line.dnb || line.balls < 10) continue
        const sr = srOf.get(line.name)
        if (sr === undefined) continue
        const scored = (100 * line.runs) / line.balls
        if (sr >= cut.high) quick.push(scored)
        else if (sr <= cut.low) slow.push(scored)
      }
    }
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
  const fast = mean(quick)
  const steady = mean(slow)
  const ok = quick.length > 20 && slow.length > 20 && fast > steady * 1.08 && cut.high > cut.low
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} the hitters on the card actually hit — ` +
      `${fast.toFixed(0)} against ${steady.toFixed(0)} runs per hundred balls ` +
      `(cards reading ${cut.high}+ against ${cut.low}-, ${quick.length} innings vs ${slow.length})`,
  )
  if (!ok) faults.set('aggressive players score no faster than anchors', { n: 1, eg: `${fast.toFixed(0)} vs ${steady.toFixed(0)}` })
}

console.log(`  checked ${matches} match cards across four formats`)
if (!faults.size) console.log('  no impossible cricket found')
for (const [what, f] of faults) console.log(`  ${String(f.n).padStart(5)} × ${what}  e.g. ${f.eg}`)
process.exit(faults.size ? 1 : 0)
