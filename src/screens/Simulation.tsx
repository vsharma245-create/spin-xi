import { motion } from 'framer-motion'
import { PitchIcon, TeamCrest } from '../components/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LeagueTable } from '../components/LeagueTable'
import { MatchDrawer, MatchRow } from '../components/MatchView'
import { starsOf } from '../game/opponents'
import { Button } from '../components/ui'
import { favoursBatting, finishRun, ordinal, playKnockout, qualifyCutoff, startRun } from '../game/sim'
import { PITCH, TOURNAMENTS } from '../game/types'
import type { DraftConfig, DraftMode, MatchResult, Slot, TournamentResult } from '../game/types'

const STAGES = ['BUILDING XI', 'ANALYSING BATTING', 'ANALYSING BOWLING', 'READING CONDITIONS']

/**
 * The run, one clearly-labelled step at a time. `standings` and `intro` exist
 * purely so the player is never moved on without being told what just happened
 * and what is about to: the league ends on a table, and every knockout is
 * introduced with the opponent and what is at stake.
 */
type Phase = 'analysis' | 'group' | 'standings' | 'intro' | 'toss' | 'reveal' | 'wrap'

/** Watching pace. 0 plays the rest of the group out at once. */
const SPEEDS = [
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: 'SKIP', value: 0 },
] as const

