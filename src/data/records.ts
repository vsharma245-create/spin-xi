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
  player: string
  handle: string
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
    // Which build of the ratings this season was played against.
    dataset_version: datasetVersion(),
  }

  await api('results', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
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
export async function loadHistory(limit = 20): Promise<HistoryRow[]> {
  const account = await signIn()
  return api<HistoryRow[]>(
    `results?select=id,format,mode,daily_key,points,idx,wins,losses,draws,outcome,perfect,team_name,created_at` +
      `&player=eq.${account.id}&order=created_at.desc&limit=${limit}`,
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
 * A tournament board over a window of time.
 *
 * The `ladder` view answers "best ever", which cannot also answer "best
 * today", so this reads the seasons themselves and keeps each player's best
 * one. Daily runs are left out: everybody drafts from the same squads that
 * day, so it is a different contest and has its own board.
 *
 * Two round trips — the seasons, then the career experience of whoever is on
 * the board, which lives in a view the seasons cannot be joined to. The row
 * cap is deliberate; a board nobody scrolls does not need every season ever
 * played, and the alternative is DISTINCT ON, which PostgREST cannot express.
 */
export async function loadBoard(
  format: Format,
  since: string | null,
  limit = 50,
): Promise<LadderRow[]> {
  const when = since ? `&created_at=gte.${since}` : ''
  const seasons = await api<
    (Omit<LadderRow, 'xp' | 'handle'> & { profiles: { handle: string } | null })[]
  >(
    `results?select=player,format,points,runs,wickets,wins,losses,draws,nrr,perfect,profiles(handle)` +
      `&format=eq.${format}&mode=eq.quick${when}&order=points.desc&limit=400`,
  )

  const best = new Map<string, LadderRow>()
  for (const row of seasons) {
    if (best.has(row.player)) continue // already have their best: rows arrive sorted
    best.set(row.player, { ...row, handle: row.profiles?.handle ?? 'Unknown', xp: null })
  }
  const rows = [...best.values()].slice(0, limit)
  if (!rows.length) return rows

  const ids = rows.map((r) => r.player).join(',')
  const careers = await api<{ id: string; xp: number }[]>(
    `player_stats?select=id,xp&id=in.(${ids})`,
  ).catch(() => [])
  const xpOf = new Map(careers.map((c) => [c.id, c.xp]))
  return rows.map((r) => ({ ...r, xp: xpOf.get(r.player) ?? null }))
}

/** Today's daily, where everyone shared a draw. */
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
