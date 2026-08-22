import { api, signIn } from './account'
import type { Difficulty, Format, RatingMode } from '../game/types'

/** Talking to a live draft. Thin: the rules are the database's business. */

export interface Room {
  id: string
  code: string
  host: string
  status: 'lobby' | 'drafting' | 'review' | 'done' | 'abandoned'
  round: number
  ready_until: string | null
  seed: number
  format: Format
  preset_id: string
  rating_mode: RatingMode
  difficulty: Difficulty
  from_year: number | null
  to_year: number | null
  world_teams: boolean
  seats: number
  pick_seconds: number
  started_at: string | null
}

export interface Seat {
  room_id: string
  seat: number
  player: string | null
  is_bot: boolean
  ready_round: number
  last_seen_at: string
}

export interface Pick {
  room_id: string
  round: number
  pick_no: number
  seat: number
  squad_id: string
  player_id: string
  slot: number
  made_by: 'human' | 'bot'
  created_at: string
}

export interface RoomPreview {
  id: string
  code: string
  status: Room['status']
  format: Format
  preset_id: string
  rating_mode: RatingMode
  difficulty: Difficulty
  seats: number
  pick_seconds: number
  taken: number
  is_open: boolean
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const makeCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map((n) => ALPHABET[n % ALPHABET.length])
    .join('')

export async function createRoom(
  input: Omit<Room, 'id' | 'code' | 'host' | 'status' | 'seed' | 'started_at' | 'round' | 'ready_until'>,
): Promise<Room> {
  const account = await signIn()
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [made] = await api<Room[]>('draft_rooms', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          ...input,
          code: makeCode(),
          host: account.id,
          // The draw, settled before anybody sits down.
          seed: Math.floor(Math.random() * 2 ** 31),
        }),
      })
      if (!made) continue

      // Every seat exists from the start, empty. A seat that has to be created
      // when somebody arrives is a seat two people can create at once.
      await api('draft_seats', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(
          Array.from({ length: made.seats }, (_, seat) => ({ room_id: made.id, seat })),
        ),
      })
      await sit(made.code)
      return made
    } catch (err) {
      if (!/duplicate key|23505/.test(String(err))) throw err
    }
  }
  throw new Error('Could not find a free draft code.')
}

export async function previewRoom(code: string): Promise<RoomPreview | null> {
  const [found] = await api<RoomPreview[]>('rpc/draft_preview', {
    method: 'POST',
    body: JSON.stringify({ join_code: code.toLowerCase() }),
  })
  return found ?? null
}

/** Take the lowest free seat, or keep the one you already have. */
export async function sit(code: string): Promise<number> {
  return api<number>('rpc/draft_sit', {
    method: 'POST',
    body: JSON.stringify({ join_code: code.toLowerCase() }),
  })
}

export async function loadRoom(code: string): Promise<Room | null> {
  const [found] = await api<Room[]>(`draft_rooms?select=*&code=eq.${code.toLowerCase()}`)
  return found ?? null
}

export const loadSeats = (roomId: string) =>
  api<Seat[]>(`draft_seats?select=*&room_id=eq.${roomId}&order=seat`)

export const loadPicks = (roomId: string) =>
  api<Pick[]>(`draft_picks?select=*&room_id=eq.${roomId}&order=pick_no`)

/** Say you are still here. A seat that stops saying so is taken over. */
export async function heartbeat(roomId: string, seat: number): Promise<void> {
  await api(`draft_seats?room_id=eq.${roomId}&seat=eq.${seat}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  }).catch(() => {})
}

/**
 * Hand your seat to the bot and go.
 *
 * The seat keeps drafting rather than emptying: three people should not be
 * held up by a fourth who has left, and a draft with a hole in it is not a
 * draft. Coming back re-takes the seat, because draft_sit clears the flag.
 */
export async function leaveSeat(roomId: string, seat: number): Promise<void> {
  await api(`draft_seats?room_id=eq.${roomId}&seat=eq.${seat}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ is_bot: true }),
  })
}

/** The host calls the whole thing off. */
export async function abandonRoom(roomId: string): Promise<void> {
  await api(`draft_rooms?id=eq.${roomId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'abandoned' }),
  })
}

/** Start it. Empty seats become bots at the off rather than stalling a round. */
export async function begin(roomId: string): Promise<void> {
  await api<string>('rpc/draft_begin', {
    method: 'POST',
    body: JSON.stringify({ room: roomId }),
  })
}

/**
 * Make a pick.
 *
 * Rejections are expected rather than exceptional: two clients can both notice
 * an overdue seat and both write for it, and the loser is told the draft has
 * moved on. That is the mechanism working, not a fault, so it is reported
 * quietly and the caller simply re-reads the picks.
 */
export async function makePick(pick: {
  room_id: string
  round: number
  pick_no: number
  seat: number
  squad_id: string
  player_id: string
  slot: number
}): Promise<boolean> {
  try {
    await api('draft_picks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(pick),
    })
    return true
  } catch (err) {
    if (/Out of turn|duplicate key|23505|not your turn|already/i.test(String(err))) return false
    throw err
  }
}

export interface DraftRow {
  room_id: string
  round: number
  seat: number
  player: string | null
  handle: string | null
  points: number
  wins: number
  losses: number
  draws: number
  runs: number
  wickets: number
  outcome: string
  perfect: boolean
  team_name: string
}

export const loadDraftTable = (roomId: string) =>
  api<DraftRow[]>(`draft_table?select=*&room_id=eq.${roomId}&order=points.desc`)

/** Say you want another draft. */
export const sayReady = (roomId: string) =>
  api<number>('rpc/draft_ready', { method: 'POST', body: JSON.stringify({ room: roomId }) })

/** Move the session on once the window has passed. Anyone may; first one wins. */
export const advance = (roomId: string) =>
  api<string>('rpc/draft_advance', { method: 'POST', body: JSON.stringify({ room: roomId }) })

/** Record a seat's season. */
export async function saveSeatSeason(row: {
  room_id: string
  seat: number
  player: string
  round: number
  format: string
  preset_id: string
  rating_mode: string
  difficulty: string
  world_teams: boolean
  wins: number
  losses: number
  draws: number
  runs: number
  wickets: number
  nrr: number
  outcome: string
  perfect: boolean
  points: number
  idx: number
  team_name: string
  seed: number
}): Promise<void> {
  await api('results', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...row, mode: 'quick' }),
  }).catch(() => {})
}
