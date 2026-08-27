/**
 * Is the engine playing cricket?
 *
 * Scores now emerge from the eleven rather than being handed down, which means
 * nothing guarantees they land anywhere sensible. This plays thousands of
 * innings between real sides and checks the things a follower of the game
 * would notice within one over: what a par score is, how the rate moves
 * through an innings, whether the openers outscore the tail, whether a good
 * attack is worth anything, and whether the better side actually wins.
 *
 *   npm run engine:check
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { hydrate, SQUADS } from '../src/data/squads'
import { buildSlots, makeRng, openSlotsFor, place, rulesFor, xiOf } from '../src/game/draft'
import { attackFrom, orderFrom, playInnings, playMatchOut } from '../src/game/engine'
import { conditionsFor } from '../src/game/conditions'
import type { DraftConfig, Format, PitchType, PlayerSeason } from '../src/game/types'

const db = new PGlite()
await db.exec(await readFile('supabase/schema.sql', 'utf8'))
await db.exec(await readFile('supabase/archive.sql', 'utf8'))
hydrate((await db.query('select * from roster_feed')).rows as never[])

const config = (format: Format): DraftConfig => ({
  format, scope: 'ALL', teamKey: null, years: null, presetId: 'BALANCED',
  ratingMode: 'SEASON', hideRatings: false, difficulty: 'NORMAL', liveToss: false,
  worldTeams: true, overseasCap: false, teamName: 'XI',
})

/**
 * An XI at a chosen level.
 *
 * Picking worst-first squad by squad does not produce a poor side — the slot
 * rules fill it with whatever fits, and it came out only a dozen rating points
 * below the best team in the archive, which is no test of anything. Every
 * player in the format goes into one pool, sorted, and the side is built from
 * a band of it.
 */
function build(format: Format, band: 'elite' | 'good' | 'club'): PlayerSeason[] {
  const all = SQUADS.filter((s) => s.formats.includes(format)).flatMap((s) => s.players)
  const sorted = [...all].sort((a, b) => b.ovr - a.ovr)
  const from =
    band === 'elite' ? sorted : band === 'good' ? sorted.slice(Math.floor(sorted.length * 0.35)) : [...sorted].reverse()
  let slots = buildSlots('BALANCED')
  const rules = rulesFor(config(format))
  for (const p of from) {
    const open = openSlotsFor(p, slots, rules)
    if (!open.length) continue
    slots = place(slots, p, open[0])
    if (slots.every((s) => s.player)) break
  }
  return xiOf(slots)
}

const strengthOfXI = (xi: PlayerSeason[]) => {
  const bat = xi.reduce((a, p) => a + p.bat, 0) / xi.length
  const bowl = [...xi].sort((a, b) => b.bowl - a.bowl).slice(0, 5).reduce((a, p) => a + p.bowl, 0) / 5
  return { bat, bowl, overall: bat * 0.5 + bowl * 0.5 }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0
}

