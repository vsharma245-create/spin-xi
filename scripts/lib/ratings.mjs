/**
 * What a player-season is worth, and how hard it was to be worth it.
 *
 * The first version of this ranked every player-season against every other in
 * its format and called the percentile a rating. That is self-calibrating and
 * wrong in two ways that players noticed straight away.
 *
 * It treated every competition as equal. A hundred against Bermuda counted
 * like a hundred in the IPL, because standardOf() returned 1 for everything
 * that was not an international. So John Davison, five Canadian seasons, came
 * out at 95 — above Tendulkar, Dravid, Ponting, Kallis and Sehwag, all of whom
 * sat at 91. The fix is not a hand-written table of league rankings, which
 * would be somebody's opinion baked into the data. Competitions are graded
 * from the cricket itself: a league is as strong as what its players do
 * everywhere else, which is measurable because the same people play in
 * several.
 *
 * And a percentile cannot express distance. Rank says a player is better than
 * 85% of the field; it cannot say whether by a little or a lot, so the great
 * and the merely good landed a point apart and 669 players sat at 90 or above.
 * Ratings are now standard deviations from the mean, which keeps the 90s for
 * players who are genuinely far out and lets the rest spread properly.
 */

/* ── The two-way model ───────────────────────────────────────────────────
 *
 * A performance is read as the player's own level times how freely runs and
 * wickets come in that competition:
 *
 *   log impact(season) = log ability(player) + log ease(competition)
 *
 * Both sides are unknown, so they are solved for together by alternating: hold
 * the competitions still and average each player against them, hold the
 * players still and average each competition against them. Players who appear
 * in more than one competition are what ties the whole thing together, and
 * there are plenty — internationals play league cricket.
 *
 * Batting and bowling get their own ease, because a flat league is not
 * automatically a league where wickets are cheap.
 */

const wmean = (pairs) => {
  let num = 0
  let den = 0
  for (const [value, weight] of pairs) {
    if (!Number.isFinite(value) || weight <= 0) continue
    num += value * weight
    den += weight
  }
  return den > 0 ? num / den : 0
}

/**
 * Grades every competition against every other, from players who played in
 * several. Returns ease per competition: above one means runs and wickets came
 * more freely there than the game as a whole.
 */
export function competitionEase(seasons, impactOf, { rounds = 14, prior = 60 } = {}) {
  const rows = []
  for (const s of seasons) {
    const impact = impactOf(s)
    // Weight by matches: a two-match season should barely move a competition.
    if (impact === null || !(impact > 0) || !(s.stats.matches > 0)) continue
    const std = s.stats.matches ? s.stats.oppStrength / s.stats.matches : 1
    rows.push({
      player: s.id,
      comp: s.comp,
      log: Math.log(impact),
      logStd: Math.log(std > 0 ? std : 1),
      weight: s.stats.matches,
    })
  }

  const ease = new Map()
  const ability = new Map()
  for (const r of rows) ease.set(r.comp, 0)
  /*
   * How much harder a stronger opponent actually makes it.
   *
   * The ball-by-ball pass already discounts a match by who it was against, but
   * that discount was picked rather than measured, and it was too shallow:
   * fourteen wickets in eight matches against Bermuda's neighbours still came
   * out in the high eighties. Rather than bucket the opposition into tiers —
   * which put a player's two near-identical seasons either side of a boundary
   * and corrected one and not the other — the exponent on opponent strength is
   * fitted alongside everything else. Players who appear in both associate
   * international cricket and league cricket are what pin it down; a
   * competition where everyone faces the same standard says nothing about it
   * and contributes nothing, which is as it should be.
   */
  let beta = 0

  for (let round = 0; round < rounds; round++) {
    const byPlayer = new Map()
    for (const r of rows) {
      if (!byPlayer.has(r.player)) byPlayer.set(r.player, [])
      byPlayer.get(r.player).push([r.log - ease.get(r.comp), r.weight])
    }
    for (const [player, pairs] of byPlayer) ability.set(player, wmean(pairs))

    const byComp = new Map()
    for (const r of rows) {
      if (!byComp.has(r.comp)) byComp.set(r.comp, [])
      byComp.get(r.comp).push([r.log - ability.get(r.player), r.weight])
    }
    /*
     * A competition with barely any cricket in it should not be free to say
     * anything it likes. Tests against the weakest opposition is eleven
     * player-seasons in the whole archive, and unshrunk it came back claiming
     * runs were fifty times harder to come by there. Each estimate is pulled
     * toward "no different from the rest" in proportion to how little is
     * behind it.
     */
    for (const [comp, pairs] of byComp) {
      const seen = pairs.reduce((n, [, w]) => n + w, 0)
      ease.set(comp, wmean(pairs) * (seen / (seen + prior)))
    }

    // The slope of what is left against opponent strength, by weighted least
    // squares through the origin.
    let num = 0
    let den = 0
    for (const r of rows) {
      if (!r.logStd) continue
      const resid = r.log - ability.get(r.player) - ease.get(r.comp)
      num += r.weight * r.logStd * resid
      den += r.weight * r.logStd * r.logStd
    }
    if (den > 0) beta = num / den

    const centre = wmean(rows.map((r) => [ease.get(r.comp), r.weight]))
    for (const [comp, v] of ease) ease.set(comp, v - centre)
  }

  const out = new Map()
  for (const [comp, v] of ease) out.set(comp, Math.exp(v))
  return { ease: out, beta }
}

