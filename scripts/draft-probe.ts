/**
 * Complete drafts, played out pick by pick, checked against what was chosen.
 *
 * combos:check asks whether each setting means anything. This asks the next
 * question: once the draft is actually running, does the squad that gets built
 * still agree with the settings that opened it? Those come apart in ways a
 * static check cannot see — a draw that offers a squad with nobody placeable,
 * a cap that holds for the first four imports and then strands the eleventh
 * slot, a year range that governs the pool but not the fallback draw.
 *
 * So every combination is drafted to a full eleven, three times over: once by
 * a player taking the best card offered, once by a player taking the worst,
 * and once by a player taking imports first. The awkward two matter more than
 * the sensible one, because that is where a draft dead-ends.
 *
 *   npm run draft:check
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { hydrate, rolesOf, seasonYear, yearsForFormat } from '../src/data/squads'
import { hydrateChallenges, todaysChallenge } from '../src/data/challenges'
import {
  botPick, drawOrder, seatSlots, snakeSeat, squadForPick, totalPicks,
} from '../src/game/live'
import { playSeason } from '../src/game/sim'
import {
  buildSlots, canFillPreset, canSwap, drawFromSequence, drawSquad, filledCount, isComplete,
  makeRng, moveSlot,
  feasibility, openSlotsFor, place, poolFor, presetById, rulesFor, squadHasPlaceable, xiOf,
} from '../src/game/draft'
import { DIFFICULTY, FORMAT_ORDER, PRESETS, XI_SIZE } from '../src/game/types'
import { HOME_NATION, OVERSEAS_LIMIT } from '../src/data/nations'
import type { DraftConfig, PlayerSeason, RatingMode, Slot, Squad } from '../src/game/types'

const db = new PGlite()
await db.exec(await readFile('supabase/schema.sql', 'utf8'))
await db.exec(await readFile('supabase/archive.sql', 'utf8'))
await db.exec(await readFile('supabase/challenges.sql', 'utf8'))
hydrate((await db.query('select * from roster_feed')).rows as never[])
hydrateChallenges((await db.query('select * from challenges where active')).rows as never[])

let bad = 0
const fails: string[] = []
const check = (ok: boolean, what: string, detail = '') => {
  if (!ok) { bad++; fails.push(`${what}${detail ? ` — ${detail}` : ''}`) }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`)
  return ok
}

const base = (over: Partial<DraftConfig> = {}): DraftConfig => ({
  format: 'T20L', scope: 'ALL', teamKey: null, years: null, presetId: 'BALANCED',
  ratingMode: 'SEASON', hideRatings: false, difficulty: 'NORMAL', liveToss: false,
  worldTeams: true, overseasCap: false, teamName: 'XI', ...over,
})

/**
 * The way out of a stuck board: move somebody to a slot they also cover, and
 * see whether that reopens the draw. Mirrors the reordering the draft screen
 * already offers, so it only counts a rearrangement the player could make.
 */
function unstick(slots: Slot[], pool: Squad[], rules: ReturnType<typeof rulesFor>) {
  for (let from = 0; from < slots.length; from++) {
    if (!slots[from].player) continue
    for (let to = 0; to < slots.length; to++) {
      if (from === to || !canSwap(slots, from, to)) continue
      const moved = moveSlot(slots, from, to)
      if (pool.some((s) => squadHasPlaceable(s, moved, rules, feasibility(pool, moved)))) return moved
    }
  }
  return null
}

type Taste = 'BEST' | 'WORST' | 'IMPORTS'

/** How the drafter picks out of an offered squad. */
const choose = (
  squad: Squad,
  slots: Slot[],
  rules: ReturnType<typeof rulesFor>,
  taste: Taste,
  feas?: ReturnType<typeof feasibility>,
) => {
  const options = squad.players
    .map((p) => ({ p, open: openSlotsFor(p, slots, rules, feas) }))
    .filter((o) => o.open.length > 0)
  if (!options.length) return null
  if (taste === 'BEST') options.sort((a, b) => b.p.ovr - a.p.ovr)
  if (taste === 'WORST') options.sort((a, b) => a.p.ovr - b.p.ovr)
  // Imports first is the cap's worst case: spend the four, then try to finish.
  if (taste === 'IMPORTS') {
    options.sort((a, b) => {
      const ai = a.p.nation !== HOME_NATION ? 0 : 1
      const bi = b.p.nation !== HOME_NATION ? 0 : 1
      return ai - bi || b.p.ovr - a.p.ovr
    })
  }
  return options[0]
}

