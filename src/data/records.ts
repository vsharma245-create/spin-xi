import { api, signIn } from './account'
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
export async function saveResult(
  result: TournamentResult,
  opts: { dailyKey?: string; seed?: number; years?: [number, number] | null; worldTeams?: boolean },
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
export async function loadLadder(format: Format, limit = 50): Promise<LadderRow[]> {
  return api<LadderRow[]>(
    `ladder?select=*&format=eq.${format}&order=points.desc&limit=${limit}`,
  )
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
