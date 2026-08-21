import { xiOf } from './draft'
import { ordinal, recordOf } from './sim'
import { PITCH, TOURNAMENTS } from './types'
import type { MatchResult, PitchType, PlayerSeason, TournamentResult } from './types'

/**
 * The season review. Everything here is read back off the scorecards the
 * simulation already produced — no second simulation, no numbers invented after
 * the fact — and turned into the things a player actually wants to know: who
 * carried the side, who went missing, which night was the best one, and what
 * the tournament said about the XI they built.
 */

export interface PlayerStat {
  name: string
  player?: PlayerSeason
  matches: number
  runs: number
  balls: number
  outs: number
  best: number
  fifties: number
  hundreds: number
  wickets: number
  conceded: number
  overs: number
  bestFigures: { wickets: number; runs: number }
  motm: number
  /** Runs plus wickets weighted into one number, for ranking contributions. */
  impact: number
}

export interface Award {
  label: string
  name: string
  detail: string
  note: string
  tone: 'pitch' | 'gold' | 'leather' | 'cream'
}

export interface Review {
  players: PlayerStat[]
  awards: Award[]
  /** The story, in a few readable paragraphs. */
  paragraphs: string[]
  /** Short, scannable facts. */
  notes: string[]
  bestMatch: MatchResult | null
  worstMatch: MatchResult | null
  closest: MatchResult | null
  pitchRecord: { pitch: PitchType; w: number; l: number; d: number }[]
  battingFirst: { w: number; l: number }
  chasing: { w: number; l: number }
  streak: number
  totals: { runs: number; wickets: number; highest: MatchResult | null }
}

/* ── Aggregation ─────────────────────────────────────────────────────────── */

const blank = (name: string): PlayerStat => ({
  name,
  matches: 0,
  runs: 0,
  balls: 0,
  outs: 0,
  best: 0,
  fifties: 0,
  hundreds: 0,
  wickets: 0,
  conceded: 0,
  overs: 0,
  bestFigures: { wickets: 0, runs: 0 },
  motm: 0,
  impact: 0,
})

export const battingAverage = (p: PlayerStat) =>
  p.outs ? Math.round((p.runs / p.outs) * 10) / 10 : p.runs
export const strikeRate = (p: PlayerStat) =>
  p.balls ? Math.round((p.runs / p.balls) * 1000) / 10 : 0
export const economy = (p: PlayerStat) =>
  p.overs ? Math.round((p.conceded / p.overs) * 100) / 100 : 0

function aggregate(result: TournamentResult): PlayerStat[] {
  const xi = xiOf(result.slots)
  const bySurname = new Map(xi.map((p) => [p.surname, p]))
  const stats = new Map<string, PlayerStat>()
  const get = (name: string) => {
    const s = stats.get(name) ?? { ...blank(name), player: bySurname.get(name) }
    stats.set(name, s)
    return s
  }

  for (const m of [...result.matches, ...result.knockouts]) {
    const seen = new Set<string>()
    for (const b of m.card.batting) {
      const s = get(b.name)
      seen.add(b.name)
      s.runs += b.runs
      s.balls += b.balls
      if (b.out) s.outs += 1
      if (b.runs > s.best) s.best = b.runs
      if (b.runs >= 100) s.hundreds += 1
      else if (b.runs >= 50) s.fifties += 1
    }
    for (const b of m.card.bowling) {
      const s = get(b.name)
      seen.add(b.name)
      s.wickets += b.wickets
      s.conceded += b.runs
      s.overs += Number(b.overs) || 0
      const better =
        b.wickets > s.bestFigures.wickets ||
        (b.wickets === s.bestFigures.wickets && b.runs < s.bestFigures.runs)
      if (better) s.bestFigures = { wickets: b.wickets, runs: b.runs }
    }
    get(m.hero.name).motm += 1
    for (const name of seen) get(name).matches += 1
  }

  for (const s of stats.values()) s.impact = s.runs / 10 + s.wickets * 3 + s.motm * 4
  return [...stats.values()].sort((a, b) => b.impact - a.impact)
}

