import { seasonYear, SQUADS, latestSeason, squadRated } from '../data/squads'
import { clamp } from './draft'
import type { Format, Opponent, PlayerSeason, RatingMode, Role, Squad } from './types'

/**
 * Every opponent in the game is a real side from the dataset — the same
 * squad-seasons the player drafts from. Nothing is invented: the team you face
 * in match seven has a name, a season, a rating built from its own players and
 * a danger man who actually played for it.
 */

const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0)
const topN = (ns: number[], n: number) => [...ns].sort((a, b) => b - a).slice(0, n)

/**
 * Rating a squad has to give the same answer whether the archive lists six
 * names for that season or a full eleven, or sides with better data would
 * quietly become stronger opponents. So only the top few in each discipline
 * count — every squad has at least that many — and the results are scaled onto
 * the XI rating scale the player's own team is measured on.
 */
/**
 * An opponent is rated on the eleven it would actually pick, by exactly the
 * formula that rates yours.
 *
 * The two sides used to be measured differently — your XI on its top seven
 * batters and top five bowlers, theirs on a top four and top three then
 * discounted a few per cent. Different yardsticks cannot be compared, and
 * these two disagreed badly: a good draft came out at 94 against a field
 * sitting at 82, which is a twelve-point edge and a season of formalities.
 *
 * Squads here run from eleven names to thirty-seven, so the best eleven is
 * taken first. Otherwise a side listed with its whole season's churn would
 * rate lower than the same side listed with a settled team, which says
 * something about record-keeping rather than about cricket.
 */
const XI_SIZE = 11
const TOP_BAT = 7
const TOP_BOWL = 5

const BATTERS: Role[] = ['BAT', 'WK', 'AR']
const BOWLERS: Role[] = ['PACE', 'SPIN', 'AR']
const plays = (p: PlayerSeason, roles: Role[]) =>
  roles.includes(p.role) || p.alt.some((r) => roles.includes(r))

/**
 * A squad scaled onto the same rating scale as a full XI, so the odds against
 * an opponent read the same way as the player's own team sheet.
 */
export function opponentFrom(squad: Squad): Opponent {
  const ps = squad.players
  // The eleven they would put out, which is what your eleven has to beat.
  const xi = [...ps].sort((a, b) => b.ovr - a.ovr).slice(0, XI_SIZE)

  // Only players who actually do the job are counted, so a thin squad is not
  // flattered by counting its tail-enders among its batsmen.
  const bats = xi.filter((p) => plays(p, BATTERS)).map((p) => p.bat)
  const bowls = xi.filter((p) => plays(p, BOWLERS)).map((p) => p.bowl)
  const batting = clamp(
    Math.round(avg(topN(bats.length ? bats : xi.map((p) => p.bat), TOP_BAT))),
    40,
    99,
  )
  const bowling = clamp(
    Math.round(avg(topN(bowls.length ? bowls : xi.map((p) => p.bowl), TOP_BOWL))),
    40,
    99,
  )
  const balance = clamp(Math.round(100 - Math.abs(batting - bowling) * 1.6), 40, 99)
  const ovr = clamp(
    Math.round(avg(xi.map((p) => p.ovr)) * 0.72 + batting * 0.14 + bowling * 0.14),
    40,
    99,
  )

  const bowlersOf = (role: string) =>
    ps.filter((p) => p.role === role || p.alt.includes(role as never)).map((p) => p.bowl)
  const mean = (ns: number[], fallback: number) => (ns.length ? avg(topN(ns, 2)) : fallback)

  return {
    name: squad.team,
    short: squad.teamShort,
    season: squad.season,
    comp: squad.comp,
    teamKey: squad.teamKey,
    ratings: { ovr, batting, bowling, balance },
    attack: { pace: mean(bowlersOf('PACE'), 62), spin: mean(bowlersOf('SPIN'), 62) },
    players: ps,
  }
}

/** "MUMBAI 2019" — how a specific squad-season is named on screen. */
export const sideLabel = (o: Opponent) => `${o.short} ${o.season}`

/** The headline names on a team card — enough to recognise the side. */
export const starsOf = (o: Opponent, count = 6) =>
  [...o.players].sort((a, b) => b.ovr - a.ovr).slice(0, count).map((p) => p.surname)