/**
 * Runs one draft to completion, reporting everything that went wrong on the
 * way rather than the first thing. A draft that dead-ends and a draft that
 * builds an illegal side are different bugs and both are worth naming.
 */
function playDraft(config: DraftConfig, seed: number, taste: Taste) {
  const pool = poolFor(config)
  const rules = rulesFor(config)
  const inPool = new Set(pool.map((s) => s.id))
  const cardOf = new Map<string, PlayerSeason>()
  for (const s of pool) for (const p of s.players) cardOf.set(`${s.id}:${p.id}`, p)

  const rng = makeRng(seed)
  let slots = buildSlots(config.presetId)
  const maxSkips = DIFFICULTY[config.difficulty].skips
  let skipsUsed = 0
  let freeRerolls = 0
  let reorders = 0
  let recent: string[] = []
  const problems: string[] = []
  let draws = 0
  const cap = 1200

  while (!isComplete(slots) && draws < cap) {
    draws++
    // Read once per pick and passed everywhere, the way the board does it.
    const feas = feasibility(pool, slots)
    const squad = drawSquad(pool, slots, rng, recent, rules, feas)

    if (!inPool.has(squad.id)) problems.push(`drew ${squad.id}, which is outside the chosen pool`)
    /*
     * A dead draw is not a dead end. The board spots one the same way, and
     * hands back a re-roll that costs nothing and stays enabled even on Hard,
     * where there are no re-rolls to spend. So take the free one and carry on
     * — the real dead end is a pool where every squad is dead at once, and
     * that is what the draw counter below catches.
     */
    if (!squadHasPlaceable(squad, slots, rules, feas)) {
      freeRerolls++
      recent = [squad.id, ...recent].slice(0, 8)
      if (!pool.some((s) => squadHasPlaceable(s, slots, rules, feas))) {
        /*
         * Every squad dead at once, which is the corner a player paints
         * themselves into by spending a dual-role card on the wrong slot —
         * the lone all-rounder batted at four. The board lets them reorder
         * out of it, so try that before calling it a dead end, and only
         * report one when no rearrangement reopens the draft.
         */
        const freed = unstick(slots, pool, rules)
        if (!freed) {
          problems.push(`nothing in the pool can fill ${filledCount(slots)}/11, and no reorder helps`)
          break
        }
        slots = freed
        reorders++
      }
      continue
    }

    const wanted = choose(squad, slots, rules, taste, feas)
    if (!wanted) { problems.push(`no pick from ${squad.id}`); break }

    // A skip is only available while the difficulty still allows one.
    if (skipsUsed < maxSkips && draws % 7 === 0) {
      skipsUsed++
      recent = [squad.id, ...recent].slice(0, 8)
      continue
    }

    const slotIdx = wanted.open[0]
    const role = slots[slotIdx].role
    if (!rolesOf(wanted.p).includes(role)) {
      problems.push(`${wanted.p.name} placed at ${role} but plays ${rolesOf(wanted.p).join('/')}`)
    }
    if (cardOf.get(`${squad.id}:${wanted.p.id}`)?.ovr !== wanted.p.ovr) {
      problems.push(`${wanted.p.name} has a card the pool does not`)
    }
    slots = place(slots, wanted.p, slotIdx)
    recent = [squad.id, ...recent].slice(0, 8)

    if (rules.overseasCap) {
      const imports = xiOf(slots).filter((p) => p.nation !== HOME_NATION).length
      if (imports > OVERSEAS_LIMIT) problems.push(`${imports} imports, cap is ${OVERSEAS_LIMIT}`)
    }
  }

  const xi = xiOf(slots)
  if (!isComplete(slots)) problems.push(`stalled at ${xi.length}/11 after ${draws} draws`)
  if (skipsUsed > maxSkips) problems.push(`used ${skipsUsed} re-rolls of ${maxSkips}`)

  const names = new Set(xi.map((p) => p.name))
  if (names.size !== xi.length) problems.push('the same player twice')

  // The shape on the screen is the preset that was chosen, not a near miss.
  const want = [...presetById(config.presetId).slots].sort()
  const got = slots.map((s) => s.role).sort()
  if (want.join() !== got.join()) problems.push(`shape ${got.join('/')} is not the preset`)

  // Every card in the finished side still traces back to the settings.
  for (const p of xi) {
    const from = pool.filter((s) => s.players.some((q) => q.id === p.id && q.ovr === p.ovr))
    if (!from.length) { problems.push(`${p.name} came from no squad in the pool`); continue }
    if (config.format && !from.some((s) => s.formats.includes(config.format))) {
      problems.push(`${p.name} plays no ${config.format} squad`)
    }
    if (config.years && !from.some((s) => {
      const y = seasonYear(s.season)
      return y >= config.years![0] && y <= config.years![1]
    })) problems.push(`${p.name} is outside ${config.years.join('–')}`)
    if (config.scope === 'TEAM' && !from.some((s) => s.teamKey === config.teamKey)) {
      problems.push(`${p.name} is not a ${config.teamKey} player`)
    }
    if (config.format === 'T20L' && !config.worldTeams && !from.some((s) => s.region === 'IN')) {
      problems.push(`${p.name} is not from a domestic club`)
    }
  }
  return { problems, draws, xi, freeRerolls, reorders }
}