/* ── Ratings ─────────────────────────────────────────────────────────────
 *
 * Standard deviations from the mean rather than rank, so that distance
 * survives. The constants place an ordinary first-class season near the
 * middle of the scale and leave the top decade of it to players who are
 * genuinely far from everyone else.
 */
/*
 * Where the middle sits and how far a standard deviation carries. Chosen so an
 * ordinary professional season lands in the sixties, a very good one in the
 * eighties, and the nineties are left to players two standard deviations out
 * or better — which across the whole archive is a few hundred seasons rather
 * than a few thousand.
 */
const CENTRE = 70
const SPREAD = 12

export function zScaler(values) {
  const usable = values.filter((v) => Number.isFinite(v) && v > 0).map(Math.log)
  if (!usable.length) return () => null
  const mean = usable.reduce((a, b) => a + b, 0) / usable.length
  const sd = Math.sqrt(usable.reduce((a, b) => a + (b - mean) ** 2, 0) / usable.length) || 1
  return (v) => {
    if (!Number.isFinite(v) || v <= 0) return null
    const z = (Math.log(v) - mean) / sd
    return Math.max(40, Math.min(99, Math.round(CENTRE + SPREAD * z)))
  }
}

/**
 * Pulls a short season toward the average of its format.
 *
 * Measured in matches rather than deliveries, because impact is a per-match
 * rate: it is a short season that inflates it, not a short spell. K is close
 * to half a league season, so a player with a full one behind them is judged
 * mostly on themselves and a player with two matches is judged mostly on the
 * field.
 */
export const regress = (rate, matches, mean, k) => (rate * matches + mean * k) / (matches + k)

/**
 * How much a season is worth believing, in units of matches.
 *
 * Two separate things make a record thin, and both belong here rather than in
 * what the record is worth. A short season is thin because there is not much
 * of it. A season against weak opposition in an easy competition is thin
 * because nothing in it was tested — and that is the case the two-way model
 * above cannot reach, since a player who never leaves that cricket has no one
 * to be compared with.
 *
 * Discounting the value alone did not fix it: fourteen wickets in eight
 * matches is still a lot of wickets after a 40% haircut, and Bermuda's bowlers
 * stayed in the high eighties. Discounting the evidence does fix it, because
 * eight matches of untested cricket is closer to three matches' worth of
 * knowing, and three matches is not enough to be rated above Tendulkar on.
 *
 * Squared, because the two effects compound: the opposition was weaker and the
 * competition was easier, and a record can be thin for both reasons at once.
 */
export const evidence = (s, ease = 1) =>
  s.matches * standard(s) ** 2 / Math.max(0.5, ease)

export const SHRINK_K = { T20L: 7, T20WC: 6, ODIWC: 6, TEST: 5 }

/* ── Impact ──────────────────────────────────────────────────────────────
 *
 * Runs per innings and wickets per match, each tilted by how quickly the runs
 * came or how little they cost, then divided by how freely that competition
 * gave them up. The division is the whole point: it is what stops a season
 * against weak opposition reading like a season against the best.
 */

/** Average standard of the sides a player-season was played against. */
export const standard = (s) => (s.matches ? s.oppStrength / s.matches : 1)

export function battingImpact(s, prior, ease = 1) {
  if (s.balls < 10) return null
  const perInnings = s.runs / Math.max(1, s.matches)
  const sr = (100 * s.runs) / s.balls
  const raw = (perInnings * (sr / prior.sr) * standard(s)) / (ease || 1)
  return regress(raw, evidence(s, ease), prior.impact, prior.k)
}

export function bowlingImpact(s, prior, ease = 1) {
  if (s.bowlBalls < 30) return null
  const perMatch = s.wickets / Math.max(1, s.matches)
  const econ = (6 * s.bowlRuns) / s.bowlBalls
  const raw = (perMatch * (prior.econ / Math.max(2, econ)) * standard(s)) / (ease || 1)
  return regress(raw, evidence(s, ease), prior.impact, prior.k)
}
