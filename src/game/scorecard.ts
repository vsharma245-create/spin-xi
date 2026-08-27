import { dangerMan } from './opponents'
import type { PlayedInnings, PlayedMatch } from './engine'
import type { BatLine, BowlLine, Format, InningsCard, MatchCard, Opponent, PlayerSeason } from './types'

/**
 * The card, read off the match rather than written to explain it.
 *
 * Every figure here was something that happened. A batter's forty-three off
 * twenty-nine is twenty-nine deliveries he faced and forty-three runs he hit;
 * a bowler's 4-0-22-3 is the four overs he bowled and the three men he got.
 * The old card shared a decided total across the order on a skewed curve and
 * then shared the wickets out on another, so a four-for belonged to nobody in
 * particular and the two cards agreed with the scoreboard only because they
 * were built backwards from it.
 *
 * Nothing needs reconciling now, because there is only one account of the
 * match and this is a reading of it.
 */

const oversOf = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`
const oversFig = (balls: number) => (balls % 6 === 0 ? String(balls / 6) : oversOf(balls))

function battingCard(inn: PlayedInnings): BatLine[] {
  return inn.order.map((p, i) => {
    const b = inn.bat[i]
    if (!b?.came) return { name: p.surname, runs: 0, balls: 0, out: false, how: 'DNB', dnb: true }
    return { name: p.surname, runs: b.runs, balls: b.balls, out: b.out, how: b.how }
  })
}

function bowlingCard(inn: PlayedInnings): BowlLine[] {
  return inn.attack
    .map((p, i) => ({
      name: p.surname,
      overs: oversFig(inn.bowl[i]?.balls ?? 0),
      runs: inn.bowl[i]?.runs ?? 0,
      wickets: inn.bowl[i]?.wickets ?? 0,
    }))
    .filter((l) => l.overs !== '0')
}

const cardOf = (inn: PlayedInnings, label: string): InningsCard => ({
  ours: inn.ours,
  label,
  score: { runs: inn.runs, wickets: inn.wickets, overs: oversOf(inn.balls) },
  batting: battingCard(inn),
  bowling: bowlingCard(inn),
  extras: inn.extras,
})

/* ── The beats a match is remembered by ──────────────────────────────────── */

/**
 * Found in the deliveries rather than written to fit the result.
 *
 * A collapse is three wickets inside twelve balls because three wickets fell
 * inside twelve balls; the over that went for twenty went for twenty. Written
 * in the order they happened, which is the order they mattered.
 */
function momentsOf(match: PlayedMatch): MatchCard['moments'] {
  const out: MatchCard['moments'] = []
  for (const inn of match.innings) {
    const names = inn.order.map((p) => p.surname)
    let fell: number[] = []
    const overRuns = new Map<number, number>()

    for (const d of inn.deliveries) {
      overRuns.set(d.over, (overRuns.get(d.over) ?? 0) + d.runs)
      if (d.wicket) fell.push(d.over * 6 + (d.over === 0 ? 0 : 0))
    }

    // Three down in two overs is a collapse whoever it happened to.
    fell = []
    let ballAt = 0
    const falls: number[] = []
    for (const d of inn.deliveries) {
      if (d.legal) ballAt++
      if (d.wicket) falls.push(ballAt)
    }
    for (let i = 2; i < falls.length; i++) {
      if (falls[i] - falls[i - 2] <= 14) {
        out.push({
          over: oversOf(falls[i]),
          text: `${inn.ours ? 'Three down' : 'Three of theirs down'} in a dozen balls.`,
          kind: inn.ours ? 'bad' : 'good',
        })
        break
      }
    }

    // The best innings of the side, where it was worth remarking on.
    let bestBat = -1
    inn.bat.forEach((b, i) => {
      if (b.came && (bestBat < 0 || b.runs > inn.bat[bestBat].runs)) bestBat = i
    })
    const top = bestBat >= 0 ? inn.bat[bestBat] : null
    if (top && top.runs >= 45) {
      out.push({
        over: oversOf(inn.balls),
        text: `${names[bestBat]} ${top.runs}${top.out ? '' : ' not out'} off ${top.balls}.`,
        kind: inn.ours ? 'good' : 'bad',
      })
    }

    // The over that got away.
    let worst = -1
    let worstRuns = 0
    for (const [over, runs] of overRuns) if (runs > worstRuns) [worst, worstRuns] = [over, runs]
    if (worstRuns >= 20) {
      out.push({
        over: `${worst + 1}`,
        text: `${worstRuns} off the ${worst + 1}${worst === 0 ? 'st' : worst === 1 ? 'nd' : worst === 2 ? 'rd' : 'th'} over.`,
        kind: inn.ours ? 'good' : 'bad',
      })
    }

    // The best figures against them.
    let bestBowl = -1
    inn.bowl.forEach((b, i) => {
      if (bestBowl < 0 || b.wickets > inn.bowl[bestBowl].wickets) bestBowl = i
    })
    const spell = bestBowl >= 0 ? inn.bowl[bestBowl] : null
    if (spell && spell.wickets >= 3) {
      out.push({
        over: oversOf(inn.balls),
        text: `${inn.attack[bestBowl].surname} ${spell.wickets} for ${spell.runs}.`,
        kind: inn.ours ? 'bad' : 'good',
      })
    }
  }
  return out.slice(0, 6)
}

/* ── The best thing anybody did ──────────────────────────────────────────── */

function heroOf(match: PlayedMatch): { name: string; line: string } {
  let best: { name: string; line: string; worth: number } | null = null
  const keep = (name: string, line: string, worth: number) => {
    if (!best || worth > best.worth) best = { name, line, worth }
  }
  for (const inn of match.innings) {
    inn.bat.forEach((b, i) => {
      if (b.came && b.balls > 0) {
        keep(inn.order[i].surname, `${b.runs}${b.out ? '' : '*'} off ${b.balls}`, b.runs * 1.05)
      }
    })
    inn.bowl.forEach((b, i) => {
      if (b.balls > 0 && b.wickets > 0) {
        keep(inn.attack[i].surname, `${b.wickets}/${b.runs}`, b.wickets * 24 - b.runs * 0.2)
      }
    })
  }
  return best ?? { name: '—', line: '' }
}

/* ── Spectacle ───────────────────────────────────────────────────────────── */

/**
 * The two things a crowd talks about on the way home and a scorecard never
 * records. Neither is in the ball-by-ball data and neither could be, but the
 * match is a simulation and these belong to the same fiction as the runs —
 * drawn from the players who actually did it.
 */
function spectacleOf(match: PlayedMatch, rand: () => number): MatchCard['spectacle'] {
  let sixes: { who: string; hit: number } | null = null
  let quick: { who: string; pace: number } | null = null
  for (const inn of match.innings) {
    for (const d of inn.deliveries) {
      if (d.batRuns === 6) {
        const p = inn.order[d.striker]
        const metres = 74 + (p.bat / 100) * 26 + rand() * 12
        if (!sixes || metres > sixes.hit) sixes = { who: p.surname, hit: metres }
      }
    }
    for (let i = 0; i < inn.attack.length; i++) {
      const p = inn.attack[i]
      if (p.role !== 'PACE' || (inn.bowl[i]?.balls ?? 0) === 0) continue
      const kph = 128 + (p.bowl / 100) * 22 + rand() * 5
      if (!quick || kph > quick.pace) quick = { who: p.surname, pace: kph }
    }
  }
  return {
    six: sixes ? { who: sixes.who, metres: Math.round(sixes.hit) } : null,
    fastest: quick ? { who: quick.who, kph: Math.round(quick.pace) } : null,
  }
}

/* ── The card ────────────────────────────────────────────────────────────── */

export function cardFrom(
  match: PlayedMatch,
  opponent: Opponent,
  format: Format,
  rand: () => number,
): { card: MatchCard; hero: { name: string; line: string } } {
  const ours = match.innings.filter((i) => i.ours)
  const theirs = match.innings.filter((i) => !i.ours)
  const hero = heroOf(match)
  const theirBest: PlayerSeason | undefined = dangerMan(opponent)

  // Their danger man's actual figures, where he had any.
  let theirBestLine = theirBest?.surname ?? opponent.short
  for (const inn of theirs) {
    inn.order.forEach((p, i) => {
      if (theirBest && p.id === theirBest.id && inn.bat[i]?.came) {
        theirBestLine = `${p.surname} ${inn.bat[i].runs}`
      }
    })
  }

  const first = ours[0]
  const firstTheirs = theirs[0]

  const card: MatchCard = {
    balls: match.innings,
    innings:
      format === 'TEST'
        ? match.innings.map((i, k) => cardOf(i, k < 2 ? 'First innings' : 'Second innings'))
        : undefined,
    /*
     * The first innings, not the match aggregate.
     *
     * `batting` below is one innings and `ourScore` has to be the score it
     * produced, or a Test reads as ten men out with twenty wickets down. The
     * other innings of a Test live in `innings`, and the match aggregate is on
     * the result as "314 & 288".
     */
    ourScore: first
      ? { runs: first.runs, wickets: first.wickets, overs: oversOf(first.balls) }
      : { runs: 0, wickets: 0, overs: '0.0' },
    theirScore: firstTheirs
      ? { runs: firstTheirs.runs, wickets: firstTheirs.wickets, overs: oversOf(firstTheirs.balls) }
      : { runs: 0, wickets: 0, overs: '0.0' },
    batting: first ? battingCard(first) : [],
    // `bowling` is our attack in their innings; `theirBowling` is theirs in ours.
    bowling: firstTheirs ? bowlingCard(firstTheirs) : [],
    theirBatting: firstTheirs ? battingCard(firstTheirs) : [],
    theirBowling: first ? bowlingCard(first) : [],
    // The first innings' extras, for the same reason as the score above.
    ourExtras: first?.extras ?? 0,
    theirExtras: firstTheirs?.extras ?? 0,
    rain: match.rain,
    moments: match.rain
      ? [{ over: '—', text: match.rain.said, kind: 'neutral' as const }, ...momentsOf(match)]
      : momentsOf(match),
    summary:
      match.outcome === 'D'
        ? `Drawn · ${hero.name} ${hero.line}`
        : `${match.outcome === 'W' ? 'Won' : 'Lost'} ${match.margin} · ${hero.name} ${hero.line}`,
    spectacle: spectacleOf(match, rand),
    theirBest: theirBestLine,
    theirRating: opponent.ratings.ovr,
    theirSquad: `${opponent.short} ${opponent.season}`,
  }

  return { card, hero }
}
