import { levelFromPoints, scoreOf } from '../game/types'
import type { Format } from '../game/types'

export interface LbRow {
  handle: string
  wins: number
  losses: number
  draws: number
  nrr: number
  ovr: number
  /** Ladder points — what the board is actually sorted on. */
  points: number
  runs: number
  wickets: number
  /** Career level, from experience across every draft they have played. */
  level: number
  region: 'INDIA' | 'GLOBAL'
  friend?: boolean
}

/**
 * A ladder per tournament, because one ladder cannot hold them all.
 *
 * Fourteen wins in a T20 league, eleven at a World Cup and twelve in a Test
 * championship are different lengths of season and different achievements;
 * sorted together on a raw win column, the format decides the ranking before
 * anybody drafts a player. Each tournament keeps its own board, and your own
 * best run in that tournament is spliced into it.
 *
 * These rivals are invented. There is no server behind this yet, and the
 * screen says so rather than implying a field of real players.
 */
/**
 * A rival's season, filled out from their record.
 *
 * Runs and wickets are generated from the handle and the result, so a given
 * rival always has the same season, and then scored by **the same function
 * that scores yours**. Inventing their points directly would let the mock
 * drift from the real formula and quietly rank a fake ahead of a real run it
 * should have lost to.
 */
function seasonFor(
  format: Format,
  handle: string,
  wins: number,
  losses: number,
  draws: number,
): Pick<LbRow, 'points' | 'runs' | 'wickets' | 'level'> {
  let h = 2166136261
  for (const ch of `${handle}|${format}|${wins}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const jitter = (n: number) => ((Math.abs(h >>> n) % 1000) / 1000 - 0.5) * 2

  const games = wins + losses + draws
  const par = { T20L: 165, T20WC: 158, ODIWC: 285, TEST: 380 }[format]
  // A winning side scores above par and takes more wickets; a losing one does not.
  const form = 1 + (wins / Math.max(1, games) - 0.5) * 0.34 + jitter(3) * 0.06
  const runs = Math.round(par * games * form)
  const wickets = Math.round(games * (format === 'TEST' ? 14 : 7.4) * (0.82 + (wins / Math.max(1, games)) * 0.4 + jitter(11) * 0.08))
  const points = scoreOf(format, { wins, draws, runs, wickets })
  /**
   * A rival's level is career experience, not this one season — everybody on a
   * board has played before. Their career is invented from the handle so it
   * stays put between visits, and is a plausible multiple of a season's points.
   */
  const seasons = 6 + (Math.abs(h >>> 7) % 34)
  return { points, runs, wickets, level: levelFromPoints(points * seasons) }
}

const rivals = (
  format: Format,
  rows: [string, number, number, number, number, 'INDIA' | 'GLOBAL', boolean?][],
): LbRow[] =>
  rows.map(([handle, wins, losses, nrr, ovr, region, friend]) => ({
    handle,
    wins,
    losses,
    draws: 0,
    nrr,
    ovr,
    region,
    friend,
    ...seasonFor(format, handle, wins, losses, 0),
  }))

const testRivals = (
  rows: [string, number, number, number, number, 'INDIA' | 'GLOBAL', boolean?][],
): LbRow[] =>
  rows.map(([handle, wins, losses, draws, ovr, region, friend]) => ({
    handle,
    wins,
    losses,
    draws,
    nrr: 0,
    ovr,
    region,
    friend,
    ...seasonFor('TEST', handle, wins, losses, draws),
  }))

export const LADDERS: Record<string, LbRow[]> = {
  T20L: rivals('T20L', [
    ['CricketGOAT', 14, 0, 1.62, 96, 'GLOBAL'],
    ['VK18', 13, 1, 1.41, 95, 'INDIA'],
    ['BumrahFan', 13, 1, 1.18, 94, 'INDIA', true],
    ['reverse_swing', 12, 2, 1.33, 93, 'GLOBAL'],
    ['Aryan', 12, 2, 0.96, 94, 'INDIA', true],
    ['doosra', 12, 2, 0.74, 92, 'GLOBAL'],
    ['MidwicketMaxi', 11, 3, 0.88, 91, 'GLOBAL'],
    ['Ishaan_92', 11, 3, 0.52, 93, 'INDIA'],
    ['nightwatchman', 10, 4, 0.61, 92, 'GLOBAL', true],
    ['YorkerKing', 10, 4, 0.34, 90, 'INDIA'],
    ['gullyleague', 9, 5, 0.29, 91, 'GLOBAL'],
    ['CoverDrive07', 9, 5, 0.12, 89, 'INDIA', true],
    ['SelectorSaab', 8, 6, -0.05, 90, 'INDIA'],
  ]),
  ODIWC: rivals('ODIWC', [
    ['thirdman', 11, 0, 1.44, 95, 'GLOBAL'],
    ['VK18', 10, 1, 1.21, 94, 'INDIA'],
    ['SelectorSaab', 10, 1, 0.97, 93, 'INDIA'],
    ['CricketNerd', 9, 2, 1.02, 95, 'GLOBAL'],
    ['Aryan', 9, 2, 0.66, 92, 'INDIA', true],
    ['reverse_swing', 8, 3, 0.71, 93, 'GLOBAL'],
    ['nightwatchman', 8, 3, 0.44, 91, 'GLOBAL', true],
    ['YorkerKing', 7, 4, 0.30, 90, 'INDIA'],
    ['gullyleague', 6, 5, 0.08, 89, 'GLOBAL'],
    ['CoverDrive07', 6, 5, -0.11, 88, 'INDIA', true],
  ]),
  T20WC: rivals('T20WC', [
    ['doosra', 9, 0, 1.51, 94, 'GLOBAL'],
    ['MidwicketMaxi', 8, 1, 1.26, 93, 'GLOBAL'],
    ['BumrahFan', 8, 1, 1.09, 94, 'INDIA', true],
    ['Ishaan_92', 7, 2, 0.83, 92, 'INDIA'],
    ['CricketGOAT', 7, 2, 0.67, 95, 'GLOBAL'],
    ['gullyleague', 6, 3, 0.41, 90, 'GLOBAL'],
    ['Aryan', 6, 3, 0.22, 91, 'INDIA', true],
    ['YorkerKing', 5, 4, 0.04, 89, 'INDIA'],
    ['thirdman', 4, 5, -0.18, 88, 'GLOBAL'],
  ]),
  TEST: testRivals([
    ['nightwatchman', 10, 0, 2, 94, 'GLOBAL', true],
    ['CricketNerd', 9, 1, 2, 95, 'GLOBAL'],
    ['SelectorSaab', 8, 1, 3, 93, 'INDIA'],
    ['reverse_swing', 8, 2, 2, 92, 'GLOBAL'],
    ['VK18', 7, 2, 3, 93, 'INDIA'],
    ['thirdman', 6, 3, 3, 90, 'GLOBAL'],
    ['Ishaan_92', 5, 4, 3, 89, 'INDIA'],
    ['CoverDrive07', 4, 5, 3, 88, 'INDIA', true],
  ]),
}

export interface Take {
  handle: string
  take: string
  votes: number
  comments: number
}

export const TAKES: Take[] = [
  { handle: 'reverse_swing', take: 'Prime Bumrah > prime Malinga. Not close.', votes: 4218, comments: 512 },
  { handle: 'VK18', take: '2016 Kohli is unbeatable. Nobody has touched that season since.', votes: 6904, comments: 1130 },
  { handle: 'nightwatchman', take: '2007 India beats 2024 India in a five-match series.', votes: 2871, comments: 947 },
  { handle: 'doosra', take: 'Narine 2014 is the single best T20 bowling season ever recorded.', votes: 3355, comments: 288 },
]

export interface Achievement {
  icon: string
  name: string
  hint: string
  /** Unlock predicate inputs come from the local profile. */
  key: 'firstDraft' | 'champion' | 'perfect' | 'streak7' | 'allTime' | 'ten'
}

export const ACHIEVEMENTS: Achievement[] = [
  { icon: '◈', name: 'FIRST XI', hint: 'Complete your first draft', key: 'firstDraft' },
  { icon: '★', name: 'SILVERWARE', hint: 'Win a tournament', key: 'champion' },
  { icon: '⬢', name: 'PERFECT RUN', hint: 'Go 14–0 unbeaten', key: 'perfect' },
  { icon: '⟡', name: 'WEEK ON', hint: '7-day daily streak', key: 'streak7' },
  { icon: '◐', name: 'ERA HOPPER', hint: 'Draft 10 XIs', key: 'ten' },
  { icon: '◇', name: 'ARCHIVIST', hint: 'Win 50 matches total', key: 'allTime' },
]
