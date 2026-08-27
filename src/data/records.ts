import { api, signIn } from './account'
import { datasetVersion } from './repository'
import { scoreOf, seasonIndex } from '../game/types'
import type { Format, TournamentResult, TrophyRun } from '../game/types'

/**
 * What players have done, kept where everyone can see it.
 *
 * Results used to live in this device's local storage, which made a ladder
 * impossible — there was nobody else in it — and lost a career to a cleared
 * browser. They are now rows in Postgres, written once and never revised.
 *
 * Local storage still holds a copy, but only as a cache: it answers instantly
 * while the network is asked, and it keeps the profile readable on a train.
 * The database is what is true.
 */

export interface Stats {
  id: string
  handle: string
  drafts: number
  wins: number
  losses: number
  draws: number
  runs: number
  wickets: number
  trophies: number
  perfect_runs: number
  best_wins: number
  xp: number
}

export interface LadderRow {
  /** The season itself, so it can be opened and looked at. */
  id: string
  player: string
  handle: string
  /** What they called their side. Stored since the first result, never shown. */
  teamName: string | null
  /** Career experience, so a board can show what level each player is. */
  xp: number | null
  format: Format
  points: number
  runs: number
  wickets: number
  wins: number
  losses: number
  draws: number
  nrr: number
  perfect: boolean
}

export interface HistoryRow {
  id: string
  format: Format
  mode: 'quick' | 'daily'
  daily_key: string | null
  points: number
  idx: number
  wins: number
  losses: number
  draws: number
  outcome: string
  perfect: boolean
  team_name: string
  created_at: string
}

export interface Split {
  kind: 'format' | 'rating_mode' | 'difficulty'
  key: string
  drafts: number
  wins: number
  losses: number
  draws: number
  runs: number
  wickets: number
  trophies: number
  perfect_runs: number
  best_points: number
  best_wins: number
  best_nrr: number
}

/* ── Writing ───────────────────────────────────────────────────────────── */

/**
 * Record a finished season.
 *
 * The seed and the XI go with it. The simulation is deterministic, so those
 * two are everything a verifier would need to replay the season and check the
 * score — which means the client can be trusted provisionally now and checked
 * properly later, without asking players to replay anything.
 */
/* ── What happened, as opposed to what was achieved ────────────────────── */

export type EventName =
  | 'draft_started'
  | 'draft_abandoned'
  | 'draft_completed'
  | 'season_simulated'
  | 'account_claimed'
  | 'handle_changed'
  | 'result_shared'
  | 'challenge_opened'

/**
 * Record something that happened.
 *
 * Deliberately unawaited and deliberately silent. Nothing the game shows
 * depends on this landing, and a player whose draft dies because a telemetry
 * write timed out has been very badly served. Failures are dropped rather than
 * retried: a lost row costs one point on a chart.
 */
export function track(name: EventName, draftId?: string, detail: object = {}): void {
  void signIn()
    .then((account) =>
      // The row names its own author and the policy checks that against the
      // token, so the account has to be in hand before the write, not after.
      api('events', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ player: account.id, name, draft_id: draftId ?? null, detail }),
      }),
    )
    .catch(() => {
      /* offline, signed out, or the table is not there yet */
    })
}

/** Note that this player was here today, which is what retention is made of. */
export function touch(): void {
  void signIn()
    .then((account) =>
      api(`profiles?id=eq.${account.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      }),
    )
    .catch(() => {
      /* the column may not exist yet, and nothing on screen depends on it */
    })
}

export async function saveResult(
  result: TournamentResult,
  opts: {
    dailyKey?: string
    seed?: number
    years?: [number, number] | null
    worldTeams?: boolean
    /** How long the draft took, from first spin to result. */
    durationMs?: number | null
    /** Set when the season is an entry in a league. */
    leagueId?: string | null
  },
): Promise<void> {
  const account = await signIn()
  const row = {
    player: account.id,
    format: result.format,
    mode: result.mode,
    daily_key: result.mode === 'daily' ? (opts.dailyKey ?? null) : null,
    preset_id: result.presetId,
    rating_mode: result.ratingMode,
    difficulty: result.difficulty,
    from_year: opts.years?.[0] ?? null,
    to_year: opts.years?.[1] ?? null,
    world_teams: opts.worldTeams ?? true,
    wins: result.wins,
    losses: result.losses,
    draws: result.draws,
    runs: result.score.runs,
    wickets: result.score.wickets,
    nrr: result.table.find((r) => r.us)?.nrr ?? 0,
    standing: result.standing,
    outcome: result.outcome,
    perfect: result.perfect,
    points: result.score.points,
    idx: seasonIndex(result.format, result.score.points),
    team_name: result.teamName,
    seed: opts.seed ?? null,
    xi: result.slots.map((s) => s.player && { n: s.player.name, s: s.player.season, r: s.role }),
    duration_ms: opts.durationMs ?? null,
    league_id: opts.leagueId ?? null,
    // Which build of the ratings this season was played against.
    dataset_version: datasetVersion(),
  }

  await api('results', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })

  /*
   * Stamp the first season this account ever finished.
   *
   * The condition is in the filter rather than in a read-then-write, so two
   * seasons finishing at once cannot both decide they are the first. Only rows
   * where it is still null are touched, which also makes this free to call on
   * every result for ever.
   */
  void api(`profiles?id=eq.${account.id}&first_result_at=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ first_result_at: new Date().toISOString() }),
  }).catch(() => {
    /* the column may not exist yet; the season is already saved either way */
  })
}

