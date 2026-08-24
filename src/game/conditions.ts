/**
 * The conditions a match is played in.
 *
 * Cricsheet records what happened ball by ball; it does not record the weather,
 * and no rating here could be derived from it. But the matches in this game
 * never happened either — every run and wicket on a scorecard is simulated —
 * so conditions are not a claim about history being invented. They are part of
 * the same fiction as the cricket, and cricket without them is missing the
 * thing every player at a ground talks about before the toss.
 *
 * They are drawn from the same seeded random stream as the rest of the match,
 * so a season replays identically, and they are drawn once so the toss, the
 * scoring and the scorecard all describe the same afternoon.
 */
import type { Format, PitchType } from './types'

export type TimeOfDay = 'DAY' | 'DAY_NIGHT' | 'NIGHT'
export type Sky = 'CLEAR' | 'OVERCAST' | 'HUMID'

export interface Conditions {
  time: TimeOfDay
  sky: Sky
  /** Heavy dew later on, which makes the ball hard to grip and a chase easier. */
  dew: boolean
  pitch: PitchType
}

export const SKY_LABEL: Record<Sky, string> = {
  CLEAR: 'Clear skies',
  OVERCAST: 'Overcast',
  HUMID: 'Warm and humid',
}

export const TIME_LABEL: Record<TimeOfDay, string> = {
  DAY: 'Day match',
  DAY_NIGHT: 'Day-nighter',
  NIGHT: 'Under lights',
}

/**
 * What kind of afternoon this is.
 *
 * A Test is played in daylight over five days, so it gets none of the evening
 * weather that decides a limited-overs match; the shorter formats are mostly
 * played under lights, which is where dew comes into it.
 */
export function conditionsFor(format: Format, pitch: PitchType, rand: () => number): Conditions {
  const roll = rand()
  const time: TimeOfDay =
    format === 'TEST' ? 'DAY' : roll < 0.45 ? 'NIGHT' : roll < 0.8 ? 'DAY_NIGHT' : 'DAY'

  const skyRoll = rand()
  const sky: Sky = skyRoll < 0.6 ? 'CLEAR' : skyRoll < 0.85 ? 'HUMID' : 'OVERCAST'

  // Dew settles in the evening, and settles harder when the air is already wet.
  const chance = time === 'DAY' ? 0 : sky === 'HUMID' ? 0.55 : 0.3
  return { time, sky, dew: rand() < chance, pitch }
}

/**
 * Whether a captain winning the toss should bat.
 *
 * The reasoning a commentator would give: bowl under a heavy sky because the
 * ball moves, bowl if there will be dew because chasing gets easier once the
 * ball is wet, and otherwise take first use of a surface that will only get
 * worse.
 */
export function shouldBatFirst(c: Conditions): boolean {
  if (c.dew) return false
  if (c.sky === 'OVERCAST') return false
  return c.pitch === 'BATTING' || c.pitch === 'NEUTRAL' || c.pitch === 'SPIN'
}

/** Why they chose it, in the words a captain would use at the toss. */
export function tossReason(c: Conditions): string {
  if (c.dew) return 'there will be dew about later, and chasing gets easier once the ball is wet'
  if (c.sky === 'OVERCAST') return 'it is heavy overhead and the ball should move around early'
  if (c.pitch === 'PACE') return 'there is life in the surface and it will not last'
  if (c.pitch === 'SPIN') return 'it will turn square by the end, so runs are worth more now'
  return 'the pitch looks its best right now'
}

/**
 * What the conditions are worth to the side batting second, in the same units
 * the rest of the simulation uses for an edge.
 *
 * Small on purpose. Conditions should decide close matches and colour the ones
 * they do not decide; a side that is better should still usually win.
 */
export function conditionsEdge(c: Conditions, weBattedFirst: boolean): number {
  let chasing = 0
  // A wet ball is hard to grip, so the side bowling second suffers.
  if (c.dew) chasing += 2.6
  // Under a heavy sky the new ball does more, which the side batting first faces.
  if (c.sky === 'OVERCAST') chasing += 1.4
  // Lights and a used surface make batting last harder on a turner.
  if (c.pitch === 'SPIN') chasing -= 1.8
  return weBattedFirst ? -chasing : chasing
}