/* ── Every format × preset × rating mode, drafted three ways ──────────── */
{
  let runs = 0
  const broke: string[] = []
  for (const format of FORMAT_ORDER) {
    for (const preset of PRESETS) {
      for (const ratingMode of ['SEASON', 'PRIME'] as RatingMode[]) {
        for (const taste of ['BEST', 'WORST', 'IMPORTS'] as Taste[]) {
          const config = base({ format, presetId: preset.id, ratingMode })
          const r = playDraft(config, 3 + runs * 13, taste)
          runs++
          for (const p of r.problems) broke.push(`${format}/${preset.id}/${ratingMode}/${taste}: ${p}`)
        }
      }
    }
  }
  check(broke.length === 0, `${runs} drafts across every format, preset and rating mode`,
    broke.length ? broke.slice(0, 6).join(' · ') : 'all reached a legal eleven')
}

/* ── The overseas cap, drafted imports-first until it bites ───────────── */
{
  const broke: string[] = []
  let capped = 0
  for (const preset of PRESETS) {
    for (const ratingMode of ['SEASON', 'PRIME'] as RatingMode[]) {
      for (let seed = 0; seed < 12; seed++) {
        const config = base({
          format: 'T20L', worldTeams: false, overseasCap: true,
          presetId: preset.id, ratingMode,
        })
        const r = playDraft(config, 900 + seed, 'IMPORTS')
        for (const p of r.problems) broke.push(`${preset.id}/${ratingMode}/#${seed}: ${p}`)
        if (r.xi.filter((p) => p.nation !== HOME_NATION).length === OVERSEAS_LIMIT) capped++
      }
    }
  }
  check(broke.length === 0, `the cap holds and still fills an eleven — ${capped} sides hit it exactly`,
    broke.length ? broke.slice(0, 6).join(' · ') : '')
}

/* ── Narrow settings: one club, gated the way the game gates it ───────── */
{
  /*
   * The setup screen greys out a club that cannot fill the chosen preset, and
   * it decides that with canFillPreset. So that is the gate to probe against,
   * and it has to hold in both directions: a club the screen offers must draft
   * to eleven, and a club it refuses must genuinely be unable to. Probing
   * clubs the screen never offers proves nothing — Supergiant has one
   * all-rounder against BALANCED's two, and is correctly refused.
   */
  const broke: string[] = []
  let allowed = 0
  let refused = 0
  for (const format of FORMAT_ORDER) {
    for (const preset of PRESETS) {
      const teams = [...new Set(poolFor(base({ format })).map((s) => s.teamKey))]
      for (const teamKey of teams) {
        const config = base({ format, scope: 'TEAM', teamKey, presetId: preset.id })
        const pool = poolFor(config)
        if (!canFillPreset(pool, preset.id)) { refused++; continue }
        allowed++
        for (const taste of ['BEST', 'WORST'] as Taste[]) {
          const r = playDraft(config, 51 + allowed * 7, taste)
          for (const p of r.problems) broke.push(`${format}/${teamKey}/${preset.id}/${taste}: ${p}`)
        }
      }
    }
  }
  check(broke.length === 0, `${allowed} single-club combinations the game offers, all drafted`,
    broke.length ? broke.slice(0, 8).join(' · ') : `${refused} greyed out`)
}

