import { motion } from 'framer-motion'
import { PitchIcon } from './icons'
import { battingAverage, economy, strikeRate } from '../game/review'
import type { Review } from '../game/review'
import { PITCH } from '../game/types'
import type { MatchResult, TournamentResult } from '../game/types'
import { SectionLabel } from './ui'

/**
 * The end-of-tournament read: what happened, who did it, and what it says about
 * the XI. Written as prose first — the table underneath is for people who want
 * to check the working.
 */

const TONE = {
  pitch: 'text-pitch',
  gold: 'text-gold',
  leather: 'text-leather',
  cream: 'text-cream',
} as const

export function SeasonReview({
  review,
  result,
  onOpenMatch,
}: {
  review: Review
  result: TournamentResult
  onOpenMatch: (m: MatchResult) => void
}) {
  const top = review.players.filter((p) => p.runs > 0 || p.wickets > 0)

  return (
    <div className="mt-9">
      <SectionLabel right={<span className="label">{result.teamName}</span>}>
        the story of the season
      </SectionLabel>

      {/* ── Prose ── */}
      <div className="surface px-4 py-4">
        {review.paragraphs.map((para, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i }}
            className={`text-[13px] leading-relaxed text-cream-dim ${i ? 'mt-3' : ''} ${
              i === 0 ? 'font-editorial text-[15px] italic text-cream' : ''
            }`}
          >
            {para}
          </motion.p>
        ))}
      </div>

      {/* ── Awards ── */}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {review.awards.map((a) => (
          <div key={a.label} className="surface px-3.5 py-3">
            <span className="label">{a.label}</span>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="display truncate text-[18px] text-cream">{a.name}</span>
              <span className={`stat-num shrink-0 text-[17px] ${TONE[a.tone]}`}>{a.detail}</span>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-snug text-moss">{a.note}</p>
          </div>
        ))}
      </div>

      {/* ── Match of the season ── */}
      {review.bestMatch && (
        <button
          onClick={() => onOpenMatch(review.bestMatch!)}
          className="mt-3 flex w-full items-center gap-3 rounded-card border border-gold/25 bg-gold/[0.05] px-3.5 py-3 text-left hover:border-gold/45"
        >
          <span className="text-[18px]">★</span>
          <div className="min-w-0 flex-1">
            <span className="label">match of the season</span>
            <div className="display truncate text-[15px] text-cream">
              v {review.bestMatch.opponent}
            </div>
            <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-moss">
              <PitchIcon pitch={review.bestMatch.pitch} size={11} /> {review.bestMatch.margin} ·{' '}
              {review.bestMatch.hero.name} {review.bestMatch.hero.line}
            </div>
          </div>
          <span className="shrink-0 text-[11px] text-gold">open ›</span>
        </button>
      )}

      {/* ── Notes ── */}
      <div className="mt-3 grid gap-1.5 md:grid-cols-2">
        {review.notes.map((n) => (
          <div key={n} className="flex items-start gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-pitch" />
            <span className="text-[11.5px] leading-snug text-cream-dim">{n}</span>
          </div>
        ))}
      </div>

      {/* ── Conditions record ── */}
      <div className="mt-6">
        <SectionLabel right={<span className="label">won–lost on each surface</span>}>
          record by pitch
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {review.pitchRecord.map((p) => {
            const played = p.w + p.l + p.d
            return (
              <div key={p.pitch} className="surface px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <PitchIcon pitch={p.pitch} size={15} className="text-cream-dim" />
                  <span
                    className={`stat-num text-[17px] ${
                      played === 0 ? 'text-moss' : p.w > p.l ? 'text-pitch' : p.w < p.l ? 'text-leather' : 'text-cream'
                    }`}
                  >
                    {played === 0 ? '—' : `${p.w}W ${p.d ? `${p.d}D ` : ''}${p.l}L`}
                  </span>
                </div>
                <div className="label mt-1 truncate">{PITCH[p.pitch].label}</div>
                <div className="mt-0.5 text-[9.5px] text-moss">
                  {played === 0 ? 'never played on one' : `${played} match${played === 1 ? '' : 'es'}`}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Full squad numbers ── */}
      <div className="mt-6">
        <SectionLabel right={<span className="label">every player, every match</span>}>
          squad performance
        </SectionLabel>
        <div className="surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3.5 py-2 text-[9px] font-black uppercase tracking-label text-moss">
            <span className="flex-1">player</span>
            <span className="w-10 text-right">runs</span>
            <span className="w-10 text-right">avg</span>
            <span className="w-11 text-right">sr</span>
            <span className="w-8 text-right">wkt</span>
            <span className="w-11 text-right">econ</span>
          </div>
          {top.map((p) => (
            <div key={p.name} className="flex items-center gap-2 px-3.5 py-2">
              <span className="min-w-0 flex-1">
                <span className="truncate text-[11.5px] font-bold uppercase tracking-[0.02em] text-cream">
                  {p.name}
                </span>
                {p.motm > 0 && (
                  <span className="ml-1.5 text-[8.5px] font-black uppercase tracking-label text-gold">
                    ★{p.motm}
                  </span>
                )}
                {p.player && (
                  <span className="ml-1.5 text-[8.5px] font-bold text-moss">{p.player.ovr}</span>
                )}
              </span>
              <span className="tnum w-10 text-right text-[11.5px] font-black text-cream">
                {p.runs || '—'}
              </span>
              <span className="tnum w-10 text-right text-[10.5px] text-moss">
                {p.runs ? battingAverage(p) : '—'}
              </span>
              <span className="tnum w-11 text-right text-[10.5px] text-moss">
                {p.balls ? strikeRate(p) : '—'}
              </span>
              <span
                className={`tnum w-8 text-right text-[11.5px] font-black ${
                  p.wickets ? 'text-leather' : 'text-moss'
                }`}
              >
                {p.wickets || '—'}
              </span>
              <span className="tnum w-11 text-right text-[10.5px] text-moss">
                {p.overs ? economy(p) : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
