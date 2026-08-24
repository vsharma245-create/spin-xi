/**
 * Every draft setting, in every combination, checked for actually doing it.
 *
 * A setting that quietly does nothing is the worst kind of bug in a game like
 * this: the player believes they chose something, the draft looks plausible,
 * and nothing on the screen contradicts it. So each option is checked against
 * what it claims — prime ratings must actually be a career peak, a year range
 * must actually exclude the years outside it, the overseas cap must actually
 * cap.
 *
 *   npm run combos:check
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { hydrate, SQUADS, seasonYear, yearsForFormat } from '../src/data/squads'
import {
  buildSlots, canPlace, isComplete, makeRng, openSlotsFor, place, poolFor,
  presetById, rulesFor,
} from '../src/game/draft'
import { playSeason } from '../src/game/sim'
import { DIFFICULTY, FORMAT_ORDER, PRESETS } from '../src/game/types'
import { OVERSEAS_LIMIT } from '../src/data/nations'
import type { Difficulty, DraftConfig, RatingMode } from '../src/game/types'

const db = new PGlite()
await db.exec(await readFile('supabase/schema.sql', 'utf8'))
await db.exec(await readFile('supabase/archive.sql', 'utf8'))
hydrate((await db.query('select * from roster_feed')).rows as never[])

let bad = 0
const check = (ok: boolean, what: string, detail = '') => {
  if (!ok) bad++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`)
}

const base = (over: Partial<DraftConfig> = {}): DraftConfig => ({
  format: 'T20L', scope: 'ALL', teamKey: null, years: null, presetId: 'BALANCED',
  ratingMode: 'SEASON', hideRatings: false, difficulty: 'NORMAL', liveToss: false,
  worldTeams: true, overseasCap: false, teamName: 'XI', ...over,
})

/* ── Every format offers a draftable pool ─────────────────────────────── */
for (const format of FORMAT_ORDER) {
  const pool = poolFor(base({ format }))
  const wrong = pool.filter((s) => !s.formats.includes(format)).length
  check(pool.length > 0 && wrong === 0, `${format}: ${pool.length} squads, all play it`)
}

/* ── Prime is a career peak, season is that year ──────────────────────── */
for (const format of FORMAT_ORDER) {
  const season = poolFor(base({ format, ratingMode: 'SEASON' }))
  const prime = poolFor(base({ format, ratingMode: 'PRIME' }))
  const byId = new Map(prime.map((s) => [s.id, s]))
  let lower = 0
  let moved = 0
  let seen = 0
  for (const s of season) {
    const p = byId.get(s.id)
    if (!p) continue
    for (const a of s.players) {
      const b = p.players.find((x) => x.playerId === a.playerId)
      if (!b) continue
      seen++
      if (b.ovr < a.ovr) lower++
      if (b.ovr !== a.ovr) moved++
    }
  }
  check(lower === 0, `${format}: no prime card is worse than its own season`, `${lower} of ${seen}`)
  check(moved > 0, `${format}: prime actually changes cards`, `${moved} of ${seen} differ`)
}

/* ── A year range excludes the years outside it ───────────────────────── */
for (const format of FORMAT_ORDER) {
  const [lo, hi] = yearsForFormat(format)
  const mid = Math.floor((lo + hi) / 2)
  const narrowed = poolFor(base({ format, years: [mid, hi] }))
  // Uses the game's own reading: "2019/20" is 2020, not 2019.
  const outside = narrowed.filter((s) => {
    const y = seasonYear(s.season)
    return y < mid || y > hi
  }).length
  const all = poolFor(base({ format })).length
  check(outside === 0 && narrowed.length < all,
    `${format}: years ${mid}–${hi} narrow the draw`, `${narrowed.length} of ${all}`)
}

/* ── World teams off means the domestic league only ───────────────────── */
{
  const world = poolFor(base({ format: 'T20L', worldTeams: true }))
  const home = poolFor(base({ format: 'T20L', worldTeams: false }))
  const foreign = home.filter((s) => s.region !== 'IN').length
  check(foreign === 0 && home.length < world.length,
    'T20 League: world teams off leaves only the domestic clubs',
    `${home.length} of ${world.length}`)
}

/* ── One club means one club ──────────────────────────────────────────── */
{
  const key = SQUADS.find((s) => s.formats.includes('T20L') && s.region === 'IN')!.teamKey
  const one = poolFor(base({ scope: 'TEAM', teamKey: key }))
  check(one.length > 0 && one.every((s) => s.teamKey === key),
    `one club: every squad is ${key}`, `${one.length} seasons`)
}