/* ── A refused club is refused for a reason ───────────────────────────── */
{
  /*
   * The other direction: nothing should be greyed out that could actually have
   * filled the side. Counting bodies per role will not settle this — a player
   * who bats and bowls spin is counted under both but can only occupy one
   * slot, so a naive count says yes to sides that cannot be picked.
   *
   * Hall's condition settles it exactly. For every subset of the roles the
   * preset asks for, the players covering any role in that subset must number
   * at least the slots the subset needs. A refusal is justified precisely when
   * some subset falls short. Five roles is thirty-one subsets, so this is
   * cheap and leaves no room for argument.
   */
  const wrong: string[] = []
  const ROLES = ['BAT', 'WK', 'AR', 'PACE', 'SPIN'] as const
  for (const format of FORMAT_ORDER) {
    for (const preset of PRESETS) {
      const need: Record<string, number> = {}
      for (const role of presetById(preset.id).slots) need[role] = (need[role] ?? 0) + 1
      const teams = [...new Set(poolFor(base({ format })).map((s) => s.teamKey))]
      for (const teamKey of teams) {
        const config = base({ format, scope: 'TEAM', teamKey, presetId: preset.id })
        const pool = poolFor(config)
        if (canFillPreset(pool, preset.id)) continue

        const byName = new Map<string, string[]>()
        for (const s of pool) for (const p of s.players) byName.set(p.name, rolesOf(p))
        let justified = byName.size < XI_SIZE
        for (let mask = 1; mask < (1 << ROLES.length) && !justified; mask++) {
          const subset = ROLES.filter((_, i) => mask & (1 << i))
          const wants = subset.reduce((n, r) => n + (need[r] ?? 0), 0)
          if (!wants) continue
          let covering = 0
          for (const roles of byName.values()) if (roles.some((r) => subset.includes(r as never))) covering++
          if (covering < wants) justified = true
        }
        if (!justified) wrong.push(`${format}/${teamKey}/${preset.id} refused with no shortage to show for it`)
      }
    }
  }
  check(wrong.length === 0, 'every greyed-out club is genuinely short of somebody',
    wrong.slice(0, 5).join(' · '))
}

/* ── Every filter, crossed with every other filter ────────────────────── */
{
  /*
   * The settings do not live apart from one another. Overseas cap only means
   * anything in a domestic T20 League; a year range can thin a single club to
   * two seasons; prime ratings change which card is a player's best and so
   * change who fills a slot. Each of those is fine alone and the trouble is in
   * the crossings, so this walks them all rather than a sample of them.
   */
  const broke: string[] = []
  let runs = 0
  for (const format of FORMAT_ORDER) {
    const [lo, hi] = yearsForFormat(format)
    const spans: ([number, number] | null)[] = [
      null, [lo, hi], [hi - 3, hi], [lo, lo + 3], [hi, hi],
    ]
    for (const preset of PRESETS) {
      for (const ratingMode of ['SEASON', 'PRIME'] as RatingMode[]) {
        for (const worldTeams of [true, false]) {
          for (const overseasCap of [true, false]) {
            for (const years of spans) {
              const config = base({ format, presetId: preset.id, ratingMode, worldTeams, overseasCap, years })
              // Same gate the setup screen uses; a refused span is refused on screen too.
              if (!canFillPreset(poolFor(config), preset.id)) continue
              for (const taste of ['BEST', 'WORST', 'IMPORTS'] as Taste[]) {
                runs++
                const r = playDraft(config, 17 + runs * 5, taste)
                for (const p of r.problems) {
                  broke.push(`${format}/${preset.id}/${ratingMode}/world:${worldTeams}/cap:${overseasCap}/${years ? years.join('-') : 'all years'}/${taste}: ${p}`)
                }
              }
            }
          }
        }
      }
    }
  }
  check(broke.length === 0, `${runs} drafts across every crossing of format, preset, ratings, world teams, cap and years`,
    broke.length ? `${broke.length} broke · ${broke.slice(0, 4).join(' · ')}` : 'all reached a legal eleven')
}