/**
 * Record a Champions Trophy run.
 *
 * Filed as a result so it counts toward a career — trophies, experience,
 * level — but under its own mode, because three knockout ties are not a
 * season and would read as an absurdly short one next to a fourteen-game
 * league. The boards filter it out; the profile does not.
 */
export async function saveTrophy(
  run: TrophyRun,
  opts: { teamName: string; ratingMode: string; difficulty: string; presetId: string },
): Promise<void> {
  const account = await signIn()
  const played = run.ties.map((t) => t.match)
  const wins = played.filter((m) => m.outcome === 'W').length
  const runs = played.reduce((n, m) => n + m.card.ourScore.runs, 0)
  const wickets = played.reduce((n, m) => n + m.card.theirScore.wickets, 0)
  const points = scoreOf('T20L', { wins, draws: 0, runs, wickets })

  await api('results', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      player: account.id,
      format: 'T20L',
      mode: 'trophy',
      preset_id: opts.presetId,
      rating_mode: opts.ratingMode,
      difficulty: opts.difficulty,
      wins,
      losses: played.length - wins,
      draws: 0,
      runs,
      wickets,
      nrr: 0,
      outcome: run.won ? 'CHAMPIONS' : 'ELIMINATED',
      perfect: false,
      points,
      idx: seasonIndex('T20L', points),
      team_name: opts.teamName,
    }),
  })
}

/* ── Reading ───────────────────────────────────────────────────────────── */

export async function loadStats(): Promise<Stats> {
  const account = await signIn()
  const [stats] = await api<Stats[]>(`player_stats?select=*&id=eq.${account.id}`)
  return stats
}

/** Recent seasons, newest first — what the competitive rating is built from. */
/**
 * Recent seasons.
 *
 * `rated` asks only for the ones allowed to move a public number. A league
 * season was played under rules somebody else chose — a mate who sets an easy
 * league would lift your rating, and one who sets a brutal one would sink it,
 * neither through anything you decided. They still earn experience, still show
 * in a career, and still stand on their own league's table.
 */
export async function loadHistory(limit = 20, rated = false): Promise<HistoryRow[]> {
  const account = await signIn()
  return api<HistoryRow[]>(
    `results?select=id,format,mode,daily_key,points,idx,wins,losses,draws,outcome,perfect,team_name,created_at` +
      `&player=eq.${account.id}${rated ? '&league_id=is.null' : ''}` +
      `&order=created_at.desc&limit=${limit}`,
  )
}

/** A career cut by tournament, by rating mode and by difficulty, in one read. */
export async function loadSplits(): Promise<Split[]> {
  const account = await signIn()
  return api<Split[]>(`player_splits?select=*&player=eq.${account.id}`)
}

/** A tournament's board: every player's best season in it. */
/** Midnight this morning, in the player's own timezone, as the API wants it. */
export function startOfToday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Monday, so that a week is a week rather than a rolling seven days.
 *
 * An all-time board is decided long before most people find it, and a
 * one-day board is gone before they come back. The week is the one anybody
 * arriving on a Wednesday can still win.
 */
export function startOfWeek(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // getDay() calls Sunday 0; the cricket week, like everyone's, starts Monday.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString()
}

/**
 * A page of a tournament board: the rows, where you stand, and your streak.
 *
 * It used to be two requests and four hundred rows. Every season in the format
 * came down ordered by points so the browser could throw away seven out of
 * eight of them keeping one per player, and then a second request fetched
 * everybody's experience from a view the seasons could not be joined to.
 * Postgres has had DISTINCT ON for this the whole time, so it does it, and
 * fifty rows come back instead of four hundred.
 *
 * Rank arrives with them rather than as a third request, which is what makes
 * it worth showing at all.
 *
 * Daily runs are left out: everybody drafts the same squads that day, so it is
 * a different contest with its own board.
 */
export interface Board {
  rows: LadderRow[]
  /** How many players are on this board at all. */
  total: number
  /** Where you are on it, even when that is far below the last visible row. */
  me: { rank: number; points: number; id: string } | null
  /** Consecutive days on the daily, counted back from the last one played. */
  streak: number
}