/** Their best batter and best bowler — who the match report is written about. */
export const dangerMan = (o: Opponent) =>
  [...o.players].sort((a, b) => b.bat - a.bat)[0] ?? o.players[0]
export const spearhead = (o: Opponent) =>
  [...o.players].sort((a, b) => b.bowl - a.bowl)[0] ?? o.players[0]

/* ── Pools ───────────────────────────────────────────────────────────────── */

interface PoolOptions {
  /** Prefer sides from recent seasons — the league as it is now. */
  latest?: boolean
  /** Rank by strength before drawing, for invitational fields. */
  best?: boolean
  /**
   * How deep to reach when `best` is set — the size of the shortlist the field
   * is drawn from. A shortlist barely larger than the field itself produces a
   * bracket where every side is the same calibre, which no invitational has
   * ever been: reach further and the draw has favourites and outsiders, which
   * is what makes a bracket worth reading.
   */
  bestOf?: number
  /** Never draw these teams (the player's own side, say). */
  exclude?: string[]
  /**
   * The Indian T20 League plays its own teams; the Champions Trophy invites
   * the world. Leave unset for a domestic fixture list.
   */
  world?: boolean
  /**
   * Opponents are rated the same way your XI is. Draft prime players and you
   * face prime sides, so the contest stays even instead of turning into a
   * procession the moment you switch modes.
   */
  ratingMode?: RatingMode
}

const shuffle = <T,>(list: T[], rand: () => number) => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** How recent a season has to be to count as "the current game". */
const RECENT_WINDOW = 6

/**
 * One side per team, drawn at random from that team's seasons. Real names, real
 * squads — and with `latest` set, the version of each side from recent years,
 * so a T20 League season is played against the league as it stands today.
 */
export function opponentPool(
  format: Format,
  rand: () => number,
  count: number,
  opts: PoolOptions = {},
): Opponent[] {
  const eligible = SQUADS.filter(
    (s) =>
      s.formats.includes(format) &&
      !opts.exclude?.includes(s.teamKey) &&
      // Only the T20 League is a domestic competition. Its fixture list is
      // Indian sides; the Champions Trophy opens that up to the world, and a
      // World Cup was never drawing from franchises in the first place.
      (opts.world || format !== 'T20L' || s.region === 'IN'),
  )

  const byTeam = new Map<string, Squad[]>()
  for (const s of eligible) {
    const list = byTeam.get(s.teamKey) ?? []
    list.push(s)
    byTeam.set(s.teamKey, list)
  }

  const sides: Opponent[] = []
  for (const [, seasons] of byTeam) {
    // Prefer this side's recent seasons, but fall back so no team is ever lost.
    const recent = seasons.filter((s) => seasonYear(s.season) >= latestSeason() - RECENT_WINDOW)
    const from = opts.latest && recent.length ? recent : seasons
    /**
     * Four seasons are drawn and the strongest of them plays.
     *
     * You are picking each man in his best year, out of everything the archive
     * holds; a side taken from one season chosen at random is not the same
     * calibre of thing, and a field assembled that way was losing before the
     * toss. Best of four closes most of that gap without pinning each club to
     * its single greatest team, so the fixture list still changes run to run.
     */
    const drawn = Array.from({ length: Math.min(4, from.length) }, () => from[Math.floor(rand() * from.length)])
      .map((sq) => opponentFrom(squadRated(sq, opts.ratingMode ?? 'SEASON')))
      .sort((a, b) => b.ratings.ovr - a.ratings.ovr)[0]
    sides.push(drawn)
  }

  const ordered = opts.best
    ? [...sides]
        .sort((a, b) => b.ratings.ovr - a.ratings.ovr)
        .slice(0, Math.max(opts.bestOf ?? count + 3, count))
    : sides

  return shuffle(ordered, rand).slice(0, count)
}

/**
 * The fixture list: every rival once, then the strongest sides again until the
 * schedule is full — which is how a real league of ten teams fills fourteen
 * games without inventing anybody.
 */
export function fixtureList(pool: Opponent[], matches: number, rand: () => number): Opponent[] {
  const out: Opponent[] = []
  while (out.length < matches) {
    for (const o of shuffle(pool, rand)) {
      if (out.length >= matches) break
      out.push(o)
    }
  }
  return out
}