/* ── The daily walks one fixed sequence for everybody ─────────────────── */
{
  const config = base({ format: 'T20L' })
  const pool = poolFor(config)
  const rules = rulesFor(config)
  const sequence = [...pool].map((s) => s.id).sort()
  const runs = [0, 1].map(() => {
    let slots = buildSlots(config.presetId)
    let cursor = 0
    const seen: string[] = []
    let guard = 0
    while (!isComplete(slots) && guard++ < 200) {
      const draw = drawFromSequence(sequence, cursor, slots, pool, rules, feasibility(pool, slots))
      cursor = draw.cursor
      seen.push(draw.squad.id)
      const wanted = choose(draw.squad, slots, rules, 'BEST', feasibility(pool, slots))
      if (!wanted) break
      slots = place(slots, wanted.p, wanted.open[0])
    }
    return { seen, xi: xiOf(slots).map((p) => p.name) }
  })
  check(runs[0].seen.join() === runs[1].seen.join() && runs[0].xi.length === XI_SIZE,
    'the daily offers the same squads in the same order, twice running',
    `${runs[0].seen.length} draws to an eleven`)
}

/* ── A dead draw costs nothing, on every difficulty ───────────────────── */
{
  /*
   * The one thing that must never happen: a player on Hard, with no re-rolls,
   * looking at a squad they cannot pick from and a re-roll button that will
   * not let them out. The board keeps that button enabled for a dead draw
   * regardless of skips, and the free re-roll leaves skipsUsed alone.
   */
  const broke: string[] = []
  let dead = 0
  for (const format of FORMAT_ORDER) {
    for (const preset of PRESETS) {
      for (const seedN of [5, 61, 404]) {
        const config = base({ format, presetId: preset.id, difficulty: 'HARD' })
        const r = playDraft(config, seedN, 'WORST')
        dead += r.freeRerolls
        for (const p of r.problems) broke.push(`${format}/${preset.id}: ${p}`)
      }
    }
  }
  check(broke.length === 0, `dead draws re-roll free on Hard — ${dead} of them survived`,
    broke.slice(0, 5).join(' · '))
}

/* ── A re-roll costs one, and Hard has none to spend ──────────────────── */
{
  const config = base({ difficulty: 'HARD' })
  const r = playDraft(config, 77, 'BEST')
  check(!r.problems.some((p) => p.includes('re-roll')), 'Hard draws no re-rolls',
    `${DIFFICULTY.HARD.skips} allowed`)
}

/* ── The daily: a different puzzle every day, and a winnable one ──────── */
{
  /*
   * A daily has two ways to be broken that a screen will not show you. It can
   * repeat — same sequence two days running, and yesterday's answer still
   * works. Or it can be unwinnable: the objective on the card is a string the
   * simulation has never heard of, objectiveMet falls through to its default,
   * and no season anybody plays will ever satisfy it.
   */
  const days = 400
  const start = new Date(2026, 0, 1)
  const seen = new Map<string, number>()
  const challenges = Array.from({ length: days }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return todaysChallenge(d)
  })

  for (const c of challenges) seen.set(c.sequence.join('|'), (seen.get(c.sequence.join('|')) ?? 0) + 1)
  const consecutive = challenges.filter((c, i) => i > 0 && c.sequence.join('|') === challenges[i - 1].sequence.join('|')).length
  check(consecutive === 0, `${days} days running, never the same draw two days together`,
    `${seen.size} distinct sequences`)

  const numbers = challenges.map((c) => c.number)
  const steady = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1)
  check(steady, 'the challenge number advances by one a day', `#${numbers[0]} to #${numbers.at(-1)}`)

  // Same day, asked twice: everybody has to be playing the same puzzle.
  const twice = challenges.every((c) => {
    const again = todaysChallenge(new Date(c.dateKey + 'T12:00:00'))
    return again.sequence.join('|') === c.sequence.join('|') && again.presetId === c.presetId
  })
  check(twice, 'the same date always gives the same puzzle')

  /*
   * An objective the simulation cannot read is a daily nobody can win, and it
   * says nothing about it: objectiveMet answers false for a title it does not
   * know, by design, so a typo in the rotation or a puzzle added without the
   * matching case just quietly never pays out. Checked against the cases the
   * function actually handles, because no season can tell the difference
   * between "not achieved" and "not understood".
   */
  const sim = await readFile('src/game/sim.ts', 'utf8')
  const body = sim.slice(sim.indexOf('function objectiveMet('))
  const known = new Set(
    [...body.slice(0, body.indexOf('\n}')).matchAll(/case '([^']+)'/g)].map((m) => m[1]),
  )
  const objectives = [...new Set(challenges.map((c) => c.objective.title))]
  const unknown = objectives.filter((t) => !known.has(t))
  check(unknown.length === 0, `all ${objectives.length} daily objectives are ones the simulation reads`,
    unknown.length ? `never winnable: ${unknown.join(' · ')}` : `${known.size} handled`)

  // And the fixed sequence still fills an eleven, for every puzzle in the year.
  const stuck: string[] = []
  for (const c of [...new Map(challenges.map((x) => [`${x.format}/${x.presetId}`, x])).values()]) {
    const config = base({ format: c.format, presetId: c.presetId })
    const pool = poolFor(config)
    const rules = rulesFor(config)
    let slots = buildSlots(config.presetId)
    let cursor = 0
    let guard = 0
    while (!isComplete(slots) && guard++ < 300) {
      const feas = feasibility(pool, slots)
      const draw = drawFromSequence(c.sequence, cursor, slots, pool, rules, feas)
      cursor = draw.cursor
      const wanted = choose(draw.squad, slots, rules, 'BEST', feas)
      if (!wanted) break
      slots = place(slots, wanted.p, wanted.open[0])
    }
    if (!isComplete(slots)) stuck.push(`${c.format}/${c.presetId} stalled at ${filledCount(slots)}/11`)
  }
  check(stuck.length === 0, 'every daily puzzle in the rotation drafts to eleven', stuck.join(' · '))
}

