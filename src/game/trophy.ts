import { clamp } from './draft'
import { opponentPool, sideLabel } from './opponents'
import { PITCH_TYPES, playMatch, strengthOf, strengthOnPitch } from './sim'
import { conditionsEdge, conditionsFor, shouldBatFirst } from './conditions'
import { TROPHY_ROUNDS } from './types'
import type {
  Opponent,
  PlayerSeason,
  RatingMode,
  TeamRatings,
  TrophyRun,
  TrophyTie,
} from './types'

/**
 * The Champions Trophy: an invitational the top three of the T20 League can
 * enter. The eight-side draw is assembled fresh from the strongest recent
 * squads in T20 leagues around the world — the Big Bash, the PSL, the CPL,
 * SA20, the Hundred and the rest — so no two entries are the same and the
 * bracket is never a rerun of the league you just played.
 */

/**
 * How much harder each successive round is.
 *
 * A knockout against the best sides in the world tightens as it goes: the
 * quarter-final is winnable, the final is not meant to be. Measured over five
 * hundred entries a side, a strongly drafted XI lifts the trophy about one
 * time in five and an ordinary one about one in ten — often enough to chase,
 * rare enough to mean something, and twice as likely for the better side.
 */
const ROUND_STEP = 0.03

/** Draws a fresh seven-side field: real teams, the best recent ones, shuffled. */
export function drawTrophyField(rand: () => number, ratingMode: RatingMode): Opponent[] {
  // The world's leagues, not just one of them — that is what makes it a
  // Champions Trophy rather than another season of the same competition.
  return opponentPool('T20L', rand, TROPHY_ROUNDS.length + 4, {
    latest: true,
    best: true,
    // Drawn from a wide enough shortlist that the bracket has favourites and
    // outsiders. Taken from the very top the field came out all one calibre,
    // every tie a coin toss, and how well you had drafted barely showed in
    // whether you lifted it.
    bestOf: 34,
    world: true,
    ratingMode,
  })
}

export function newTrophyRun(rand: () => number, ratingMode: RatingMode = 'SEASON'): TrophyRun {
  return {
    ties: [],
    won: false,
    field: drawTrophyField(rand, ratingMode),
    // Surfaces are drawn with the field, so the player can read the pitch
    // before calling the toss — the same edge the league knockouts give.
    pitches: TROPHY_ROUNDS.map(() => PITCH_TYPES[Math.floor(rand() * PITCH_TYPES.length)]),
  }
}

/** Which side we meet in a given round — the draw is walked in order. */
export const opponentFor = (run: TrophyRun, round: number) =>
  run.field[round % run.field.length]

/**
 * Plays one tie. Knockout cricket against the league's best is harder than the
 * league itself, and the rounds tighten as the trophy gets closer.
 */
export function playTrophyTie(
  run: TrophyRun,
  ratings: TeamRatings,
  xi: PlayerSeason[],
  attack: { pace: number; spin: number },
  rand: () => number,
  toss: { won: boolean; batFirst: boolean } | null,
): TrophyTie {
  const k = run.ties.length
  const round = TROPHY_ROUNDS[k]
  const opponent = opponentFor(run, k)
  const pitch = run.pitches[k]

  const ours = strengthOnPitch(strengthOf(ratings), ratings, attack, pitch)
  const theirs = strengthOnPitch(
    strengthOf(opponent.ratings),
    opponent.ratings,
    opponent.attack,
    pitch,
  )

  /**
   * The same curve every other match is decided on.
   *
   * This used to convert a rating gap into odds at its own rate — more than
   * twice the slope the leagues use, and a ceiling nine points higher — so a
   * strong side was far more certain of a Champions Trophy tie than of an
   * ordinary league game against a weaker opponent. Two competitions cannot
   * disagree about what a five-point advantage is worth, and a curve that
   * lives here would not follow if the shared one were ever retuned.
   *
   * What stays trophy-specific is the shape of an invitational: the field is
   * the strongest sides in world cricket rather than a league's spread, and
   * each round is harder than the last.
   */
  /*
   * The same afternoon the rest of the game plays in: a heavy sky, dew under
   * the lights, a surface that will turn. Drawn once, before the result, so
   * the toss and the scorecard agree about it.
   */
  const conditions = conditionsFor('T20L', pitch, rand)
  const theirCall = shouldBatFirst(conditions)

  /*
   * An edge in rating points rather than a win probability, because the tie is
   * now played rather than decided. Each round is harder than the last, which
   * is what an invitational is.
   */
  let edge = ours - theirs - k * ROUND_STEP * 30
  if (toss?.won) edge += toss.batFirst === theirCall ? 4.5 : 1
  const weBatFirst = toss ? (toss.won ? toss.batFirst : !theirCall) : rand() < 0.5
  edge += conditionsEdge(conditions, weBatFirst)

  const match = playMatch(
    k + 1,
    round,
    opponent,
    xi,
    'T20L',
    true,
    pitch,
    rand,
    conditions,
    clamp(edge, -34, 34),
    // An invitational is three ties, which is not long enough for form.
    undefined,
    toss?.won,
    weBatFirst,
  )

  const tie: TrophyTie = { round, opponent, match }
  run.ties.push(tie)
  run.won =
    run.ties.length === TROPHY_ROUNDS.length && run.ties.every((t) => t.match.outcome === 'W')
  return tie
}

export const trophyOver = (run: TrophyRun) =>
  run.won ||
  run.ties.some((t) => t.match.outcome === 'L') ||
  run.ties.length >= TROPHY_ROUNDS.length

export function trophyHeadline(run: TrophyRun) {
  if (run.won) return 'CHAMPIONS TROPHY WINNERS'
  const lost = run.ties.find((t) => t.match.outcome === 'L')
  if (!lost) return 'IN PROGRESS'
  return lost.round === 'FINAL' ? 'RUNNERS-UP' : `OUT IN THE ${lost.round}`
}

export { sideLabel }
