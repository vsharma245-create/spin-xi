import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PitchIcon, TeamCrest } from './icons'
import { Button } from './ui'
import { call, playMatchCard } from '../game/playback'
import type { Bead, Frame, PlayedInnings } from '../game/playback'
import { PITCH } from '../game/types'
import type { Format, MatchResult } from '../game/types'

/**
 * A match, watched rather than reported.
 *
 * The result is already decided before this screen is mounted — it has to be,
 * because the season is simulated as a whole — but a decided result and a
 * finished one are not the same thing to watch. The scorecard is replayed ball
 * by ball off `playback`, so the number on the board climbs, wickets land, and
 * a chase gets tight in the last over the way it did on the card.
 *
 * Nothing here can change the outcome. Everything here is the outcome.
 */

/** How long the whole match should take at 1×, before the player speeds it up. */
const WATCH_MS: Record<Format, number> = {
  T20L: 78_000,
  T20WC: 78_000,
  ODIWC: 88_000,
  TEST: 96_000,
}

/**
 * Test cricket is followed over by over and always has been — two thousand
 * deliveries at a readable pace is half an hour, which is not a thing anybody
 * is going to sit through inside a tournament.
 */
const byOver = (format: Format) => format === 'TEST'

const BEAD: Record<Bead['kind'], string> = {
  dot: 'border-white/10 bg-white/[0.04] text-moss',
  run: 'border-white/15 bg-white/[0.07] text-cream',
  four: 'border-willow/50 bg-willow/15 text-willow-bright',
  six: 'border-willow/70 bg-willow/25 text-willow-bright',
  wicket: 'border-leather/60 bg-leather/25 text-leather',
  extra: 'border-gold/35 bg-gold/10 text-gold',
}

const SPEEDS = [1, 2, 4] as const