/* ── The live draft: four XIs out of one pool ─────────────────────────── */
{
  /*
   * The live room is a different draft to the solo one and breaks differently.
   * Seats share a pool, so a squad can hold exactly the roles a seat needs and
   * none of the players — the others ate them — and the older code counted
   * those as pickable. The bot then had nothing legal to return, and a draft
   * with a dead clock and no possible pick is a room nobody can leave except
   * by abandoning it.
   *
   * So: whole rooms, every seat played by the bot, on the narrowest settings a
   * host can actually choose.
   */
  const broke: string[] = []
  let rooms = 0
  for (const format of FORMAT_ORDER) {
    for (const preset of PRESETS) {
      for (const seats of [2, 3, 4]) {
        for (const worldTeams of [true, false]) {
          const [lo, hi] = yearsForFormat(format)
          const config = base({
            format, presetId: preset.id, scope: 'ALL', worldTeams,
            overseasCap: !worldTeams, years: [hi - 4, hi],
          })
          if (!canFillPreset(poolFor(config), preset.id)) continue
          rooms++
          const order = drawOrder(config, 1000 + rooms)
          const picks: { pick_no: number; seat: number; player_id: string; slot: number; squad_id: string }[] = []
          const taken = new Set<string>()
          const label = `${format}/${preset.id}/${seats} seats/world:${worldTeams}`

          for (let pickNo = 0; pickNo < totalPicks(seats); pickNo++) {
            const xis = seatSlots(config, order, picks, seats)
            const onTurn = snakeSeat(pickNo, seats)
            const slots = xis[onTurn]
            const feas = feasibility(order, slots, taken)
            const squad = squadForPick(order, pickNo, slots, config, feas)
            if (!squad) { broke.push(`${label}: no squad to offer at pick ${pickNo}`); break }
            const choice = botPick(squad, slots, taken, config, feas)
            if (!choice) { broke.push(`${label}: nothing pickable at pick ${pickNo}`); break }
            taken.add(choice.player.playerId)
            picks.push({
              pick_no: pickNo, seat: onTurn, squad_id: squad.id,
              player_id: choice.player.playerId, slot: choice.slot,
            })
          }

          const xis = seatSlots(config, order, picks, seats)
          xis.forEach((slots, seat) => {
            if (!isComplete(slots)) broke.push(`${label}: seat ${seat} finished ${filledCount(slots)}/11`)
          })
          // One pool, so nobody may appear in two sides at once.
          const all = xis.flatMap((slots) => xiOf(slots).map((p) => p.playerId))
          if (new Set(all).size !== all.length) broke.push(`${label}: a player in two XIs`)
        }
      }
    }
  }
  check(broke.length === 0, `${rooms} live rooms drafted out, every seat to eleven`,
    broke.length ? `${broke.length} broke · ${broke.slice(0, 4).join(' · ')}` : 'no seat left short, no player in two sides')
}

console.log(bad ? `\n  ${bad} of the draft's promises do not hold` : '\n  the draft builds what was chosen')
for (const f of fails) console.log(`  ${f}`)
