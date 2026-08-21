import { motion } from 'framer-motion'
import { PitchIcon, TeamCrest } from './icons'
import { PITCH } from '../game/types'
import type { BatLine, BowlLine, MatchResult } from '../game/types'
import { SheetDrawer } from './TeamSheet'

/* ── Shared bits ─────────────────────────────────────────────────────────── */

const TONE = {
  W: { text: 'text-pitch', border: 'border-pitch/40', bg: 'bg-pitch/[0.08]', word: 'WON' },
  L: { text: 'text-leather', border: 'border-leather/40', bg: 'bg-leather/[0.08]', word: 'LOST' },
  D: { text: 'text-gold', border: 'border-gold/40', bg: 'bg-gold/[0.08]', word: 'DRAWN' },
} as const

/**
 * A single result in a list — tapping it opens the full card. Used by the live
 * simulation feed and by the match log on the result screen, so a match reads
 * the same way whether you are watching it or looking back at it.
 */
export function MatchRow({
  match,
  onOpen,
  index,
}: {
  match: MatchResult
  onOpen: () => void
  index?: number
}) {
  const tone = TONE[match.outcome]
  return (
    <motion.button
      initial={index === undefined ? false : { opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-2.5 text-left"
    >
      <TeamCrest teamKey={match.opponentKey} teamName={match.opponent} size={30} />
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border text-[11px] font-black ${tone.border} ${tone.bg} ${tone.text}`}
      >
        {match.outcome}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-[12px] font-bold uppercase tracking-[0.03em] ${
              match.knockout ? 'text-gold' : 'text-cream'
            }`}
          >
            {match.knockout ? match.round : match.opponent}
          </span>
          <span className="tnum shrink-0 text-[9px] font-bold text-moss">
            {match.knockout ? match.opponent : match.round}
          </span>
        </div>
        <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-moss">
          <PitchIcon pitch={match.pitch} size={11} />{' '}
          {/* The margin alone reads identically whether you won or lost it. */}
          <span className={`font-black ${tone.text}`}>{tone.word}</span>{' '}
          {match.outcome === 'D' ? '' : match.margin} · {match.hero.name} {match.hero.line}
        </div>
      </div>
      <div className="tnum shrink-0 text-right text-[10.5px] font-bold text-cream-dim">
        <div>{match.us}</div>
        <div className="text-moss">{match.them}</div>
      </div>
      <span className="shrink-0 text-[11px] text-moss">›</span>
    </motion.button>
  )
}

/* ── Full card ───────────────────────────────────────────────────────────── */

function BattingTable({
  lines,
  extras,
  total,
}: {
  lines: BatLine[]
  extras: number
  total: { runs: number; wickets: number; overs: string }
}) {
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-1 text-[8.5px] font-black uppercase tracking-label text-moss">
        <span className="w-4 shrink-0">#</span>
        <span className="flex-1">batter</span>
        <span className="w-[70px] shrink-0 text-right">how out</span>
        <span className="w-9 shrink-0 text-right">r</span>
        <span className="w-9 shrink-0 text-right">b</span>
        <span className="w-11 shrink-0 text-right">sr</span>
      </div>
      {lines.map((b, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 border-b border-white/[0.03] py-1.5 ${
            b.dnb ? 'opacity-45' : ''
          }`}
        >
          <span className="tnum w-4 shrink-0 text-[9px] font-bold text-moss">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold uppercase tracking-[0.02em] text-cream">
            {b.name}
          </span>
          <span
            className={`w-[70px] shrink-0 truncate text-right text-[9px] font-semibold uppercase tracking-wider ${
              b.dnb ? 'text-moss' : b.out ? 'text-moss' : 'text-pitch'
            }`}
          >
            {b.how}
          </span>
          <span className="tnum w-9 shrink-0 text-right text-[12px] font-black text-cream">
            {b.dnb ? <span className="text-moss">—</span> : b.runs}
            {!b.out && !b.dnb && <span className="text-pitch">*</span>}
          </span>
          <span className="tnum w-9 shrink-0 text-right text-[10px] text-moss">
            {b.dnb ? '—' : b.balls}
          </span>
          <span className="tnum w-11 shrink-0 text-right text-[10px] text-moss">
            {b.dnb || !b.balls ? '—' : Math.round((b.runs / b.balls) * 1000) / 10}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2 py-1.5">
        <span className="flex-1 text-[10px] font-bold uppercase tracking-label text-moss">
          extras
        </span>
        <span className="tnum text-[11px] font-bold text-cream-dim">{extras}</span>
      </div>
      <div className="flex items-center gap-2 border-t border-white/[0.08] pt-1.5">
        <span className="flex-1 text-[10px] font-black uppercase tracking-label text-cream">
          total · {total.overs} ov
        </span>
        <span className="stat-num text-[15px] text-cream">
          {total.runs}/{total.wickets}
        </span>
      </div>
    </div>
  )
}

function BowlingTable({ lines }: { lines: BowlLine[] }) {
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-1 text-[8.5px] font-black uppercase tracking-label text-moss">
        <span className="flex-1">bowler</span>
        <span className="w-9 shrink-0 text-right">o</span>
        <span className="w-9 shrink-0 text-right">r</span>
        <span className="w-9 shrink-0 text-right">w</span>
        <span className="w-11 shrink-0 text-right">econ</span>
      </div>
      {lines.map((b, i) => (
        <div key={i} className="flex items-center gap-2 border-b border-white/[0.03] py-1.5">
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold uppercase tracking-[0.02em] text-cream">
            {b.name}
          </span>
          <span className="tnum w-9 shrink-0 text-right text-[10px] text-moss">{b.overs}</span>
          <span className="tnum w-9 shrink-0 text-right text-[10px] text-moss">{b.runs}</span>
          <span
            className={`tnum w-9 shrink-0 text-right text-[12px] font-black ${
              b.wickets >= 3 ? 'text-pitch' : 'text-cream'
            }`}
          >
            {b.wickets}
          </span>
          <span className="tnum w-11 shrink-0 text-right text-[10px] text-moss">
            {Number(b.overs) ? (Math.round((b.runs / Number(b.overs)) * 100) / 100).toFixed(2) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

/** One complete innings: who batted, who bowled at them, and the total. */
function Innings({
  title,
  subtitle,
  score,
  batting,
  bowling,
  extras,
  accent,
}: {
  title: string
  subtitle: string
  score: { runs: number; wickets: number; overs: string }
  batting: BatLine[]
  bowling: BowlLine[]
  extras: number
  accent: boolean
}) {
  return (
    <div className={`mt-4 rounded-card border p-3 ${accent ? 'border-pitch/25 bg-pitch/[0.04]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="display truncate text-[15px] text-cream">{title}</div>
          <div className="label mt-0.5">{subtitle}</div>
        </div>
        <span className="stat-num shrink-0 text-[22px] text-cream">
          {score.runs}
          <span className="text-[14px] text-moss">/{score.wickets}</span>
        </span>
      </div>
      <BattingTable lines={batting} extras={extras} total={score} />
      <div className="mt-3">
        <span className="label-lg">bowling</span>
        <BowlingTable lines={bowling} />
      </div>
    </div>
  )
}

export function MatchCardView({ match, teamName }: { match: MatchResult; teamName: string }) {
  const tone = TONE[match.outcome]
  const c = match.card

  const ourInnings = {
    title: teamName,
    subtitle: match.battedFirst ? 'first innings' : 'second innings · chasing',
    score: c.ourScore,
    batting: c.batting,
    bowling: c.theirBowling,
    extras: c.ourExtras,
    accent: match.outcome === 'W',
  }
  const theirInnings = {
    title: match.opponent,
    subtitle: match.battedFirst ? 'second innings · chasing' : 'first innings',
    score: c.theirScore,
    batting: c.theirBatting,
    bowling: c.bowling,
    extras: c.theirExtras,
    accent: match.outcome === 'L',
  }
  const order = match.battedFirst ? [ourInnings, theirInnings] : [theirInnings, ourInnings]

  return (
    <div>
      {/* ── Result banner ── */}
      <div className={`rounded-card border px-3.5 py-3 ${tone.border} ${tone.bg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="label">{match.round}</span>
          <span className="text-[10px] font-bold uppercase tracking-label text-gold">
            <PitchIcon pitch={match.pitch} size={12} /> {PITCH[match.pitch].label}
          </span>
        </div>
        <div className={`display mt-1 text-[24px] ${tone.text}`}>
          {tone.word} {match.outcome !== 'D' && match.margin}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-moss">
          <TeamCrest teamKey={match.opponentKey} teamName={match.opponent} size={16} />
          v {match.opponent} · ovr {c.theirRating}
          {match.tossWon !== undefined && ` · toss ${match.tossWon ? 'won' : 'lost'}`}
        </div>
      </div>

      {/* ── Key moments ── */}
      <div className="mt-4">
        <span className="label-lg">how it happened</span>
        <div className="mt-2 space-y-0">
          {c.moments.map((m, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex w-[42px] shrink-0 flex-col items-end">
                <span className="tnum text-[10px] font-black text-moss">{m.over}</span>
              </div>
              <div className="relative flex flex-col items-center">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    m.kind === 'good' ? 'bg-pitch' : m.kind === 'bad' ? 'bg-leather' : 'bg-moss'
                  }`}
                />
                {i < c.moments.length - 1 && <span className="w-px flex-1 bg-white/10" />}
              </div>
              <p className="flex-1 pb-3 text-[11.5px] leading-snug text-cream-dim">{m.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Both innings, in the order they were played ── */}
      <span className="label-lg">full scorecard</span>
      {order.map((inn) => (
        <Innings key={inn.title} {...inn} />
      ))}

      {/* ── Hero ── */}
      <div className="mt-4 flex items-center justify-between rounded-card border border-gold/25 bg-gold/[0.05] px-3.5 py-2.5">
        <div>
          <span className="label">player of the match</span>
          <div className="display mt-0.5 text-[15px] text-cream">{match.hero.name}</div>
        </div>
        <span className="stat-num text-[19px] text-gold">{match.hero.line}</span>
      </div>
    </div>
  )
}

/** The card in a drawer — the single way a match is inspected anywhere. */
export function MatchDrawer({
  match,
  teamName,
  onClose,
}: {
  match: MatchResult | null
  teamName: string
  onClose: () => void
}) {
  return (
    <SheetDrawer
      open={!!match}
      onClose={onClose}
      title={match ? (match.knockout ? match.round : `${match.round} · ${match.opponent}`) : ''}
    >
      {match && <MatchCardView match={match} teamName={teamName} />}
    </SheetDrawer>
  )
}