export async function loadBoard(
  format: Format,
  since: string | null,
  limit = 50,
): Promise<Board> {
  const account = await signIn().catch(() => null)
  try {
    const board = await api<Board>('rpc/board', {
      method: 'POST',
      body: JSON.stringify({
        p_format: format,
        p_since: since,
        p_player: account?.id ?? null,
        p_limit: limit,
      }),
    })
    if (board) {
      return {
        rows: board.rows ?? [],
        total: board.total ?? 0,
        me: board.me ?? null,
        streak: board.streak ?? 0,
      }
    }
  } catch {
    /*
     * The function is not there yet.
     *
     * The client and the database are pushed by separate hands, and a build
     * that reaches players before `npm run db:push` does would otherwise show
     * them a rain delay where the ladder used to be. The old two-request read
     * still works; it just cannot answer where you stand.
     */
  }
  return oldBoard(format, since, limit)
}

/** The read this replaced: four hundred seasons, deduplicated in the browser. */
async function oldBoard(format: Format, since: string | null, limit: number): Promise<Board> {
  const when = since ? `&created_at=gte.${since}` : ''
  const seasons = await api<
    (Omit<LadderRow, 'xp' | 'handle' | 'teamName'> & {
      team_name: string | null
      profiles: { handle: string } | null
    })[]
  >(
    `results?select=id,player,format,points,runs,wickets,wins,losses,draws,nrr,perfect,team_name,profiles(handle)` +
      `&format=eq.${format}&mode=eq.quick&league_id=is.null${when}` +
      `&order=points.desc&limit=400`,
  )

  const best = new Map<string, LadderRow>()
  for (const row of seasons) {
    if (best.has(row.player)) continue // already have their best: rows arrive sorted
    best.set(row.player, {
      ...row,
      handle: row.profiles?.handle ?? 'Unknown',
      teamName: row.team_name,
      xp: null,
    })
  }
  const rows = [...best.values()].slice(0, limit)
  if (!rows.length) return { rows, total: 0, me: null, streak: 0 }

  const ids = rows.map((r) => r.player).join(',')
  const careers = await api<{ id: string; xp: number }[]>(
    `player_stats?select=id,xp&id=in.(${ids})`,
  ).catch(() => [])
  const xpOf = new Map(careers.map((c) => [c.id, c.xp]))
  return {
    rows: rows.map((r) => ({ ...r, xp: xpOf.get(r.player) ?? null })),
    total: best.size,
    me: null,
    streak: 0,
  }
}

/**
 * The eleven somebody actually picked.
 *
 * Every season has carried its XI since the first one was saved and nothing
 * has ever shown it, so a row on the ladder was a name and a number and no
 * answer to the only question it raises. Results are public by policy; this is
 * the reading of them.
 */
export interface SeasonXI {
  teamName: string
  format: Format
  presetId: string
  ratingMode: string
  difficulty: string
  fromYear: number | null
  toYear: number | null
  wins: number
  losses: number
  draws: number
  runs: number
  wickets: number
  points: number
  outcome: string
  perfect: boolean
  createdAt: string
  /** Name, season and role for each of the eleven, in batting order. */
  xi: { n: string; s: string; r: string }[]
}

export async function loadSeasonXI(id: string): Promise<SeasonXI | null> {
  const [row] = await api<
    {
      team_name: string
      format: Format
      preset_id: string
      rating_mode: string
      difficulty: string
      from_year: number | null
      to_year: number | null
      wins: number
      losses: number
      draws: number
      runs: number
      wickets: number
      points: number
      outcome: string
      perfect: boolean
      created_at: string
      xi: ({ n: string; s: string; r: string } | null)[] | null
    }[]
  >(
    `results?select=team_name,format,preset_id,rating_mode,difficulty,from_year,to_year,` +
      `wins,losses,draws,runs,wickets,points,outcome,perfect,created_at,xi&id=eq.${id}&limit=1`,
  )
  if (!row) return null
  return {
    teamName: row.team_name,
    format: row.format,
    presetId: row.preset_id,
    ratingMode: row.rating_mode,
    difficulty: row.difficulty,
    fromYear: row.from_year,
    toYear: row.to_year,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    runs: row.runs,
    wickets: row.wickets,
    points: row.points,
    outcome: row.outcome,
    perfect: row.perfect,
    createdAt: row.created_at,
    // A season saved before the column existed has no eleven to show.
    xi: (row.xi ?? []).filter((p): p is { n: string; s: string; r: string } => !!p),
  }
}

export async function loadDaily(dateKey: string, limit = 50) {
  return api<(LadderRow & { daily_key: string })[]>(
    `daily_board?select=*&daily_key=eq.${dateKey}&order=points.desc&limit=${limit}`,
  )
}

/** How many people have played today's draw. */
export async function dailyEntrants(dateKey: string): Promise<number> {
  const res = await api<{ count: number }[]>(
    `daily_board?select=count&daily_key=eq.${dateKey}`,
    { headers: { Prefer: 'count=exact' } },
  )
  return res?.[0]?.count ?? 0
}

/** Whether this player has already played today's draw. */
export async function myDaily(dateKey: string): Promise<HistoryRow | null> {
  const account = await signIn()
  const [row] = await api<HistoryRow[]>(
    `results?select=*&player=eq.${account.id}&daily_key=eq.${dateKey}&limit=1`,
  )
  return row ?? null
}