export default function Simulation({
  slots,
  captainId,
  config,
  mode,
  dailyId,
  rand,
  objective,
  onDone,
}: {
  slots: Slot[]
  captainId: string | null
  config: DraftConfig
  mode: DraftMode
  dailyId: number | null
  rand: () => number
  objective?: { title: string; desc: string }
  onDone: (r: TournamentResult) => void
}) {
  const t = TOURNAMENTS[config.format]
  const teamName = config.teamName || 'YOUR XI'

  // The group stage is played exactly once on mount. `rand` is stateful, so
  // re-running this would consume the sequence and change the result.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useMemo(() => startRun(slots, captainId, rand, config.format, teamName, config.ratingMode, config.worldTeams), [])
  const randRef = useRef(rand)

  const [phase, setPhase] = useState<Phase>('analysis')
  const [stage, setStage] = useState(0)
  const [shown, setShown] = useState(0)
  const [speed, setSpeed] = useState<number>(1)
  const [paused, setPaused] = useState(false)
  const [koShown, setKoShown] = useState<MatchResult[]>([])
  const [call, setCall] = useState<'HEADS' | 'TAILS' | null>(null)
  const [tossWon, setTossWon] = useState<boolean | null>(null)
  const [open, setOpen] = useState<MatchResult | null>(null)

  const koIndex = koShown.length
  const spec = run.rounds[koIndex]

  /* ── analysis lines ── */
  useEffect(() => {
    if (phase !== 'analysis') return
    if (stage >= STAGES.length) {
      setPhase('group')
      return
    }
    const id = window.setTimeout(() => setStage((s) => s + 1), stage === 0 ? 360 : 260)
    return () => window.clearTimeout(id)
  }, [phase, stage])

  /* ── group matches play out one at a time so each can be read ── */
  useEffect(() => {
    if (phase !== 'group') return
    if (shown >= run.group.length) {
      const id = window.setTimeout(() => setPhase('standings'), 600)
      return () => window.clearTimeout(id)
    }
    if (paused) return
    if (speed === 0) {
      setShown(run.group.length)
      return
    }
    const id = window.setTimeout(() => setShown((n) => n + 1), 780 / speed)
    return () => window.clearTimeout(id)
  }, [phase, shown, paused, speed, run.group.length, run.qualified])

  /* ── knockout: resolve and advance ── */
  const resolveKnockout = useCallback(
    (toss: { won: boolean; batFirst: boolean } | null) => {
      const m = playKnockout(run, config.format, randRef.current, toss)
      setKoShown((prev) => [...prev, m])
      setPhase('reveal')
    },
    [run, config.format],
  )

  useEffect(() => {
    if (phase !== 'toss') return
    // Auto-toss when the player has opted out of calling it.
    if (!config.liveToss) {
      const won = randRef.current() < 0.5
      const id = window.setTimeout(
        () => resolveKnockout({ won, batFirst: favoursBatting(spec.pitch) === won }),
        520,
      )
      return () => window.clearTimeout(id)
    }
  }, [phase, config.liveToss, resolveKnockout, spec])

  useEffect(() => {
    if (phase !== 'reveal') return
    const last = koShown[koShown.length - 1]
    const id = window.setTimeout(() => {
      if (last?.outcome === 'L' || koShown.length >= run.rounds.length) setPhase('wrap')
      else {
        setCall(null)
        setTossWon(null)
        setPhase('intro')
      }
    }, 1600)
    return () => window.clearTimeout(id)
  }, [phase, koShown, run.rounds.length])

  const flipToss = (choice: 'HEADS' | 'TAILS') => {
    setCall(choice)
    const won = randRef.current() < 0.5
    window.setTimeout(() => setTossWon(won), 700)
  }

  const played = run.group.slice(0, shown)
  const w = played.filter((m) => m.outcome === 'W').length
  const d = played.filter((m) => m.outcome === 'D').length
  const l = played.filter((m) => m.outcome === 'L').length
  const feed = [...koShown].reverse().concat([...played].reverse())
  const lastKo = koShown[koShown.length - 1]
  const cutoff = qualifyCutoff(config.format)

  return (
    <div className="flex min-h-[74vh] flex-col py-6">
      {/* ── Header ── */}
      <div className="text-center">
        <span className="label">
          {t.name} · {teamName}
        </span>
        <div className="mt-2 h-[46px]">
          <motion.h2
            key={phase === 'analysis' ? (STAGES[stage] ?? 'x') : phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
            className="display text-[23px] text-cream md:text-[30px]"
          >
            {phase === 'analysis'
              ? `${STAGES[Math.min(stage, STAGES.length - 1)]}…`
              : phase === 'group'
                ? `${t.draws ? 'CHAMPIONSHIP' : 'LEAGUE STAGE'} · ${shown}/${run.group.length}`
                : phase === 'standings'
                  ? `${t.draws ? 'CHAMPIONSHIP' : 'LEAGUE STAGE'} COMPLETE`
                  : phase === 'wrap'
                    ? 'TOURNAMENT COMPLETE'
                    : (spec?.round ?? koShown[koShown.length - 1]?.round ?? 'FULL TIME')}
          </motion.h2>
        </div>

        {/* Colour alone does not say which number is which, and a bare
            "7 – 2" is only a scoreline once you already know the convention. */}
        <div className="tnum mt-1 flex items-end justify-center gap-4">
          <div className="flex flex-col items-center">
            <span className="stat-num text-[34px] leading-none text-pitch">{w}</span>
            <span className="mt-1 text-[9.5px] font-black uppercase tracking-[0.14em] text-pitch/70">
              won
            </span>
          </div>
          {t.draws && (
            <div className="flex flex-col items-center">
              <span className="stat-num text-[34px] leading-none text-gold">{d}</span>
              <span className="mt-1 text-[9.5px] font-black uppercase tracking-[0.14em] text-gold/70">
                drawn
              </span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <span className="stat-num text-[34px] leading-none text-leather">{l}</span>
            <span className="mt-1 text-[9.5px] font-black uppercase tracking-[0.14em] text-leather/70">
              lost
            </span>
          </div>
        </div>

        {/* Where that record puts you, updated live — the table is the point. */}
        {shown >= run.group.length && phase !== 'analysis' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1"
          >
            <span className="label">finished</span>
            <span
              className={`text-[12px] font-black ${run.qualified ? 'text-pitch' : 'text-leather'}`}
            >
              {ordinal(run.standing)} of {run.table.length}
            </span>
            <span className="label">
              {run.qualified ? 'through' : `top ${cutoff} go through`}
            </span>
          </motion.div>
        )}
      </div>

      {/* ── Group ticker ── */}
      <div className="mx-auto mt-5 grid w-full max-w-[420px] grid-cols-7 gap-1.5">
        {run.group.map((m, i) => {
          const on = i < shown
          return (
            <motion.button
              key={i}
              initial={false}
              animate={on ? { scale: [0.6, 1.1, 1], opacity: 1 } : { opacity: 0.16 }}
              transition={{ duration: 0.22 }}
              disabled={!on}
              onClick={() => setOpen(m)}
              className={`relative grid h-9 place-items-center rounded-lg border text-[12px] font-black ${
                !on
                  ? 'border-white/[0.07] bg-white/[0.02] text-moss'
                  : m.outcome === 'W'
                    ? 'border-pitch/45 bg-pitch/15 text-pitch'
                    : m.outcome === 'D'
                      ? 'border-gold/40 bg-gold/10 text-gold'
                      : 'border-leather/45 bg-leather/15 text-leather'
              }`}
              title={on ? `${m.round} v ${m.opponent} — tap for the scorecard` : undefined}
            >
              {on ? m.outcome : '·'}
              {on && (
                <span className="absolute -bottom-1 -right-0.5 text-[7px] leading-none">
                  <PitchIcon pitch={m.pitch} size={9} />
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* ── Live line: what just happened ──
          The verdict comes first and in the side's own colours. It used to be
          a grey sentence in which "Won by 19 runs" and "Lost by 19 runs" were
          the same shape, the same weight and four characters apart. */}
      {phase === 'group' && played.length > 0 && (() => {
        const last = played[played.length - 1]
        const won = last.outcome === 'W'
        const drawn = last.outcome === 'D'
        // Written out in full: Tailwind scans the source for class names, so a
        // class assembled at runtime is a class that was never generated.
        const skin = won
          ? { box: 'border-pitch/40 bg-pitch/10', text: 'text-pitch', word: 'WON', mark: 'W' }
          : drawn
            ? { box: 'border-gold/40 bg-gold/10', text: 'text-gold', word: 'DRAWN', mark: 'D' }
            : { box: 'border-leather/45 bg-leather/10', text: 'text-leather', word: 'LOST', mark: 'L' }
        return (
          <motion.div
            key={played.length}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className={`mx-auto mt-3.5 flex w-full max-w-[420px] items-center gap-3 rounded-xl border px-3.5 py-2.5 ${skin.box}`}
          >
            <TeamCrest teamKey={last.opponentKey} teamName={last.opponent} size={30} />
            <div className="min-w-0 flex-1 text-left">
              <div className={`display text-[15px] leading-none ${skin.text}`}>
                {skin.word}
                <span className="ml-1.5 text-[11.5px] font-bold tracking-normal text-cream-dim">
                  {last.outcome === 'D' ? '' : `by ${last.margin}`}
                </span>
              </div>
              <div className="mt-1 truncate text-[10.5px] leading-snug text-moss">
                v {last.opponent} · {last.card.summary.split(' · ').slice(-1)[0]}
              </div>
            </div>
            <span className={`stat-num shrink-0 text-[19px] ${skin.text}`}>{skin.mark}</span>
          </motion.div>
        )
      })()}

      {/* ── Watching controls ── */}
      {phase === 'group' && shown < run.group.length && (
        <div className="mx-auto mt-4 flex w-full max-w-[420px] items-center justify-between gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded-lg border border-white/10 bg-ink-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-label text-cream hover:border-pitch/40"
          >
            {paused ? '▶ resume' : '❚❚ pause'}
          </button>
          <div className="flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  setSpeed(s.value)
                  setPaused(false)
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-label ${
                  speed === s.value && s.value !== 0
                    ? 'border-pitch/50 bg-pitch/15 text-pitch'
                    : 'border-white/10 bg-ink-700 text-moss hover:text-cream'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Stage gates: the league ends on a table, knockouts are introduced ── */}
      <div className="mx-auto mt-5 w-full max-w-[420px]">
        {phase === 'standings' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="label-lg">final table</span>
              <span className="label">
                top {cutoff} {t.draws ? 'reach the final' : 'reach the knockouts'}
              </span>
            </div>
            <LeagueTable rows={run.table} cutoff={cutoff} draws={t.draws} limit={6} />
            <div
              className={`mt-3 rounded-card border px-3.5 py-3 ${
                run.qualified
                  ? 'border-pitch/35 bg-pitch/[0.07]'
                  : 'border-leather/30 bg-leather/[0.06]'
              }`}
            >
              <div className={`display text-[18px] ${run.qualified ? 'text-pitch' : 'text-leather'}`}>
                {run.qualified ? "YOU'RE THROUGH" : 'SEASON OVER'}
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-moss">
                {run.qualified
                  ? `${ordinal(run.standing)} of ${run.table.length} on ${run.points} points. Next up: the ${run.rounds[0]?.round.toLowerCase()} against ${run.rounds[0]?.opponent.name} ${run.rounds[0]?.opponent.season} (OVR ${run.rounds[0]?.opponent.ratings.ovr}).`
                  : `${ordinal(run.standing)} of ${run.table.length} on ${run.points} points — only the top ${cutoff} go through, so there is no knockout cricket to play.`}
              </p>
              <div className="mt-3">
                <Button full onClick={() => setPhase(run.qualified ? 'intro' : 'wrap')}>
                  {run.qualified
                    ? `Play the ${run.rounds[0]?.round.toLowerCase()} →`
                    : 'See the season review →'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'intro' && spec && (
          <motion.div
            key={`intro-${koIndex}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-card border border-gold/30 bg-gold/[0.05] p-4"
          >
            <span className="label">knockout cricket · no second chances</span>
            <div className="display mt-1 text-[26px] text-gold">{spec.round}</div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-extrabold uppercase tracking-[0.03em] text-cream">
                  {spec.opponent.name} {spec.opponent.season}
                </div>
                <div className="label mt-0.5 truncate">
                  {starsOf(spec.opponent).join(' · ')}
                </div>
              </div>
              <span className="stat-num shrink-0 text-[19px] text-cream-dim">
                {spec.opponent.ratings.ovr}
              </span>
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-moss">
              <PitchIcon pitch={spec.pitch} size={13} className="text-willow" />{' '}
              {PITCH[spec.pitch].label} — {PITCH[spec.pitch].note}{' '}
              {koIndex === run.rounds.length - 1
                ? 'Win this and the tournament is yours.'
                : `Win and you play the ${run.rounds[koIndex + 1]?.round.toLowerCase()}.`}
            </p>
            <div className="mt-3">
              <Button full onClick={() => setPhase('toss')}>
                {config.liveToss ? 'Go out for the toss →' : 'Play the match →'}
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Toss ── */}
      <div className="mx-auto mt-3 w-full max-w-[420px]">
        {phase === 'toss' && config.liveToss && spec && (
          <motion.div
            key={`toss-${koIndex}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="pitch-panel p-4"
          >
            <div className="flex items-center justify-between">
              <span className="label">the toss · {spec.round}</span>
              <span className="text-[10px] font-bold uppercase tracking-label text-gold">
                <PitchIcon pitch={spec.pitch} size={12} /> {PITCH[spec.pitch].label}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-moss">{PITCH[spec.pitch].note}</p>

            {tossWon === null ? (
              <div className="mt-4">
                <p className="label-lg mb-2">call it</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['HEADS', 'TAILS'] as const).map((c) => (
                    <motion.button
                      key={c}
                      whileTap={{ scale: 0.96 }}
                      disabled={!!call}
                      onClick={() => flipToss(c)}
                      className={`rounded-xl border py-3 text-[13px] font-extrabold uppercase tracking-label transition-colors ${
                        call === c
                          ? 'border-gold/50 bg-gold/15 text-gold'
                          : call
                            ? 'border-white/[0.06] text-moss/40'
                            : 'border-white/10 bg-ink-700 text-cream hover:border-gold/40'
                      }`}
                    >
                      {c}
                    </motion.button>
                  ))}
                </div>
                {call && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 text-center text-[11px] font-bold uppercase tracking-label text-moss"
                  >
                    coin in the air…
                  </motion.p>
                )}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4"
              >
                <p className={`display text-[19px] ${tossWon ? 'text-pitch' : 'text-leather'}`}>
                  {tossWon ? 'YOU WON THE TOSS' : 'TOSS LOST'}
                </p>
                {tossWon ? (
                  <>
                    <p className="label-lg mb-2 mt-3">your call</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => resolveKnockout({ won: true, batFirst: true })} full>
                        Bat first
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => resolveKnockout({ won: true, batFirst: false })}
                        full
                      >
                        Bowl first
                      </Button>
                    </div>
                    <p className="mt-2 text-[10.5px] leading-snug text-moss">
                      Read the surface right and you take a real edge into the match.
                    </p>
                  </>
                ) : (
                  <div className="mt-3">
                    {/* What they actually did with it. Saying only that they
                        had chosen left the player to work out from the
                        scorecard afterwards whether they were batting. */}
                    <p className="text-[12px] leading-snug text-cream">
                      <span className="font-bold">{spec.opponent.name}</span> won the toss and
                      chose to <span className="font-bold">
                        {favoursBatting(spec.pitch) ? 'bat' : 'bowl'}
                      </span> first.
                    </p>
                    <p className="mt-1 text-[10.5px] leading-snug text-moss">
                      {favoursBatting(spec.pitch)
                        ? 'They fancied the surface and took first use of it.'
                        : 'They read something in the pitch and put you in.'}
                    </p>
                    <Button
                      full
                      className="mt-3"
                      onClick={() =>
                        resolveKnockout({ won: false, batFirst: !favoursBatting(spec.pitch) })
                      }
                    >
                      Play on →
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── What the last knockout means ── */}
        {phase === 'reveal' && lastKo && (
          <motion.div
            key={`reveal-${koShown.length}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-card border px-3.5 py-3 text-center ${
              lastKo.outcome === 'W'
                ? 'border-pitch/40 bg-pitch/[0.08]'
                : 'border-leather/40 bg-leather/[0.08]'
            }`}
          >
            <div
              className={`display text-[20px] ${
                lastKo.outcome === 'W' ? 'text-pitch' : 'text-leather'
              }`}
            >
              {lastKo.outcome === 'W'
                ? koShown.length >= run.rounds.length
                  ? 'YOU WON THE TOURNAMENT'
                  : `THROUGH TO THE ${run.rounds[koShown.length]?.round ?? 'NEXT ROUND'}`
                : `KNOCKED OUT IN THE ${lastKo.round}`}
            </div>
            <p className="mt-1 text-[11px] text-moss">
              {lastKo.outcome === 'W' ? 'Won' : 'Lost'} {lastKo.margin} · {lastKo.hero.name}{' '}
              {lastKo.hero.line}
            </p>
          </motion.div>
        )}

        {/* ── Live feed: every match played so far, newest first ── */}
        {feed.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="label-lg">match feed</span>
              <span className="label">
                <span className="sm:hidden">tap for scorecard</span>
                <span className="hidden sm:inline">tap any match for the scorecard</span>
              </span>
            </div>
            <div className="surface max-h-[300px] divide-y divide-white/[0.05] overflow-y-auto px-3.5">
              {feed.map((m) => (
                <MatchRow key={m.round} match={m} index={0} onOpen={() => setOpen(m)} />
              ))}
            </div>
          </div>
        )}

        {phase === 'wrap' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-4"
          >
            <Button
              size="lg"
              full
              onClick={() =>
                onDone(finishRun(run, slots, captainId, config, mode, dailyId, objective))
              }
            >
              See full result →
            </Button>
          </motion.div>
        )}
      </div>

      <MatchDrawer match={open} teamName={teamName} onClose={() => setOpen(null)} />
    </div>
  )
}