/* ── Phrasing ────────────────────────────────────────────────────────────── */

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const figures = (p: PlayerStat) => `${p.bestFigures.wickets}/${p.bestFigures.runs}`

/** "spin tracks", "neutral decks" — surfaces as they'd be said out loud. */
const surface = (pitch: PitchType) =>
  pitch === 'NEUTRAL' ? 'neutral decks' : `${PITCH[pitch].label.toLowerCase()}s`

/* ── Build ───────────────────────────────────────────────────────────────── */

export function buildReview(result: TournamentResult): Review {
  const t = TOURNAMENTS[result.format]
  const all = [...result.matches, ...result.knockouts]
  const players = aggregate(result)
  const xi = xiOf(result.slots)

  const wins = all.filter((m) => m.outcome === 'W')
  const losses = all.filter((m) => m.outcome === 'L')

  const runsOf = (m: MatchResult) => m.card.ourScore.runs
  const marginRank = (m: MatchResult) => Math.abs(runsOf(m) - m.card.theirScore.runs)

  const bestMatch =
    [...wins].sort(
      (a, b) => Number(b.knockout) * 40 + marginRank(b) - (Number(a.knockout) * 40 + marginRank(a)),
    )[0] ?? null
  const worstMatch = [...losses].sort((a, b) => marginRank(b) - marginRank(a))[0] ?? null
  const closest = [...wins].sort((a, b) => marginRank(a) - marginRank(b))[0] ?? null
  const highest = [...all].sort((a, b) => runsOf(b) - runsOf(a))[0] ?? null

  // Records by surface, and by whether we set a target or chased one.
  const pitchRecord = (Object.keys(PITCH) as PitchType[]).map((pitch) => ({
    pitch,
    w: all.filter((m) => m.pitch === pitch && m.outcome === 'W').length,
    l: all.filter((m) => m.pitch === pitch && m.outcome === 'L').length,
    d: all.filter((m) => m.pitch === pitch && m.outcome === 'D').length,
  }))
  const split = (first: boolean) => ({
    w: all.filter((m) => m.battedFirst === first && m.outcome === 'W').length,
    l: all.filter((m) => m.battedFirst === first && m.outcome === 'L').length,
  })

  let streak = 0
  let running = 0
  for (const m of all) {
    running = m.outcome === 'W' ? running + 1 : 0
    streak = Math.max(streak, running)
  }

  const topScorer = [...players].sort((a, b) => b.runs - a.runs)[0]
  const topWicket = [...players].sort((a, b) => b.wickets - a.wickets)[0]
  const mostAwards = [...players].sort((a, b) => b.motm - a.motm || b.impact - a.impact)[0]
  const bestSpell = [...players].sort(
    (a, b) => b.bestFigures.wickets * 100 - b.bestFigures.runs - (a.bestFigures.wickets * 100 - a.bestFigures.runs),
  )[0]

  // Surprise: the lowest-rated name near the top of the contributions list.
  // Quiet: the highest-rated name near the bottom. Both are read off the same
  // gap between what a card promised and what it actually delivered.
  const rated = players.filter((p) => p.player)
  const byOvr = [...rated].sort((a, b) => b.player!.ovr - a.player!.ovr)
  const rankDelta = (p: PlayerStat) => byOvr.indexOf(p) - rated.indexOf(p)
  const taken = new Set([topScorer?.name, topWicket?.name, mostAwards?.name])
  const surprise = [...rated]
    .filter((p) => !taken.has(p.name))
    .sort((a, b) => rankDelta(b) - rankDelta(a))[0]

  // Only call a player quiet if the numbers really are thin — a big rating
  // finishing fourth in the run charts had a fine tournament, not a bad one.
  const quiet = [...rated]
    .filter(
      (p) =>
        p.player!.ovr >= 84 &&
        p.runs < Math.max(60, (topScorer?.runs ?? 0) * 0.3) &&
        p.wickets < Math.max(4, (topWicket?.wickets ?? 0) * 0.3),
    )
    .sort((a, b) => rankDelta(a) - rankDelta(b))[0]

  const totals = {
    runs: players.reduce((n, p) => n + p.runs, 0),
    wickets: players.reduce((n, p) => n + p.wickets, 0),
    highest,
  }

  /* ── Awards ── */
  const awards: Award[] = []
  if (mostAwards)
    awards.push({
      label: 'player of the tournament',
      name: mostAwards.name,
      detail:
        mostAwards.runs >= mostAwards.wickets * 20
          ? `${mostAwards.runs} runs`
          : `${mostAwards.wickets} wickets`,
      note: `${mostAwards.motm} player-of-the-match award${mostAwards.motm === 1 ? '' : 's'}`,
      tone: 'gold',
    })
  if (topScorer)
    awards.push({
      label: 'leading run-scorer',
      name: topScorer.name,
      detail: `${topScorer.runs} runs`,
      note: `best ${topScorer.best} · SR ${strikeRate(topScorer)} · ${topScorer.fifties + topScorer.hundreds} fifty-plus`,
      tone: 'pitch',
    })
  if (topWicket)
    awards.push({
      label: 'leading wicket-taker',
      name: topWicket.name,
      detail: `${topWicket.wickets} wickets`,
      note: `best ${figures(topWicket)} · econ ${economy(topWicket)}`,
      tone: 'leather',
    })
  if (surprise && surprise.player && surprise.impact > 0)
    awards.push({
      label: 'surprise of the season',
      name: surprise.name,
      detail:
        surprise.runs > surprise.wickets * 20
          ? `${surprise.runs} runs`
          : `${surprise.wickets} wickets`,
      note: `an ${surprise.player.ovr}-rated card that played well above it`,
      tone: 'cream',
    })

  /* ── Paragraphs ── */
  const paragraphs: string[] = []
  const standingWord =
    result.standing === 1 ? 'top of the table' : `${ordinal(result.standing)} in the table`

  paragraphs.push(
    `${result.teamName} finished ${standingWord} with ${recordOf(result)} from ${
      result.matches.length
    } ${t.group === result.matches.length ? 'league games' : 'games'}, ${
      result.qualified ? 'and made the knockouts' : 'and missed the cut'
    }. ${
      result.outcome === 'CHAMPIONS'
        ? result.perfect
          ? 'Nobody laid a glove on them all tournament.'
          : 'They won it.'
        : result.outcome === 'RUNNERS-UP'
          ? 'They went down in the final.'
          : result.qualified
            ? 'The knockout run ended early.'
            : 'There was no knockout cricket to play.'
    }`,
  )

  if (topScorer && topScorer.runs > 0) {
    const support = [...players]
      .filter((p) => p !== topScorer && p.runs >= topScorer.runs * 0.55)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 2)
      .map((p) => `${p.name} (${p.runs})`)
    paragraphs.push(
      `${topScorer.name} was the batting of this side: ${topScorer.runs} runs at ${battingAverage(
        topScorer,
      )}, striking at ${strikeRate(topScorer)}, with a best of ${topScorer.best}${
        topScorer.hundreds ? ` and ${topScorer.hundreds} hundred${topScorer.hundreds === 1 ? '' : 's'}` : ''
      }. ${
        support.length
          ? `${list(support)} gave ${
              topScorer.name.length > 9 ? 'them' : 'the top order'
            } company.`
          : 'Nobody else got near that, which is the worry.'
      }`,
    )
  }

  if (topWicket && topWicket.wickets > 0) {
    // Rank surfaces by win rate over a real sample: a 2–0 on one deck says far
    // less than 5–2 across seven matches, so anything under three games is set
    // aside and what is left is smoothed towards the middle.
    const played = pitchRecord.filter((p) => p.w + p.l + p.d >= 3)
    const rate = (p: (typeof pitchRecord)[number]) => (p.w + 1) / (p.w + p.l + 2)
    const ranked = [...(played.length ? played : pitchRecord)].sort((a, b) => rate(b) - rate(a))
    const bestPitch = ranked[0]
    const worstPitch = ranked[ranked.length - 1]
    paragraphs.push(
      `With the ball, ${topWicket.name} took ${topWicket.wickets} wickets at an economy of ${economy(
        topWicket,
      )}${bestSpell && bestSpell !== topWicket ? `, though the spell of the season was ${bestSpell.name}'s ${figures(bestSpell)}` : `, best of ${figures(topWicket)}`}. The attack was at home ${
        bestPitch.w + bestPitch.l > 0
          ? `on ${surface(bestPitch.pitch)} (${bestPitch.w}–${bestPitch.l})`
          : 'in most conditions'
      }${
        worstPitch !== bestPitch && worstPitch.l > worstPitch.w
          ? ` and found out on ${surface(worstPitch.pitch)} (${worstPitch.w}–${worstPitch.l})`
          : ''
      }.`,
    )
  }

  if (bestMatch) {
    paragraphs.push(
      `The night of the season was ${bestMatch.knockout ? `the ${bestMatch.round.toLowerCase()}` : bestMatch.round} against ${
        bestMatch.opponent
      } — ${bestMatch.card.ourScore.runs}/${bestMatch.card.ourScore.wickets} played ${
        bestMatch.card.theirScore.runs
      }/${bestMatch.card.theirScore.wickets}, won ${bestMatch.margin}, with ${
        bestMatch.hero.name
      } ${bestMatch.hero.line}.${
        worstMatch
          ? ` The one to forget was ${worstMatch.knockout ? `the ${worstMatch.round.toLowerCase()}` : worstMatch.round} against ${worstMatch.opponent}, lost ${worstMatch.margin}.`
          : ''
      }`,
    )
  }

  if (quiet && quiet.player && quiet !== surprise) {
    paragraphs.push(
      `${quiet.name} never got going — a ${quiet.player.ovr}-rated pick who finished with ${
        quiet.runs
      } runs and ${quiet.wickets} wickets. ${
        result.ratingMode === 'PRIME'
          ? 'Even prime cards have quiet tournaments.'
          : 'That is the risk in drafting a season rather than a career.'
      }`,
    )
  }

  /* ── Scannable notes ── */
  const bf = split(true)
  const ch = split(false)
  const notes: string[] = [
    `${totals.runs} runs and ${totals.wickets} wickets across ${all.length} matches`,
    `${bf.w}–${bf.l} batting first · ${ch.w}–${ch.l} chasing`,
    streak > 1 ? `longest winning run: ${streak} matches` : 'never won more than one in a row',
  ]
  if (highest)
    notes.push(
      `highest total: ${highest.card.ourScore.runs}/${highest.card.ourScore.wickets} v ${highest.opponent}`,
    )
  const bigScalp = [...wins].sort((a, b) => b.card.theirRating - a.card.theirRating)[0]
  if (bigScalp)
    notes.push(`best scalp: ${bigScalp.opponent} (OVR ${bigScalp.card.theirRating}), ${bigScalp.margin}`)
  if (closest && closest !== bestMatch)
    notes.push(`tightest win: ${closest.margin} v ${closest.opponent}`)
  const unused = xi.filter((p) => !players.some((s) => s.name === p.surname))
  if (unused.length) notes.push(`never got a go: ${list(unused.map((p) => p.surname))}`)

  return {
    players,
    awards,
    paragraphs,
    notes,
    bestMatch,
    worstMatch,
    closest,
    pitchRecord,
    battingFirst: bf,
    chasing: ch,
    streak,
    totals,
  }
}
