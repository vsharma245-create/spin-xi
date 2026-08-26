/**
 * Replays every innings of a few thousand matches and checks that the innings
 * that comes back out is the one that went in.
 *
 * The replay is only worth watching if it is true. A scoreboard that reaches
 * 184/6 when the card says 186/6, or a batter who finishes on 43 off 30 in the
 * replay and 41 off 31 on the card, is worse than no replay at all — the
 * scorecard the player opens afterwards would contradict the match they just
 * sat through.
 *
 *   npm run play:check
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { hydrate, SQUADS } from '../src/data/squads'
import { buildSlots, makeRng, openSlotsFor, place, rulesFor } from '../src/game/draft'
import { playSeason } from '../src/game/sim'
import { playMatchCard } from '../src/game/playback'
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

let innings = 0
let deliveries = 0
let backToBack = 0
let overs = 0

/**
 * A T20 innings has a shape: a powerplay, a middle where the field is out and
 * the singles are worked, and a death where it goes. Runs laid down at one flat
 * rate produced 18 for none off four balls and then a becalmed last over, which
 * is every phase of a T20 innings except the right ones.
 */
const phase = { power: 0, middle: 0, death: 0, powerBalls: 0, middleBalls: 0, deathBalls: 0 }
/** How often the first two overs are already worth more than a run a ball. */
let hotStarts = 0
let starts = 0
/** A five off the bat is legal and vanishingly rare. It should stay that way. */
let fives = 0
let offBat = 0
/** Three in an over is a collapse. Four is a thing that happens twice a decade. */
let tripleOvers = 0
let quadOvers = 0
let allOvers = 0
/** How long the men at the bottom of the card were actually out there. */
let tailBalls = 0
let tailInnings = 0