const faults: string[] = []
const expect = (ok: boolean, what: string, saw: string) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what.padEnd(46)} ${saw}`)
  if (!ok) faults.push(what)
}

const PITCHES: PitchType[] = ['BATTING', 'PACE', 'SPIN', 'NEUTRAL']

for (const format of ['T20L', 'ODIWC', 'TEST'] as Format[]) {
  /*
   * Par is what evenly matched sides make. Measuring the best side in the
   * archive against a club attack is not a par score, it is a mismatch, and
   * it reported a Test average of 521.
   */
  const even = build(format, 'good')
  const good = build(format, 'elite')
  const poor = build(format, 'club')
  if (even.length < 11 || good.length < 11 || poor.length < 11) continue

  const shape = (xi: PlayerSeason[]) => {
    const x = strengthOfXI(xi)
    return `bat ${x.bat.toFixed(0)} / attack ${x.bowl.toFixed(0)}`
  }
  console.log(
    `\n  ── ${format} ──   elite: ${shape(good)}   even: ${shape(even)}   club: ${shape(poor)}`,
  )
  const totals: number[] = []
  const wkts: number[] = []
  const phases = { power: [0, 0], middle: [0, 0], death: [0, 0] }
  const byPosition: number[][] = Array.from({ length: 11 }, () => [])
  const vsGood: number[] = []
  const vsPoor: number[] = []

  for (let i = 0; i < 300; i++) {
    const rand = makeRng(9000 + i)
    const pitch = PITCHES[i % 4]
    const conditions = conditionsFor(format, pitch, rand)
    const r = playInnings({
      batting: orderFrom(even), attack: attackFrom(even, pitch),
      format, pitch, conditions, rand,
    })
    totals.push(r.runs)
    wkts.push(r.wickets)
    r.bat.forEach((b, k) => { if (b.came) byPosition[k].push(b.runs) })

    let seen = 0
    for (const d of r.deliveries) {
      const f = seen / Math.max(1, r.balls)
      if (d.legal) seen++
      const box = f < 0.3 ? phases.power : f < 0.8 ? phases.middle : phases.death
      box[0] += d.runs
      box[1] += d.legal ? 1 : 0
    }
    vsPoor.push(
      playInnings({ batting: orderFrom(even), attack: attackFrom(poor, pitch), format, pitch, conditions, rand: makeRng(9000 + i) }).runs,
    )
    vsGood.push(
      playInnings({ batting: orderFrom(even), attack: attackFrom(good, pitch), format, pitch, conditions, rand: makeRng(9000 + i) }).runs,
    )
  }

  const par = { T20L: [140, 200], T20WC: [130, 195], ODIWC: [230, 330], TEST: [260, 460] }[format]!
  const avg = mean(totals)
  expect(avg >= par[0] && avg <= par[1], 'a par score for the format',
    `${avg.toFixed(0)} (${pct(totals, 0.1).toFixed(0)}–${pct(totals, 0.9).toFixed(0)} typical)`)
  expect(mean(wkts) >= 3 && mean(wkts) <= 9, 'wickets a side loses', mean(wkts).toFixed(1))

  const rate = (b: number[]) => (b[1] ? (b[0] / b[1]) * 6 : 0)
  const pw = rate(phases.power), md = rate(phases.middle), dt = rate(phases.death)
  console.log(`       run rate: powerplay ${pw.toFixed(1)}, middle ${md.toFixed(1)}, death ${dt.toFixed(1)}`)
  if (format !== 'TEST') {
    expect(dt > md, 'the death overs are the fastest', `${dt.toFixed(1)} against ${md.toFixed(1)}`)
    expect(pw > md * 0.9, 'the powerplay is not the slowest', `${pw.toFixed(1)} against ${md.toFixed(1)}`)
  }

  const top = mean([...byPosition[0], ...byPosition[1], ...byPosition[2]])
  const tail = mean([...byPosition[8], ...byPosition[9], ...byPosition[10]])
  expect(top > tail * 1.8, 'the top order outscores the tail', `${top.toFixed(0)} against ${tail.toFixed(0)}`)

  const drop = mean(vsPoor) - mean(vsGood)
  expect(drop > (format === 'TEST' ? 15 : 8), 'a good attack costs the batting side runs',
    `${drop.toFixed(0)} fewer against the better attack`)
}

/* ── Does the better side win, and does it win more the better it is? ── */
console.log('\n  ── who wins ──')
for (const format of ['T20L', 'ODIWC'] as Format[]) {
  const bands = ['elite', 'good', 'club'] as const
  const sides = Object.fromEntries(bands.map((b) => [b, build(format, b)])) as Record<
    (typeof bands)[number], PlayerSeason[]
  >
  const rates: number[] = []
  for (const [a, b] of [
    ['elite', 'club'],
    ['elite', 'good'],
    ['good', 'club'],
  ] as const) {
    let won = 0
    const games = 300
    for (let i = 0; i < games; i++) {
      const rand = makeRng(31000 + i)
      const pitch = PITCHES[i % 4]
      const conditions = conditionsFor(format, pitch, rand)
      const first = playInnings({ batting: orderFrom(sides[a]), attack: attackFrom(sides[b], pitch), format, pitch, conditions, rand })
      const second = playInnings({ batting: orderFrom(sides[b]), attack: attackFrom(sides[a], pitch), format, pitch, conditions, rand, target: first.runs + 1 })
      if (!second.chased) won++
    }
    const rate = (won / games) * 100
    const gap = strengthOfXI(sides[a]).overall - strengthOfXI(sides[b]).overall
    rates.push(rate)
    console.log(`       ${format} ${a} v ${b}: ${rate.toFixed(0)}% over ${games}   (${gap.toFixed(0)} rating points apart)`)
  }
  /*
   * A forty-six point gap is Australia against a village side and should be
   * close to a certainty. The contest worth checking is the eighteen-point
   * one, which has to stay a contest — a prime XI losing three of eleven to
   * Scotland was the complaint that started all of this.
   */
  expect(rates[0] >= 90, `${format}: a club side is beaten almost every time`, `${rates[0].toFixed(0)}%`)
  expect(rates[1] >= 62 && rates[1] <= 84, `${format}: a good side is beaten but not always`, `${rates[1].toFixed(0)}%`)
  expect(rates[0] > rates[1] && rates[0] > rates[2], `${format}: a bigger gap wins more often`, `${rates.map((r) => r.toFixed(0)).join('% / ')}%`)
}

/* ── Does the pitch mean something to a particular player? ── */
console.log('\n  ── matchups and fielding ──')
{
  const all = SQUADS.filter((s) => s.formats.includes('T20L')).flatMap((s) => s.players)
  // Only players the archive has enough of to have split anything.
  const spread = all.filter((p) => p.vsSpin > 0 && p.vsPace > 0 && p.bat >= 45)
  const gap = spread.map((p) => p.vsSpin - p.vsPace)
  const wide = gap.filter((g) => Math.abs(g) >= 8).length
  expect(spread.length > 200, 'players carry a pace and a spin rating', `${spread.length} of them`)
  expect(wide / spread.length > 0.15, 'the two ratings actually differ', `${((wide / spread.length) * 100).toFixed(0)}% differ by 8+`)

  const best = [...spread].sort((a, b) => b.vsSpin - b.vsPace - (a.vsSpin - a.vsPace))[0]
  const worst = [...spread].sort((a, b) => a.vsSpin - a.vsPace - (b.vsSpin - b.vsPace))[0]
  console.log(`       best against spin : ${best.name} ${best.season} — pace ${best.vsPace}, spin ${best.vsSpin}`)
  console.log(`       worst             : ${worst.name} ${worst.season} — pace ${worst.vsPace}, spin ${worst.vsSpin}`)

  // A side that cannot play spin should suffer on a turner and not elsewhere.
  const even = build('T20L', 'good')
  const spin = build('T20L', 'good')
  let onTurner = 0
  let onFlat = 0
  for (let i = 0; i < 200; i++) {
    const rand = makeRng(80000 + i)
    onTurner += playInnings({ batting: orderFrom(even), attack: attackFrom(spin, 'SPIN'), format: 'T20L', pitch: 'SPIN', conditions: conditionsFor('T20L', 'SPIN', rand), rand }).runs
    onFlat += playInnings({ batting: orderFrom(even), attack: attackFrom(spin, 'BATTING'), format: 'T20L', pitch: 'BATTING', conditions: conditionsFor('T20L', 'BATTING', makeRng(80000 + i)), rand: makeRng(80000 + i) }).runs
  }
  /*
   * A turner does not only cost runs, it takes wickets — which shortens the
   * innings and hides some of the difference in the total. Five runs on a
   * hundred and sixty is the surface being worth something.
   */
  expect(onFlat / 200 > onTurner / 200 + 5, 'a batting surface is worth runs a turner is not',
    `${(onFlat / 200).toFixed(0)} flat against ${(onTurner / 200).toFixed(0)} turning`)

  // Catches go down, and not too many of them.
  let chances = 0
  let floored = 0
  for (let i = 0; i < 200; i++) {
    const r = playInnings({ batting: orderFrom(even), attack: attackFrom(spin, 'NEUTRAL'), format: 'T20L', pitch: 'NEUTRAL', conditions: conditionsFor('T20L', 'NEUTRAL', makeRng(9 + i)), rand: makeRng(9 + i) })
    for (const d of r.deliveries) {
      if (d.dropped) { floored++; chances++ }
      if (d.wicket) chances++
    }
  }
  const rate = (floored / Math.max(1, chances)) * 100
  expect(rate > 2 && rate < 22, 'catches go down, but not constantly', `${rate.toFixed(0)}% of chances floored`)
}

/* ── Whole matches, including the ones nobody wins ── */
console.log('\n  ── whole matches ──')
for (const format of ['T20L', 'ODIWC', 'TEST'] as Format[]) {
  const a = build(format, 'good')
  const b = build(format, 'good')
  if (a.length < 11 || b.length < 11) continue
  const outcomes = { W: 0, L: 0, D: 0 }
  const margins: string[] = []
  for (let i = 0; i < 300; i++) {
    const rand = makeRng(52000 + i)
    const pitch = PITCHES[i % 4]
    const m = playMatchOut({
      xi: a, them: b, format, pitch,
      conditions: conditionsFor(format, pitch, rand),
      rand, battedFirst: i % 2 === 0,
    })
    outcomes[m.outcome]++
    if (margins.length < 4) margins.push(`${m.ourRuns}/${m.ourWickets} v ${m.theirRuns}/${m.theirWickets} — ${m.outcome} ${m.margin}`)
  }
  const drawn = (outcomes.D / 300) * 100
  console.log(`       ${format}: ${outcomes.W} won, ${outcomes.L} lost, ${outcomes.D} drawn`)
  for (const m of margins) console.log(`         ${m}`)
  expect(Math.abs(outcomes.W - outcomes.L) < 90, `${format}: two equal sides are close to even`,
    `${outcomes.W}–${outcomes.L}`)
  if (format === 'TEST')
    expect(drawn > 8 && drawn < 65, 'Tests can be drawn, and often are', `${drawn.toFixed(0)}% drawn`)
  else expect(outcomes.D === 0, `${format}: no draws in a limited-overs game`, `${outcomes.D}`)
}

console.log('')
if (faults.length) {
  console.log(`  ${faults.length} thing${faults.length === 1 ? '' : 's'} the engine is not doing yet\n`)
  process.exit(1)
}
console.log('  the engine is playing cricket\n')
