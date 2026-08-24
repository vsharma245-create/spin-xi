/**
 * The season's best individual performances, read back off the scorecards.
 *
 * A season that ends in a table and a points total says how the side did and
 * nothing about who did it. These are the lines a player actually remembers —
 * the hundred, the five-for, the innings that won a match on its own — and
 * they are already sitting in the match cards; nothing new is simulated here.
 *
 * The biggest hit and the fastest ball are here too, and they are simulated
 * rather than recorded — Cricsheet says a six was hit, not where it landed.
 * That is the same standing as everything else on this page: the matches never
 * happened, so every run and wicket beside them is invented as well. What
 * would not be allowed is a fabricated figure attached to a real career, and
 * none of these are.
 */
import type { BatLine, BowlLine, MatchResult } from './types'

export interface Record_ {
  label: string
  who: string
  figure: string
  detail: string
}

const ballsOf = (overs: string) => {
  const [o, b] = overs.split('.')
  return Number(o) * 6 + Number(b ?? 0)
}

/** Every innings on the card, whichever shape the match was stored in. */
function ourInnings(match: MatchResult): { batting: BatLine[]; bowling: BowlLine[] }[] {
  const card = match.card
  if (!card) return []
  if (card.innings?.length) {
    return card.innings.map((inn) =>
      // Our batters appear in the innings we batted; our bowlers in the ones
      // we did not.
      inn.ours
        ? { batting: inn.batting, bowling: [] }
        : { batting: [], bowling: inn.bowling },
    )
  }
  return [{ batting: card.batting, bowling: card.bowling }]
}

export function seasonRecords(matches: MatchResult[]): Record_[] {
  let topScore: { line: BatLine; against: string } | null = null
  let bestFigures: { line: BowlLine; against: string } | null = null
  let bestStrike: { line: BatLine; against: string } | null = null
  let bestEconomy: { line: BowlLine; against: string } | null = null
  let biggestHit: { who: string; metres: number; against: string } | null = null
  let quickest: { who: string; kph: number; against: string } | null = null

  for (const match of matches) {
    const against = match.opponent
    const sp = match.card?.spectacle
    if (sp?.six && (!biggestHit || sp.six.metres > biggestHit.metres)) {
      biggestHit = { ...sp.six, against }
    }
    if (sp?.fastest && (!quickest || sp.fastest.kph > quickest.kph)) {
      quickest = { ...sp.fastest, against }
    }
    for (const inn of ourInnings(match)) {
      for (const line of inn.batting) {
        if (line.dnb) continue
        if (!topScore || line.runs > topScore.line.runs) topScore = { line, against }
        // A strike rate off four balls is not a strike rate.
        if (line.balls >= 15) {
          const rate = (r: BatLine) => r.runs / r.balls
          if (!bestStrike || rate(line) > rate(bestStrike.line)) bestStrike = { line, against }
        }
      }
      for (const line of inn.bowling) {
        const better =
          !bestFigures ||
          line.wickets > bestFigures.line.wickets ||
          (line.wickets === bestFigures.line.wickets && line.runs < bestFigures.line.runs)
        if (better) bestFigures = { line, against }
        if (ballsOf(line.overs) >= 18) {
          const econ = (b: BowlLine) => b.runs / Math.max(1, ballsOf(b.overs) / 6)
          if (!bestEconomy || econ(line) < econ(bestEconomy.line)) bestEconomy = { line, against }
        }
      }
    }
  }

  const out: Record_[] = []
  if (topScore)
    out.push({
      label: 'highest score',
      who: topScore.line.name,
      figure: `${topScore.line.runs}${topScore.line.out ? '' : '*'}`,
      detail: `${topScore.line.balls} balls · v ${topScore.against}`,
    })
  if (bestFigures)
    out.push({
      label: 'best figures',
      who: bestFigures.line.name,
      figure: `${bestFigures.line.wickets}/${bestFigures.line.runs}`,
      detail: `${bestFigures.line.overs} overs · v ${bestFigures.against}`,
    })
  if (bestStrike)
    out.push({
      label: 'best strike rate',
      who: bestStrike.line.name,
      figure: String(Math.round((100 * bestStrike.line.runs) / bestStrike.line.balls)),
      detail: `${bestStrike.line.runs} off ${bestStrike.line.balls} · v ${bestStrike.against}`,
    })
  if (bestEconomy)
    out.push({
      label: 'most economical',
      who: bestEconomy.line.name,
      figure: (bestEconomy.line.runs / Math.max(1, ballsOf(bestEconomy.line.overs) / 6)).toFixed(2),
      detail: `${bestEconomy.line.overs}-${bestEconomy.line.runs} · v ${bestEconomy.against}`,
    })
  if (biggestHit)
    out.push({
      label: 'biggest hit',
      who: biggestHit.who,
      figure: `${biggestHit.metres}m`,
      detail: `v ${biggestHit.against}`,
    })
  if (quickest)
    out.push({
      label: 'fastest ball',
      who: quickest.who,
      figure: `${quickest.kph}`,
      detail: `kph · v ${quickest.against}`,
    })
  return out
}
