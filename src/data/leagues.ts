import { api, signIn } from './account'
import type { Difficulty, Format, RatingMode } from '../game/types'

/**
 * Leagues — the same rules, everybody's own eleven.
 *
 * The rules live on the league row and the database refuses a season that
 * did not follow them, so nothing here has to be trusted. This module is
 * only the way in and out.
 */

export interface LeagueRules {
  format: Format
  preset_id: string
  rating_mode: RatingMode
  difficulty: Difficulty
  from_year: number | null
  to_year: number | null
  world_teams: boolean
}

export interface League extends LeagueRules {
  id: string
  code: string
  name: string
  category: string | null
  host: string
  scoring: 'latest' | 'best'
  max_players: number | null
  closes_at: string | null
  signed_in_only: boolean
  host_played_at: string | null
}

export interface LeaguePreview extends LeagueRules {
  id: string
  name: string
  category: string | null
  scoring: 'latest' | 'best'
  closes_at: string | null
  signed_in_only: boolean
  players: number
  is_open: boolean
}

export interface LeagueRow {
  league_id: string
  player: string
  handle: string
  points: number
  wins: number
  losses: number
  draws: number
  runs: number
  wickets: number
  nrr: number
  outcome: string
  perfect: boolean
  team_name: string
  created_at: string
}

/*
 * Six characters from an alphabet with no 0/O and no 1/l/I.
 *
 * The code is read off one phone and typed into another as often as it is
 * tapped, and a league nobody can join because the l looked like a 1 is a
 * league that does not happen.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const makeCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((n) => ALPHABET[n % ALPHABET.length])
    .join('')

export async function createLeague(
  input: Omit<League, 'id' | 'code' | 'host' | 'host_played_at'>,
): Promise<League> {
  const account = await signIn()

  // Two hosts can invent the same code at the same moment. Rare enough to
  // retry rather than coordinate over, exactly like a handle.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [made] = await api<League[]>('leagues', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...input, code: makeCode(), host: account.id }),
      })
      if (made) {
        // The host is in their own league from the moment it exists.
        await api('league_entries', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ league_id: made.id, player: account.id }),
        }).catch(() => {})
        return made
      }
    } catch (err) {
      if (!/duplicate key|23505/.test(String(err))) throw err
    }
  }
  throw new Error('Could not find a free league code.')
}

/** What a league looks like from outside, before joining. */
export async function previewLeague(code: string): Promise<LeaguePreview | null> {
  const [found] = await api<LeaguePreview[]>('rpc/league_preview', {
    method: 'POST',
    body: JSON.stringify({ join_code: code.toLowerCase() }),
  })
  return found ?? null
}

/** Take a place. Opening the link twice is not two entries. */
export async function joinLeague(code: string): Promise<string> {
  return api<string>('rpc/league_join', {
    method: 'POST',
    body: JSON.stringify({ join_code: code.toLowerCase() }),
  })
}

/** The league itself, once you are in it. */
export async function loadLeague(code: string): Promise<League | null> {
  const [found] = await api<League[]>(`leagues?select=*&code=eq.${code.toLowerCase()}`)
  return found ?? null
}

export async function loadLeagueTable(leagueId: string): Promise<LeagueRow[]> {
  return api<LeagueRow[]>(
    `league_table?select=*&league_id=eq.${leagueId}&order=points.desc`,
  )
}

/** Leagues this player is in, newest first. */
export async function myLeagues(): Promise<League[]> {
  const account = await signIn()
  const entries = await api<{ league_id: string }[]>(
    `league_entries?select=league_id&player=eq.${account.id}`,
  )
  if (!entries.length) return []
  const ids = entries.map((e) => e.league_id).join(',')
  return api<League[]>(`leagues?select=*&id=in.(${ids})&order=created_at.desc`)
}

/** How long is left, in words, or null when a league has no deadline. */
export function timeLeft(closesAt: string | null): string | null {
  if (!closesAt) return null
  const ms = new Date(closesAt).getTime() - Date.now()
  if (ms <= 0) return 'closed'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min left`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left`
  return `${Math.round(hours / 24)} days left`
}
