import type { Era, Format, PlayerSeason, RatingMode, Role, Squad, Stat } from '../game/types'

/**
 * The query layer over the archive.
 *
 * The rows arrive from the database (see `repository.ts`); everything the game
 * asks about a squad is answered here. Era, prime ratings and a player's
 * batting and bowling contribution are all *derived* rather than stored —
 * they are functions of the data, not facts about it, so keeping them in the
 * database would only give them room to drift.
 *
 * `SQUADS` is filled in place rather than reassigned, so every module that
 * imported it at start-up keeps a working reference once the archive lands.
 */

/** One row of `roster_feed`: a player, in a squad, in a season. */
export interface RosterRow {
  squad_id: string
  team_key: string
  team_name: string
  team_short: string
  season: string
  competition: string
  formats: Format[]
  region: 'IN' | 'WORLD' | 'INTL'
  player_id: string
  name: string
  surname: string
  nation: string
  role: Role
  ovr: number
  /**
   * The three figures the card shows, ranked from the player's actual record
   * for that season. Individually nullable: a batter who faced nine balls has
   * no strike rate worth ranking, and a made-up one would be a lie printed in
   * a confident font.
   */
  s1: number | null
  s2: number | null
  s3: number | null
  alt_roles: Role[]
}

/**
 * The columns the game reads. The table holds more than this — runs, balls,
 * wickets, economy, the record each rating was computed from — but asking for
 * them would put several megabytes on the wire for numbers nothing renders
 * yet. Naming the columns keeps the archive rich and the download small.
 */
export const ROSTER_COLUMNS = [
  'squad_id', 'team_key', 'team_name', 'team_short', 'season', 'competition',
  'formats', 'region', 'player_id', 'name', 'surname', 'nation',
  'role', 'alt_roles', 'ovr', 's1', 's2', 's3',
].join(',')

/*
 * A quick bowler's headline figure was labelled PACE, which reads as speed —
 * and it is not speed. It is what the bowling was worth: wickets taken, runs
 * conceded, against whom. Nothing in the ball-by-ball record says how fast a
 * delivery left the hand, so no rating here can rank bowlers by pure speed,
 * and calling one PACE invited exactly that reading — why is Shoaib Akhtar
 * not top, why is Brett Lee behind Mitchell Johnson.
 *
 * THREAT says what is actually measured, and pairs with the spinner's GUILE:
 * two ways of being hard to get away, neither of them a speed gun.
 */
const STAT_LABELS: Record<Role, [string, string, string]> = {
  BAT: ['BAT', 'CONS', 'SR'],
  WK: ['KEEP', 'BAT', 'SR'],
  AR: ['BAT', 'BOWL', 'IMPCT'],
  PACE: ['THREAT', 'WKT', 'ECON'],
  SPIN: ['GUILE', 'WKT', 'ECON'],
}

export const ROLE_FULL: Record<Role, string> = {
  WK: 'Wicketkeeper',
  BAT: 'Batter',
  AR: 'All-Rounder',
  PACE: 'Pace Bowler',
  SPIN: 'Spin Bowler',
}

/**
 * Era is derived from the season, never annotated. Adding a squad for a new
 * year therefore files itself, which is what keeps the dataset current.
 */
/**
 * The calendar year a season belongs to.
 *
 * Cricket writes a season that runs over the new year as "2019/20", so the
 * label is not always a number. The later year is the one that names the
 * tournament nearly everywhere it matters — the 2007/08 Indian league is the
 * 2008 one, and SA20's 2022/23 is SA20 2023.
 */
export function seasonYear(season: string): number {
  const [start, end] = season.split('/')
  if (!end) return Number(start)
  // "2019/20" — the end is two digits, and carries into the next century.
  const century = Math.floor(Number(start) / 100) * 100
  const year = century + Number(end)
  return year < Number(start) ? year + 100 : year
}

const eraFor = (season: string): Era => {
  const y = seasonYear(season)
  if (y >= 2020) return 'NOW'
  if (y >= 2010) return 'MODERN'
  return 'Y2K'
}

/**
 * Sub-ratings for a squad player, derived from their overall and their role.
 *
 * A marquee card is worth three explicit numbers; the twelfth man is not, and
 * pretending to know his exact strike rate would be inventing detail rather
 * than recording it. The shape below is what the role implies — keepers score
 * quicker than they keep, quicks take wickets rather than make runs — with a
 * small deterministic wobble off the name so two similar players do not come
 * out identical.
 */
const ROLE_SHAPE: Record<Role, [number, number, number]> = {
  BAT: [2, 0, 1],
  WK: [2, -1, 3],
  AR: [1, -1, 3],
  PACE: [2, 0, 0],
  SPIN: [2, 0, 2],
}

