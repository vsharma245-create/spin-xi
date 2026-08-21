/**
 * Achievements.
 *
 * This file also used to hold a field of invented rivals, so a ladder had
 * something on it before anybody had played. Boards read from the server now
 * and every row is somebody's real season, so the rivals — and the screen that
 * had to admit they were not real — are gone.
 */

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
