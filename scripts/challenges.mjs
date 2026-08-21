/**
 * The daily rotation.
 *
 * Its own module because it is emitted twice: into archive.sql on a full
 * rebuild, and into challenges.sql on its own — the rotation can be changed
 * without recomputing every rating, and recomputing ratings is not something
 * to do lightly for the sake of a new objective.
 */
/**
 * The day's puzzle is a rotation rather than a row per date, so every player
 * sees the same challenge on the same day without anyone having to keep a
 * calendar topped up.
 *
 * The slot count is the lowest common multiple of the three cycles below —
 * the day a pairing of format, shape and objective first repeats. Thirteen
 * objectives is not an arbitrary number: twelve or fourteen share a factor
 * with the six presets or the seven formats and collapse the cycle back to
 * 84 and 42 days respectively. Thirteen gives 546, comfortably longer than
 * the year a daily player would otherwise notice going round again.
 *
 * Every objective here must have a case in objectiveMet(); one that does not
 * can never be met.
 */
export const FORMAT_CYCLE = ['T20L', 'ODIWC', 'T20L', 'T20WC', 'T20L', 'TEST', 'ODIWC']
export const PRESET_CYCLE = ['BALANCED', 'CLASSIC_ODI', 'BALANCED', 'PACE_BATTERY', 'BALANCED', 'AR_ARMY']
export const OBJECTIVES = [
  ['SET AND DEFEND', 'Win 4+ matches batting first.'],
  ['CHASE MASTER', 'Win 5+ matches chasing a target.'],
  ['GO UNBEATEN', 'Finish the group stage without a loss.'],
  ['LIFT THE TROPHY', 'Win the final. Nothing else counts.'],
  ['TOP OF THE TABLE', 'Finish the group stage in first place.'],
  ['NO CHOKE', 'Reach the knockouts and lose none of them.'],
  ['PERFECT START', 'Win your first four matches.'],
  ['ON A ROLL', 'Win six matches in a row.'],
  ['COMEBACK', 'Lose a match, then win the next three.'],
  ['CENTURION', 'Have someone score a hundred in an innings.'],
  ['FIVE-FOR', 'Have someone take five wickets in an innings.'],
  ['BOWLED THEM OUT', 'Bowl the opposition all out twice.'],
  ['CRUSHING WIN', 'Win by 50+ runs, or with 8 wickets in hand.'],
]
export const SLOTS = 546 // lcm(7 formats, 6 presets, 13 objectives)
export const challengeRows = Array.from({ length: SLOTS }, (_, slot) => {
  const [title, desc] = OBJECTIVES[slot % OBJECTIVES.length]
  return [
    slot,
    `'${FORMAT_CYCLE[slot % FORMAT_CYCLE.length]}'`,
    `'${PRESET_CYCLE[slot % PRESET_CYCLE.length]}'`,
    `'${title}'`,
    `'${desc}'`,
    'true',
  ]
})