/** Stable per-name wobble in the range -2…2, so cards vary but never drift. */
function wobble(name: string, i: number): number {
  let h = 7
  for (let c = 0; c < name.length; c++) h = (h * 31 + name.charCodeAt(c)) >>> 0
  return ((h >>> (i * 5)) % 5) - 2
}

function derivedStats(name: string, role: Role, ovr: number): [number, number, number] {
  const shape = ROLE_SHAPE[role]
  return [0, 1, 2].map((i) => Math.min(99, Math.max(40, ovr + shape[i] + wobble(name, i)))) as [
    number,
    number,
    number,
  ]
}

/** Batting/bowling contribution a role makes to the team simulation. */
function contribution(role: Role, s: [number, number, number]) {
  const [a, b, c] = s
  switch (role) {
    case 'BAT':
      return { bat: a, bowl: 8 }
    case 'WK':
      return { bat: b, bowl: 5 }
    case 'AR':
      return { bat: a, bowl: b }
    case 'PACE':
    case 'SPIN':
      return { bat: role === 'PACE' ? 22 : 24, bowl: Math.round((a + b + c) / 3) }
  }
}

/* ── The archive ───────────────────────────────────────────────────────── */

export const SQUADS: Squad[] = []
export const SQUAD_BY_ID = new Map<string, Squad>()

/** A player's peak across the whole archive, for prime ratings. */
const PEAK = new Map<string, PlayerSeason>()
const PRIMED = new Map<string, Squad>()

let stats = { squads: 0, players: 0, earliest: 0, latest: 0 }

/** Fill the archive from database rows. Safe to call again on a refresh. */
export function hydrate(rows: RosterRow[]): void {
  const byId = new Map<string, Squad>()

  for (const r of rows) {
    let squad = byId.get(r.squad_id)
    if (!squad) {
      squad = {
        id: r.squad_id,
        team: r.team_name,
        teamShort: r.team_short,
        teamKey: r.team_key,
        season: r.season,
        comp: r.competition,
        era: eraFor(r.season),
        region: r.region === 'WORLD' || r.region === 'INTL' ? r.region : 'IN',
        formats: r.formats,
        players: [],
      }
      byId.set(r.squad_id, squad)
    }
    // A roster can only name a player once — a duplicate would put the same
    // man in the batting card twice. Matched on identity, not on name: cricket
    // is full of teammates who share one, and dropping the second of them
    // loses a real player from the squad.
    if (squad.players.some((p) => p.playerId === r.player_id)) continue

    // Fall back one figure at a time, not all three together: most players
    // have a real batting rating and no bowling one, and throwing away the
    // real number because its neighbour is missing helps nobody.
    const fallback = derivedStats(r.name, r.role, r.ovr)
    const raw: [number, number, number] = [
      r.s1 ?? fallback[0],
      r.s2 ?? fallback[1],
      r.s3 ?? fallback[2],
    ]

    squad.players.push({
      id: `${r.squad_id}-${r.player_id}`,
      playerId: r.player_id,
      name: r.name,
      surname: r.surname,
      role: r.role,
      alt: r.alt_roles ?? [],
      nation: r.nation,
      ovr: r.ovr,
      stats: STAT_LABELS[r.role].map((label, i) => ({ label, value: raw[i] })) as [Stat, Stat, Stat],
      team: r.team_name,
      teamShort: r.team_short,
      teamKey: r.team_key,
      season: r.season,
      comp: r.competition,
      ...contribution(r.role, raw),
    })
  }

  SQUADS.length = 0
  SQUADS.push(...byId.values())

  SQUAD_BY_ID.clear()
  for (const s of SQUADS) SQUAD_BY_ID.set(s.id, s)

  PEAK.clear()
  PRIMED.clear()
  for (const squad of SQUADS) {
    for (const p of squad.players) {
      /*
       * A peak per player per format, not one peak per name.
       *
       * By name, the two Rashid Khans shared a career: forty-one names in the
       * archive belong to more than one cricketer, and the better of them lent
       * the other his rating.
       *
       * And across formats it was worse. Half the archive drew its prime from
       * a different kind of cricket entirely — Shane Watson's T20 league card
       * went from 65 to 98 on the strength of a World Cup, and Gayle's league
       * card was lifted by an international one. A player's peak in this
       * format is a real thing; their peak in some other format is not a
       * better version of this card, it is a different card.
       */
      for (const format of squad.formats) {
        const key = `${p.playerId}|${format}`
        const best = PEAK.get(key)
        if (!best || p.ovr > best.ovr) PEAK.set(key, p)
      }
    }
  }

  const years = SQUADS.map((s) => seasonYear(s.season))
  stats = {
    squads: SQUADS.length,
    players: SQUADS.reduce((n, s) => n + s.players.length, 0),
    earliest: years.length ? Math.min(...years) : 0,
    latest: years.length ? Math.max(...years) : 0,
  }
}