function checkMatch(m: MatchResult) {
  for (const inn of playMatchCard(m, 'XI')) {
    innings++
    deliveries += inn.deliveries.length
    const card = inn.ours === m.battedFirst

    /* ── The board has to end where the card ends ── */
    const last = inn.frames[inn.frames.length - 1]
    if (!last) {
      if (inn.runs > 0) fault('an innings with runs and no deliveries', `${inn.runs}`)
      continue
    }
    if (last.runs !== inn.runs) fault('frames and deliveries disagree on the total', `${last.runs} v ${inn.runs}`)

    /* ── Batters ── */
    const batted = inn.batting.filter((b) => !b.dnb)
    const runsBy = new Map<number, number>()
    const ballsBy = new Map<number, number>()
    for (const d of inn.deliveries) {
      runsBy.set(d.striker, (runsBy.get(d.striker) ?? 0) + d.batRuns)
      if (d.legal) ballsBy.set(d.striker, (ballsBy.get(d.striker) ?? 0) + 1)
    }
    batted.forEach((b, i) => {
      if ((runsBy.get(i) ?? 0) !== b.runs)
        fault('a batter finished on a different score', `${b.name} ${runsBy.get(i) ?? 0} not ${b.runs}`)
      if ((ballsBy.get(i) ?? 0) !== b.balls)
        fault('a batter faced a different number of balls', `${b.name} ${ballsBy.get(i) ?? 0} not ${b.balls}`)
    })

    /* ── Totals ── */
    const legal = inn.deliveries.filter((d) => d.legal).length
    if (inn.balls !== legal) fault('legal ball count drifted', `${inn.balls} v ${legal}`)
    if (inn.overs !== inn.score.overs) fault('the replay lasted different overs', `${inn.overs} v ${inn.score.overs}`)
    if (inn.runs !== inn.score.runs) fault('the replay ended on a different total', `${inn.runs} v ${inn.score.runs}`)
    if (inn.wickets !== batted.filter((b) => b.out).length)
      fault('wickets in the replay do not match the card', `${inn.wickets}`)

    /* ── Dismissals ── */
    const fell = inn.deliveries.filter((d) => d.wicket)
    fell.forEach((d, i) => {
      if (d.wicket!.batter !== batted[i]?.name)
        fault('wickets fell out of batting order', `${d.wicket!.batter} at ${i + 1}`)
      if (d.wicket!.how !== 'run out' && d.striker !== i)
        fault('a batter was dismissed at the wrong end', `${d.wicket!.batter} ${d.wicket!.how}`)
      if (d.wicket!.how !== 'run out' && d.batRuns > 0)
        fault('scored off the ball that dismissed them', `${d.wicket!.batter} ${d.batRuns}`)
    })

    /* ── Extras ── */
    const extras = inn.deliveries.reduce((a, d) => a + (d.runs - d.batRuns), 0)
    if (extras !== inn.extras)
      fault('the extras in the replay do not match the card', `${extras} v ${inn.extras}`)
    for (const d of inn.deliveries) {
      if (d.runs - d.batRuns > 5)
        fault('an impossible number of extras off one delivery', `${d.runs - d.batRuns} ${d.extra}`)
      if (d.runs > 7) fault('more than seven off a delivery', String(d.runs))
    }

    /* ── Bowling figures read off the replay ── */
    const bowlRuns = inn.bowling.reduce((a, b) => a + b.runs, 0)
    const bowlWk = inn.bowling.reduce((a, b) => a + b.wickets, 0)
    if (inn.bowling.length && bowlRuns > inn.runs)
      fault('bowlers conceded more than were scored', `${bowlRuns} v ${inn.runs}`)
    if (bowlWk > inn.wickets) fault('bowlers claim more wickets than fell', `${bowlWk} v ${inn.wickets}`)
    for (const b of inn.bowling) {
      if (b.runs < 0 || b.wickets < 0) fault('negative bowling figures', b.name)
    }

    /* ── Overs ── */
    const byOver = new Map<number, number>()
    for (const d of inn.deliveries) byOver.set(d.over, (byOver.get(d.over) ?? 0) + (d.legal ? 1 : 0))
    const seen: number[] = []
    for (const d of inn.deliveries) if (seen[d.over] === undefined) seen[d.over] = d.bowlerIdx
    for (let o = 1; o < seen.length; o++) {
      overs++
      if (seen[o] !== undefined && seen[o] === seen[o - 1]) backToBack++
    }
    if (m.card.innings === undefined) {
      const fellIn = new Map<number, number>()
      for (const d of inn.deliveries) if (d.wicket) fellIn.set(d.over, (fellIn.get(d.over) ?? 0) + 1)
      allOvers += byOver.size
      for (const n of fellIn.values()) {
        if (n >= 3) tripleOvers++
        if (n >= 4) quadOvers++
      }
      batted.forEach((b, i) => {
        if (i >= 7) {
          tailBalls += b.balls
          tailInnings++
        }
      })
    }
    for (const [o, n] of byOver) {
      if (n > 6) fault('more than six legal balls in an over', `over ${o + 1}: ${n}`)
      if (n < 6 && o !== Math.max(...byOver.keys())) fault('a short over mid-innings', `over ${o + 1}: ${n}`)
    }

    /* ── The shape of a T20 innings ── */
    if (m.card.innings === undefined && inn.balls >= 100) {
      /*
       * Measured against how far through the innings each ball was, not
       * against the over number. A chase won in the sixteenth over has a
       * death too — its last four overs — and counting only overs seventeen
       * to twenty scored those innings as though they had no end at all.
       */
      let sofar = 0
      for (const d of inn.deliveries) {
        const f = sofar / inn.balls
        if (d.legal) sofar++
        if (f < 0.3) { phase.power += d.runs; phase.powerBalls += d.legal ? 1 : 0 }
        else if (f < 0.8) { phase.middle += d.runs; phase.middleBalls += d.legal ? 1 : 0 }
        else { phase.death += d.runs; phase.deathBalls += d.legal ? 1 : 0 }
      }
      starts++
      for (const d of inn.deliveries) {
        if (d.legal) offBat++
        if (d.batRuns === 5) fives++
      }
      const first12 = inn.deliveries.filter((d) => d.over < 2).reduce((a, d) => a + d.runs, 0)
      if (first12 > 18) hotStarts++
    }

    /* ── Chase ── */
    if (inn.target !== null && inn.deliveries.length) {
      const chased = inn.runs >= inn.target
      const wonIt = card ? false : true
      void wonIt
      if (chased && inn.wickets >= 10) fault('all out and past the target', `${inn.runs}/${inn.wickets}`)
    }
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
  // Two very different sides, so the replay is not only tested on a great one.
  for (const strong of [true, false]) {
    let slots = buildSlots(config.presetId)
    const rules = rulesFor(config)
    const pool = SQUADS.filter((s) => s.formats.includes(format))
    outer: for (const squad of strong ? pool : [...pool].reverse()) {
      for (const p of [...squad.players].sort((a, b) => (strong ? b.ovr - a.ovr : a.ovr - b.ovr))) {
        const open = openSlotsFor(p, slots, rules)
        if (!open.length) continue
        slots = place(slots, p, open[0])
        if (slots.every((s) => s.player)) break outer
      }
    }
    if (!slots.every((s) => s.player)) continue
    for (let s = 0; s < 18; s++) {
      const r = playSeason(slots, null, makeRng(4200 + s), config, 'XI')
      for (const m of [...r.matches, ...r.knockouts]) {
        checkMatch(m)
        matches++
      }
    }
  }
}

console.log(`\n  replayed ${innings.toLocaleString()} innings across ${matches.toLocaleString()} matches`)
console.log(`  ${deliveries.toLocaleString()} deliveries reconstructed`)
console.log(`  ${((backToBack / Math.max(1, overs)) * 100).toFixed(1)}% of overs bowled by the man who bowled the last one\n`)

if (starts > 0) {
  const rate = (r: number, b: number) => (b ? (r / b) * 6 : 0)
  const pw = rate(phase.power, phase.powerBalls)
  const md = rate(phase.middle, phase.middleBalls)
  const dt = rate(phase.death, phase.deathBalls)
  console.log(
    `  T20 shape — powerplay ${pw.toFixed(1)}, middle ${md.toFixed(1)}, death ${dt.toFixed(1)} an over` +
      `  ·  ${((hotStarts / starts) * 100).toFixed(1)}% of innings past 18 in the first two`,
  )
  if (dt <= md) fault('the death overs went slower than the middle', `${dt.toFixed(1)} v ${md.toFixed(1)}`)
  if (pw > dt) fault('the powerplay outscored the death overs', `${pw.toFixed(1)} v ${dt.toFixed(1)}`)
  console.log(
    `  ${((tripleOvers / Math.max(1, allOvers)) * 100).toFixed(2)}% of overs took three wickets, ` +
      `${((quadOvers / Math.max(1, allOvers)) * 100).toFixed(2)}% took four` +
      `  ·  numbers 8 to 11 face ${(tailBalls / Math.max(1, tailInnings)).toFixed(1)} balls each`,
  )
  if (quadOvers / Math.max(1, allOvers) > 0.001)
    fault('four wickets in an over is happening far too often', `${((quadOvers / Math.max(1, allOvers)) * 100).toFixed(2)}%`)
  if (tripleOvers / Math.max(1, allOvers) > 0.02)
    fault('three wickets in an over is happening far too often', `${((tripleOvers / Math.max(1, allOvers)) * 100).toFixed(2)}%`)
  if (tailBalls / Math.max(1, tailInnings) < 4)
    fault('the tail is not given enough deliveries to be dismissed off', `${(tailBalls / Math.max(1, tailInnings)).toFixed(1)}`)
  console.log(`  a five off the bat every ${offBat && fives ? Math.round(offBat / fives).toLocaleString() : '∞'} deliveries`)
  if (fives / Math.max(1, offBat) > 0.0015)
    fault('fives off the bat are not rare enough', `1 in ${Math.round(offBat / Math.max(1, fives))}`)
  if (hotStarts / starts > 0.2)
    fault('too many innings explode out of the blocks', `${((hotStarts / starts) * 100).toFixed(0)}%`)
  console.log('')
}

if (!faults.size) {
  console.log('  every replay ends exactly where its card does\n')
} else {
  for (const [what, f] of [...faults].sort((a, b) => b[1].n - a[1].n))
    console.log(`  ${String(f.n).padStart(6)}  ${what}  (e.g. ${f.eg})`)
  console.log('')
  process.exit(1)
}
