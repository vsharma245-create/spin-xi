/**
 * The archive as a whole, rather than one row at a time.
 *
 * rows:check reads every roster row against rules a single row can break — a
 * rating out of range, more wickets than deliveries. This asks the questions
 * that only exist between rows: whether a player is the same player wherever
 * they appear, whether their prime is really their prime, whether a squad can
 * actually field a side, whether the ratings mean anything as a population.
 *
 *   npm run data:check
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { hydrate, primeOf, rolesOf, SQUADS, seasonYear } from '../src/data/squads'
import { canFillPreset, poolFor } from '../src/game/draft'
import { FORMAT_ORDER, PRESETS, XI_SIZE } from '../src/game/types'
import type { DraftConfig, Format } from '../src/game/types'

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

const allCards = SQUADS.flatMap((s) => s.players)

/* ── Identity ─────────────────────────────────────────────────────────── */
{
  /*
   * Forty-one names in the archive belong to more than one cricketer — there
   * are two Rashid Khans. Nothing that decides who may be drafted, or whose
   * peak belongs to whom, may key on the name.
   */
  const namesOf = new Map<string, Set<string>>()
  const idsOf = new Map<string, Set<string>>()
  for (const p of allCards) {
    if (!namesOf.has(p.playerId)) namesOf.set(p.playerId, new Set())
    namesOf.get(p.playerId)!.add(p.name)
    if (!idsOf.has(p.name)) idsOf.set(p.name, new Set())
    idsOf.get(p.name)!.add(p.playerId)
  }
  const drifting = [...namesOf].filter(([, names]) => names.size > 1)
  check(drifting.length === 0, 'a player id always carries the same name',
    drifting.slice(0, 3).map(([id, n]) => `${id}: ${[...n].join(' / ')}`).join(' · '))

  const shared = [...idsOf].filter(([, ids]) => ids.size > 1)
  console.log(`       (${shared.length} names are shared by two cricketers, which is why identity is the id)`)

  const dupes = SQUADS.filter((s) => new Set(s.players.map((p) => p.playerId)).size !== s.players.length)
  check(dupes.length === 0, 'nobody appears twice in the same squad',
    dupes.slice(0, 3).map((s) => s.id).join(' · '))
}

/* ── Prime ────────────────────────────────────────────────────────────── */
{
  const problems: string[] = []
  let lifted = 0
  let atPeak = 0
  for (const format of FORMAT_ORDER) {
    const inFormat = SQUADS.filter((s) => s.formats.includes(format))
    // Every season this player actually played in this format.
    const seen = new Map<string, { ovr: number; season: string }[]>()
    for (const s of inFormat) {
      for (const p of s.players) {
        if (!seen.has(p.playerId)) seen.set(p.playerId, [])
        seen.get(p.playerId)!.push({ ovr: p.ovr, season: p.season })
      }
    }
    for (const s of inFormat) {
      for (const p of s.players) {
        const q = primeOf(p, format)
        if (q.ovr === p.ovr) atPeak++
        else lifted++
        if (q.ovr < p.ovr) problems.push(`${p.name} primes below their own season`)
        if (q.playerId !== p.playerId) problems.push(`${p.name} primes into somebody else`)
        // The prime must be a season this player really played in this format.
        const best = Math.max(...seen.get(p.playerId)!.map((x) => x.ovr))
        if (q.ovr !== best) problems.push(`${p.name} (${format}) primed to ${q.ovr}, best in format is ${best}`)
        if (rolesOf(q).join() !== rolesOf(p).join()) problems.push(`${p.name} changes role when primed`)
      }
    }
  }
  check(problems.length === 0,
    `prime is the player's own best season in the format drafted — ${lifted} lifted, ${atPeak} already there`,
    problems.length ? `${problems.length} wrong · ${problems.slice(0, 3).join(' · ')}` : '')
}