export const isLoaded = () => SQUADS.length > 0

/* ── Prime ratings ─────────────────────────────────────────────────────── */

const cap = (n: number) => Math.min(99, Math.max(20, Math.round(n)))

/**
 * The prime version of a drawn card: same player, same season on the front,
 * lifted to the numbers they hit at their peak. Sub-ratings are scaled rather
 * than copied so the labels still match the role you drafted them into.
 */
export function primeOf(p: PlayerSeason, format: Format): PlayerSeason {
  const peak = PEAK.get(`${p.playerId}|${format}`)
  if (!peak || peak.ovr <= p.ovr) return { ...p, prime: true, peakSeason: p.season }
  /*
   * When the peak season was played in the same role, its figures are the
   * right ones and are taken as they are. Scaling is the fallback for a peak
   * reached in another role — an all-rounder's best year against a card drafted
   * as a batter — where the labels would not line up if they were copied.
   */
  const k = peak.ovr / p.ovr
  const stats =
    peak.role === p.role
      ? (peak.stats.map((s) => ({ ...s })) as [Stat, Stat, Stat])
      : (p.stats.map((s) => ({ ...s, value: cap(s.value * k) })) as [Stat, Stat, Stat])
  return {
    ...p,
    ovr: peak.ovr,
    stats,
    bat: peak.role === p.role ? peak.bat : cap(p.bat * k),
    bowl: peak.role === p.role ? peak.bowl : cap(p.bowl * k),
    prime: true,
    peakSeason: peak.season,
  }
}

/**
 * A squad seen through the chosen rating mode. Memoised — ids never change.
 *
 * The format matters: a prime card is the best this player managed in this
 * kind of cricket, so the same squad primes differently depending on which
 * tournament is being drafted, and the cache is keyed accordingly.
 */
export function squadRated(squad: Squad, mode: RatingMode, format: Format): Squad {
  if (mode === 'SEASON') return squad
  const key = `${squad.id}|${format}`
  const hit = PRIMED.get(key)
  if (hit) return hit
  const primed = { ...squad, players: squad.players.map((p) => primeOf(p, format)) }
  PRIMED.set(key, primed)
  return primed
}

/* ── Queries ───────────────────────────────────────────────────────────── */

/** Every role a player can be slotted into. */
export const rolesOf = (p: PlayerSeason): Role[] => [p.role, ...p.alt]

/** Newest season in the archive — the game advertises how current it is. */
export const latestSeason = () => stats.latest

/**
 * Headline numbers for the home screen. A function rather than a constant
 * because the archive arrives after the module does.
 */
export function datasetStats() {
  return {
    squads: stats.squads,
    players: stats.players,
    range: stats.earliest ? `${stats.earliest}–${stats.latest}` : '—',
    latest: stats.latest,
    /**
     * True when the archive covers the calendar year the player is in. A season
     * is only added once it has been played, so in January the newest squad is
     * usually last year's — that is current, not stale.
     */
    current: stats.latest >= new Date().getFullYear() - 1,
  }
}

export const ERA_LABEL: Record<Era, string> = {
  Y2K: '2000s',
  MODERN: '2010s',
  NOW: '2020s',
}

/** Distinct sides available for a one-team draft in a given format. */
/**
 * The span of years a format has squads for.
 *
 * Every format starts at a different point, because the cricket did: Tests run
 * from the beginning of the archive, one-day internationals nearly as far, and
 * T20 internationals only from 2005, when the format was invented. A single
 * shared range would offer years that hold nothing.
 */
export function yearsForFormat(format: Format): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const s of SQUADS) {
    if (!s.formats.includes(format)) continue
    const y = seasonYear(s.season)
    if (y < lo) lo = y
    if (y > hi) hi = y
  }
  return Number.isFinite(lo) ? [lo, hi] : [2000, new Date().getFullYear()]
}

export function teamsForFormat(format: Format) {
  const byKey = new Map<string, Squad[]>()
  for (const s of SQUADS) {
    if (!s.formats.includes(format)) continue
    const list = byKey.get(s.teamKey) ?? []
    list.push(s)
    byKey.set(s.teamKey, list)
  }
  return (
    [...byKey.entries()]
      // The full name, not the short one. Franchise cricket is full of clubs
      // that share a city — Barbados have had Royals and Tridents, Chittagong
      // Kings and Vikings — and a list of first words cannot tell them apart.
      // The most recent name is used, since that is the one people know.
      .map(([key, squads]) => {
        const latest = [...squads].sort((a, b) => seasonYear(b.season) - seasonYear(a.season))[0]
        return { key, label: latest.team, short: latest.teamShort, squads }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  )
}