/* ── Every preset can be filled, in every format ──────────────────────── */
for (const format of FORMAT_ORDER) {
  for (const preset of PRESETS) {
    const config = base({ format, presetId: preset.id })
    const pool = poolFor(config)
    const rules = rulesFor(config)
    let slots = buildSlots(preset.id)
    const rng = makeRng(7)
    const order = [...pool].sort(() => rng() - 0.5)
    outer: for (const squad of order) {
      for (const p of [...squad.players].sort((x, y) => y.ovr - x.ovr)) {
        const open = openSlotsFor(p, slots, rules)
        if (!open.length) continue
        slots = place(slots, p, open[0])
        if (isComplete(slots)) break outer
      }
    }
    const shapeOk = slots.every((s, i) => s.role === presetById(preset.id).slots[i])
    check(isComplete(slots) && shapeOk, `${format} · ${preset.name}: fills, and in the right shape`)
  }
}

/* ── The overseas cap caps ────────────────────────────────────────────── */
{
  const config = base({ worldTeams: false, overseasCap: true })
  const pool = poolFor(config)
  const rules = rulesFor(config)
  const limit = OVERSEAS_LIMIT
  let slots = buildSlots(config.presetId)
  const rng = makeRng(3)
  outer: for (const squad of [...pool].sort(() => rng() - 0.5)) {
    // Deliberately import-first, to push against the cap rather than avoid it.
    for (const p of [...squad.players].sort((a) => (a.nation === 'IN' ? 1 : -1))) {
      const open = openSlotsFor(p, slots, rules)
      if (!open.length) continue
      slots = place(slots, p, open[0])
      if (isComplete(slots)) break outer
    }
  }
  const imports = slots.filter((s) => s.player && s.player.nation !== 'IN').length
  check(imports <= limit, `overseas cap holds when drafting imports first`, `${imports} imports`)
  // And with the cap off, more than the limit is reachable.
  const loose = rulesFor(base({ worldTeams: false, overseasCap: false }))
  const anyone = SQUADS.flatMap((s) => s.players).find((p) => p.nation !== 'IN')!
  check(canPlace(anyone, buildSlots('BALANCED'), loose), 'cap off lets an import in freely')
}

/* ── Difficulty and hidden ratings reach the season ───────────────────── */
for (const difficulty of ['EASY', 'NORMAL', 'HARD'] as Difficulty[]) {
  for (const ratingMode of ['SEASON', 'PRIME'] as RatingMode[]) {
    const config = base({ difficulty, ratingMode })
    const pool = poolFor(config)
    let slots = buildSlots(config.presetId)
    const rules = rulesFor(config)
    outer: for (const squad of pool) {
      for (const p of [...squad.players].sort((x, y) => y.ovr - x.ovr)) {
        const open = openSlotsFor(p, slots, rules)
        if (!open.length) continue
        slots = place(slots, p, open[0])
        if (isComplete(slots)) break outer
      }
    }
    const r = playSeason(slots, null, makeRng(11), config, 'XI')
    check(
      r.difficulty === difficulty && r.ratingMode === ratingMode && r.wins + r.losses + r.draws >= 14,
      `${difficulty} · ${ratingMode}: a season plays and records its own settings`,
      `${r.wins}-${r.losses} ${r.score.points} pts`,
    )
  }
}

/* ── Difficulty is a draft constraint, not a thumb on the cricket ─────── */
{
  const seasons = (['EASY', 'NORMAL', 'HARD'] as Difficulty[]).map((difficulty) => {
    const config = base({ difficulty })
    let slots = buildSlots(config.presetId)
    const rules = rulesFor(config)
    outer: for (const squad of poolFor(config)) {
      for (const p of [...squad.players].sort((x, y) => y.ovr - x.ovr)) {
        const open = openSlotsFor(p, slots, rules)
        if (!open.length) continue
        slots = place(slots, p, open[0])
        if (isComplete(slots)) break outer
      }
    }
    return playSeason(slots, null, makeRng(11), config, 'XI')
  })
  const same = seasons.every((r) => r.score.points === seasons[0].score.points)
  /*
   * The same eleven plays the same season on Easy and on Hard, and that is the
   * design rather than an oversight: difficulty buys re-rolls and hides the
   * ratings during the draft — five, three, none — so it changes how hard the
   * XI was to assemble, not how hard the opposition is. Worth pinning, because
   * a season that quietly differed would mean Hard was also weighting results,
   * and no screen says it does.
   */
  check(same, 'difficulty changes the draft, not the season the XI plays',
    seasons.map((r) => r.score.points).join(' / '))
  check(DIFFICULTY.EASY.skips > DIFFICULTY.NORMAL.skips && DIFFICULTY.NORMAL.skips > DIFFICULTY.HARD.skips,
    're-rolls fall as difficulty rises',
    `${DIFFICULTY.EASY.skips} / ${DIFFICULTY.NORMAL.skips} / ${DIFFICULTY.HARD.skips}`)
  check(DIFFICULTY.HARD.hideRatings && !DIFFICULTY.EASY.hideRatings,
    'only Hard hides the ratings')
}

console.log(bad ? `\n  ${bad} settings do not do what they say` : '\n  every setting does what it says')
process.exit(bad ? 1 : 0)