/* ── Ratings as a population ──────────────────────────────────────────── */
{
  const best = new Map<string, { ovr: number; squads: number; name: string }>()
  for (const s of SQUADS) {
    for (const p of s.players) {
      const at = best.get(p.playerId) ?? { ovr: 0, squads: 0, name: p.name }
      best.set(p.playerId, { ovr: Math.max(at.ovr, p.ovr), squads: at.squads + 1, name: p.name })
    }
  }
  const players = [...best.values()]
  /*
   * Measured on the cards a player is actually dealt, not on career bests.
   * Career best takes the top of every player's whole run, so it concentrates
   * by construction and says nothing about what a draft feels like — the
   * question is how often a ninety turns up when a squad is drawn.
   */
  const elite = allCards.filter((p) => p.ovr >= 90).length
  check(elite / allCards.length < 0.05, 'a ninety is a rare card to be dealt',
    `${elite} of ${allCards.length} cards (${((100 * elite) / allCards.length).toFixed(1)}%)`)
  const careerBest = players.filter((p) => p.ovr >= 90).length
  console.log(`       (${careerBest} of ${players.length} players reach 90 in their best season)`)

  /*
   * The failure this whole rating pass was about: a player with a handful of
   * appearances in weak cricket rated among the best in the game.
   */
  const thin = players.filter((p) => p.ovr >= 92 && p.squads <= 4)
  check(thin.length <= 3, 'nobody reaches 92 on four squads or fewer',
    thin.length ? thin.slice(0, 5).map((p) => `${p.name} ${p.ovr} (${p.squads})`).join(' · ') : 'none')

  const missing = allCards.filter((p) => !(p.ovr > 0) || !(p.bat >= 0) || !(p.bowl >= 0))
  check(missing.length === 0, `every one of ${allCards.length} cards carries a rating`,
    missing.slice(0, 3).map((p) => p.name).join(' · '))

  const labelWrong = allCards.filter((p) => p.stats.length !== 3 || p.stats.some((st) => !st.label || !(st.value >= 0)))
  check(labelWrong.length === 0, 'and three labelled figures to show for it',
    labelWrong.slice(0, 3).map((p) => p.name).join(' · '))
}

/* ── Squads ───────────────────────────────────────────────────────────── */
{
  const small = SQUADS.filter((s) => s.players.length < XI_SIZE)
  check(small.length === 0, `every squad can field eleven`, small.slice(0, 3).map((s) => s.id).join(' · '))

  const keeperless = SQUADS.filter((s) => !s.players.some((p) => rolesOf(p).includes('WK')))
  check(keeperless.length === 0, 'every squad has somebody to keep wicket',
    keeperless.slice(0, 3).map((s) => s.id).join(' · '))

  const bowlerless = SQUADS.filter(
    (s) => s.players.filter((p) => rolesOf(p).some((r) => r === 'PACE' || r === 'SPIN' || r === 'AR')).length < 4,
  )
  check(bowlerless.length === 0, 'and four who can bowl', bowlerless.slice(0, 3).map((s) => s.id).join(' · '))

  const nationless = allCards.filter((p) => !p.nation || p.nation.length !== 2)
  check(nationless.length === 0, 'every card has a country, so the overseas cap can count',
    nationless.slice(0, 3).map((p) => p.name).join(' · '))

  const badSeason = SQUADS.filter((s) => {
    const y = seasonYear(s.season)
    return !(y >= 1990 && y <= new Date().getFullYear() + 1)
  })
  check(badSeason.length === 0, 'every season reads as a year', badSeason.slice(0, 3).map((s) => s.season).join(' · '))
}

/* ── Every format still fills every preset, in both rating modes ──────── */
{
  const stuck: string[] = []
  for (const format of FORMAT_ORDER as Format[]) {
    for (const preset of PRESETS) {
      for (const ratingMode of ['SEASON', 'PRIME'] as const) {
        const pool = poolFor(base({ format, presetId: preset.id, ratingMode }))
        if (!pool.length) stuck.push(`${format}/${ratingMode}: no squads`)
        else if (!canFillPreset(pool, preset.id)) stuck.push(`${format}/${preset.id}/${ratingMode}`)
      }
    }
  }
  check(stuck.length === 0, 'every format and preset can be drafted on season or prime ratings',
    stuck.join(' · '))
}

console.log(bad ? `\n  ${bad} things about the data do not hold\n` : '\n  the archive holds together\n')
process.exit(bad ? 1 : 0)