export default function LiveMatch({
  match,
  teamName,
  format,
  onDone,
}: {
  match: MatchResult
  teamName: string
  format: Format
  onDone: () => void
}) {
  const innings = useMemo(() => playMatchCard(match, teamName), [match, teamName])
  const total = useMemo(() => innings.reduce((a, i) => a + i.deliveries.length, 0), [innings])

  const [inn, setInn] = useState(0)
  const [at, setAt] = useState(-1)
  const [speed, setSpeed] = useState<number>(1)
  const [paused, setPaused] = useState(false)
  /** The last delivery whose wicket has been shown and cleared. */
  const [seen, setSeen] = useState(-1)
  const [breakAt, setBreakAt] = useState(false)
  const [done, setDone] = useState(false)

  const current = innings[inn]
  const frames = useMemo(() => current?.frames ?? [], [current])
  const frame: Frame | undefined = frames[Math.max(0, at)]
  /**
   * A wicket holds the screen, and the clock, until it has been read.
   *
   * Over by over the clock lands on the sixth ball, so a wicket that fell to
   * the second would go by as a bead and nothing else — in a Test, where a
   * wicket is the whole afternoon. The over is searched rather than the ball.
   */
  const fell: Frame | null = useMemo(() => {
    const here = frames[at]
    if (at < 0 || !here) return null
    if (!byOver(format)) return here.fell ? here : null
    const over = here.delivery.over
    for (let k = at; k >= 0 && frames[k].delivery.over === over; k--) if (frames[k].fell) return frames[k]
    return null
  }, [at, frames, format])
  const struck: Frame | null = fell && seen !== at ? fell : null

  /** Deliveries per tick, and how long a tick lasts. */
  const tick = useMemo(() => {
    const ms = Math.min(560, Math.max(64, WATCH_MS[format] / Math.max(1, total)))
    return byOver(format) ? Math.min(900, ms * 6) : ms
  }, [format, total])

  const advance = useCallback(() => {
    setAt((n) => {
      if (!byOver(format)) return n + 1
      // One over at a time: run on to the last delivery of the next over.
      const from = frames[n + 1]
      if (!from) return n + 1
      let i = n + 1
      while (frames[i + 1] && frames[i + 1].delivery.over === from.delivery.over) i++
      return i
    })
  }, [format, frames])

  /* ── The clock ── */
  useEffect(() => {
    if (done || breakAt || struck || paused) return
    if (at >= frames.length - 1) {
      const id = window.setTimeout(() => {
        if (inn >= innings.length - 1) setDone(true)
        else setBreakAt(true)
      }, 900)
      return () => window.clearTimeout(id)
    }
    const id = window.setTimeout(advance, tick / speed)
    return () => window.clearTimeout(id)
  }, [at, frames.length, paused, speed, tick, struck, breakAt, done, inn, innings.length, advance])

  /* ── A wicket stops play ── */
  useEffect(() => {
    if (!struck) return
    const id = window.setTimeout(() => setSeen(at), 1250 / Math.max(1, speed / 2))
    return () => window.clearTimeout(id)
  }, [struck, at, speed])

  const toBreak = () => {
    setAt(frames.length - 1)
    setSeen(frames.length - 1)
    if (inn >= innings.length - 1) setDone(true)
    else setBreakAt(true)
  }

  const nextInnings = () => {
    setBreakAt(false)
    setInn((n) => n + 1)
    setAt(-1)
    setSeen(-1)
  }

  if (!current) return null

  const chasing = current.target !== null
  const need = chasing ? Math.max(0, current.target! - (frame?.runs ?? 0)) : 0
  const ballsLeft = chasing
    ? Math.max(0, ballsAllowed(current, format) - (frame?.balls ?? 0))
    : 0
  const rrr = chasing && ballsLeft > 0 ? (need / ballsLeft) * 6 : 0
  const progress = Math.min(1, (frame?.balls ?? 0) / Math.max(1, current.balls))

  return (
    <div className="mx-auto w-full max-w-[880px]">
      {/* ── Which match this is ── */}
      <div className="flex items-center justify-between gap-2">
        <span className="label truncate">
          {match.round} · v {match.opponent}
        </span>
        <span className="label shrink-0">
          <PitchIcon pitch={match.pitch} size={11} /> {PITCH[match.pitch].label}
        </span>
      </div>

      {/* ── The board ── */}
      <div className="relative mt-2 overflow-hidden rounded-card border border-white/10 bg-turf-900">
        <AnimatePresence>
          {struck && (
            <motion.div
              key={`w-${struck.runs}-${struck.wickets}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-leather/25 backdrop-blur-[2px]"
            >
              <motion.div
                initial={{ scale: 0.7, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                className="text-center"
              >
                <div className="display text-[38px] leading-none text-leather md:text-[54px]">
                  WICKET
                </div>
                <div className="mt-1.5 text-[12px] font-bold uppercase tracking-label text-cream">
                  {struck.fell!.batter} {struck.fell!.how}
                </div>
                <div className="stat-num mt-1 text-[16px] text-cream-dim">{struck.fell!.score}</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-0 md:grid-cols-[1.35fr_1fr]">
          {/* ── Left: score, crease, over ── */}
          <div className="p-4 md:p-5">
            <div className="flex items-center gap-2">
              <TeamCrest
                teamKey={current.ours ? '' : match.opponentKey}
                teamName={current.battingName}
                size={22}
              />
              <span className="truncate text-[11px] font-black uppercase tracking-label text-cream-dim">
                {current.battingName}
              </span>
              <span className="label ml-auto shrink-0">{current.label}</span>
            </div>

            <div className="tnum mt-2 flex items-end gap-3">
              <motion.span
                key={`${inn}-${frame?.runs ?? 0}`}
                initial={{ scale: 1.14, color: '#F2BC6B' }}
                animate={{ scale: 1, color: '#F4F1E6' }}
                transition={{ duration: 0.26 }}
                className="stat-num text-[46px] leading-none md:text-[62px]"
              >
                {frame?.runs ?? 0}
              </motion.span>
              <span className="stat-num pb-1 text-[26px] leading-none text-cream-dim md:text-[34px]">
                –{frame?.wickets ?? 0}
              </span>
              <span className="stat-num pb-1.5 text-[15px] leading-none text-moss md:text-[18px]">
                ({frame?.overs ?? '0.0'})
              </span>
              <span className="ml-auto pb-1.5 text-right">
                <span className="stat-num block text-[15px] leading-none text-cream-dim md:text-[18px]">
                  {(frame?.rate ?? 0).toFixed(2)}
                </span>
                <span className="label">run rate</span>
              </span>
            </div>

            {/* How far through the innings we are. */}
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              {/* Started without a width of its own, so it took the track's and
                  the first over of every innings played out under a full bar. */}
              <motion.div
                className={`h-full ${chasing ? 'bg-gold' : 'bg-willow'}`}
                initial={{ width: '0%' }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>

            {/* ── The equation ── */}
            {chasing && (
              <div
                className={`mt-3 rounded-xl border px-3 py-2 ${
                  need <= 0
                    ? 'border-pitch/45 bg-pitch/10'
                    : rrr > (frame?.rate ?? 0) + 2.5
                      ? 'border-leather/40 bg-leather/[0.08]'
                      : 'border-gold/35 bg-gold/[0.07]'
                }`}
              >
                {need <= 0 ? (
                  <span className="display text-[15px] text-pitch">TARGET PASSED</span>
                ) : (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px] font-bold text-cream">
                      Need <span className="stat-num text-[16px]">{need}</span> off{' '}
                      <span className="stat-num text-[16px]">{ballsLeft}</span>
                    </span>
                    <span className="text-right">
                      <span className="stat-num block text-[14px] leading-none text-cream-dim">
                        {rrr.toFixed(2)}
                      </span>
                      <span className="label">required</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── At the crease, and who is bowling ── */}
            <div className="mt-3 grid grid-cols-[1.3fr_1fr] gap-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                <span className="label">at the crease</span>
                {[frame?.striker, frame?.nonStriker].map((b, i) => (
                  <div key={i} className="mt-1 flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate text-[11.5px] font-bold uppercase tracking-[0.02em] ${
                        i === 0 ? 'text-cream' : 'text-moss'
                      }`}
                    >
                      {i === 0 && <span className="text-willow">▸ </span>}
                      {b?.name ?? '—'}
                    </span>
                    <span className="stat-num shrink-0 text-[12.5px] text-cream-dim">
                      {b ? `${b.runs} (${b.balls})` : ''}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                <span className="label">bowling</span>
                <div className="mt-1 truncate text-[11.5px] font-bold uppercase tracking-[0.02em] text-cream">
                  {frame?.bowler.name ?? '—'}
                </div>
                <div className="stat-num mt-0.5 text-[12.5px] text-cream-dim">
                  {frame
                    ? `${Math.floor(frame.bowler.balls / 6)}.${frame.bowler.balls % 6}–${frame.bowler.runs}–${frame.bowler.wickets}`
                    : ''}
                </div>
              </div>
            </div>

            {/* ── This over ── */}
            <div className="mt-3">
              <span className="label">this over</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {(frame?.thisOver ?? []).map((b, i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                    className={`grid h-7 min-w-[28px] place-items-center rounded-full border px-1.5 text-[11px] font-black ${BEAD[b.kind]}`}
                  >
                    {b.label}
                  </motion.span>
                ))}
                {!frame?.thisOver.length && <span className="text-[11px] text-moss">—</span>}
              </div>
            </div>

            {/* ── The call ── */}
            <div className="mt-3 min-h-[34px]">
              <AnimatePresence mode="wait">
                {frame && (
                  <motion.p
                    key={at}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`text-[12.5px] leading-snug ${
                      frame.fell
                        ? 'font-bold text-leather'
                        : frame.delivery.batRuns >= 4
                          ? 'font-bold text-willow-bright'
                          : 'text-moss'
                    }`}
                  >
                    {call(frame)}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Right, on a wide screen: the card filling in as it happens ── */}
          <div className="hidden border-l border-white/[0.06] bg-black/20 p-4 md:block">
            <span className="label">batting</span>
            <div className="mt-2 space-y-1">
              {current.batting
                .filter((b) => !b.dnb)
                .map((b, i) => {
                  const live = i === frame?.delivery.striker || i === frame?.delivery.nonStriker
                  const been = (frame?.wickets ?? 0) > i
                  if (!live && !been) return null
                  const runs = been ? b.runs : live && i === frame?.delivery.striker ? frame.striker?.runs : frame?.nonStriker?.runs
                  const balls = been ? b.balls : live && i === frame?.delivery.striker ? frame.striker?.balls : frame?.nonStriker?.balls
                  return (
                    <div key={i} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                      <span className={`truncate ${live ? 'font-bold text-cream' : 'text-moss'}`}>
                        {b.name}
                        {been && <span className="ml-1.5 text-[10px] text-moss">{b.how}</span>}
                      </span>
                      <span className="stat-num shrink-0 text-cream-dim">
                        {runs ?? 0} ({balls ?? 0})
                      </span>
                    </div>
                  )
                })}
            </div>
            <span className="label mt-4 block">bowling</span>
            <div className="mt-2 space-y-1">
              {current.bowling.map((b, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                  <span
                    className={`truncate ${b.name === frame?.bowler.name ? 'font-bold text-cream' : 'text-moss'}`}
                  >
                    {b.name}
                  </span>
                  <span className="stat-num shrink-0 text-cream-dim">
                    {b.name === frame?.bowler.name
                      ? `${Math.floor(frame.bowler.balls / 6)}.${frame.bowler.balls % 6}–${frame.bowler.runs}–${frame.bowler.wickets}`
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Watching controls ── */}
      {!breakAt && !done && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <button
              onClick={() => setPaused((p) => !p)}
              className="rounded-lg border border-white/10 bg-ink-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-label text-cream hover:border-willow/40"
            >
              {paused ? '▶ resume' : '❚❚ pause'}
            </button>
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSpeed(s)
                  setPaused(false)
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-label ${
                  speed === s
                    ? 'border-willow/50 bg-willow/15 text-willow'
                    : 'border-white/10 bg-ink-700 text-moss hover:text-cream'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            onClick={toBreak}
            className="rounded-lg border border-white/10 bg-ink-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-label text-moss hover:text-cream"
          >
            skip innings ⏭
          </button>
        </div>
      )}

      {/* ── Innings break ── */}
      {breakAt && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 rounded-card border border-gold/30 bg-gold/[0.06] p-4"
        >
          <span className="label">innings break</span>
          <div className="display mt-1 text-[20px] text-cream">
            {current.battingName} {current.runs}–{current.wickets}
            <span className="ml-2 text-[13px] text-moss">({current.overs})</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-moss">
            {innings[inn + 1]?.battingName} need{' '}
            <span className="font-bold text-cream">{current.runs + 1}</span> to win
            {format === 'TEST' ? '.' : ` from ${ballsAllowed(innings[inn + 1], format) / 6} overs.`}
          </p>
          <Button full className="mt-3" onClick={nextInnings}>
            Second innings →
          </Button>
        </motion.div>
      )}

      {/* ── Full time ── */}
      {done && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-3 rounded-card border p-4 ${
            match.outcome === 'W'
              ? 'border-pitch/40 bg-pitch/[0.08]'
              : match.outcome === 'D'
                ? 'border-gold/35 bg-gold/[0.06]'
                : 'border-leather/40 bg-leather/[0.08]'
          }`}
        >
          <span className="label">full time</span>
          <div
            className={`display mt-1 text-[24px] md:text-[30px] ${
              match.outcome === 'W'
                ? 'text-pitch'
                : match.outcome === 'D'
                  ? 'text-gold'
                  : 'text-leather'
            }`}
          >
            {match.outcome === 'W' ? 'WON' : match.outcome === 'D' ? 'DRAWN' : 'LOST'}{' '}
            <span className="text-[15px] font-bold tracking-normal text-cream-dim">
              {match.outcome === 'D' ? '' : match.margin}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] text-moss">
            {match.us} v {match.them} · {match.hero.name} {match.hero.line}
          </p>
          <Button full size="lg" className="mt-3" onClick={onDone}>
            Continue →
          </Button>
        </motion.div>
      )}
    </div>
  )
}

/**
 * How many deliveries the side chasing is allowed.
 *
 * A chase that is won ends early, so the innings the card recorded is shorter
 * than the innings they were given — and "needs 12 off 4" would be wrong all
 * the way through if it counted down the balls actually bowled rather than the
 * balls available.
 */
function ballsAllowed(inn: PlayedInnings | undefined, format: Format): number {
  const full = format === 'T20L' || format === 'T20WC' ? 120 : format === 'ODIWC' ? 300 : 0
  if (!full) return inn?.balls ?? 0
  return Math.max(full, inn?.balls ?? 0)
}
