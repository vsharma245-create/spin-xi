import { TeamCrest } from '../components/icons'
import { ERA_LABEL } from '../data/squads'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PlayerCard } from '../components/PlayerCard'
import { ROLE_STYLE } from '../components/roles'
import { SpinDial, SpinReel } from '../components/SpinReel'
import { RoleTally, SheetDrawer, TeamSheetList, XIRail } from '../components/TeamSheet'
import { AbandonDraft } from '../components/AbandonDraft'
import { Button, Pill, ProgressBar } from '../components/ui'
import { todaysChallenge } from '../data/challenges'
import {
  canPlace,
  drawFromSequence,
  drawSquad,
  feasibility,
  filledCount,
  hashOf,
  restartsLeft,
  isComplete,
  makeRng,
  openSlotsFor,
  place,
  poolFor,
  presetById,
  rulesFor,
  squadHasPlaceable,
  overseasCount,
} from '../game/draft'
import { TOURNAMENTS, XI_SIZE } from '../game/types'
import type { DraftConfig, DraftState, PlayerSeason, Squad } from '../game/types'
import { OVERSEAS_LIMIT } from '../data/nations'

type Phase = 'idle' | 'spinning' | 'revealed'

/** Must match the reel's spin duration in SpinReel. */
const SPIN_MS = 1800

export default function DraftBoard({
  state,
  setState,
  onComplete,
  onQuit,
  onRestart,
  leagueName,
}: {
  state: DraftState
  setState: (s: DraftState) => void
  onComplete: (s: DraftState) => void
  /** Leave the draft entirely. */
  onQuit: () => void
  /** Abandon this one and begin another, with anything changed applied. */
  onRestart: (next: Partial<DraftConfig>) => void
  /** Set when this season is an entry in a league. */
  leagueName?: string
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [target, setTarget] = useState<Squad | null>(null)
  const [seed, setSeed] = useState(1)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [picking, setPicking] = useState<PlayerSeason | null>(null)
  const [abandoning, setAbandoning] = useState(false)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [freeReroll, setFreeReroll] = useState(false)

  const tournament = TOURNAMENTS[state.config.format]
  const preset = presetById(state.config.presetId)
  const pool = useMemo(() => poolFor(state.config), [state.config])
  const rules = useMemo(() => rulesFor(state.config), [state.config])
  /*
   * Read once per pick and handed to every placement question asked below, so
   * a slot that would leave the eleventh place unfillable is never offered.
   */
  const feas = useMemo(() => feasibility(pool, state.slots), [pool, state.slots])
  const restarts = restartsLeft(state)
  /** Stable per squad and per pick, so the shuffle does not move underfoot. */
  const shuffleRank = useMemo(() => {
    const salt = `${target?.id ?? ''}:${filledCount(state.slots)}`
    return (id: string) => hashOf(`${salt}:${id}`)
  }, [target, state.slots])
  const filled = state.slots.filter((s) => s.player).length
  const daily = state.mode === 'daily' ? todaysChallenge() : null

  /* ── Spin ─────────────────────────────────────────────────────────────── */

  const spin = useCallback(() => {
    if (phase !== 'idle' || isComplete(state.slots)) return
    let squad: Squad
    let cursor = state.dailyCursor

    if (state.mode === 'daily' && daily) {
      const drawn = drawFromSequence(daily.sequence, cursor, state.slots, pool, rules, feas)
      squad = drawn.squad
      cursor = drawn.cursor
    } else {
      squad = drawSquad(pool, state.slots, makeRng(Date.now() + seed * 31), state.recent, rules, feas)
    }

    setTarget(squad)
    setSeed((s) => s + 1)
    setPhase('spinning')
    setFreeReroll(!squadHasPlaceable(squad, state.slots, rules, feas))
    setState({ ...state, currentSquad: squad, dailyCursor: cursor })
  }, [phase, state, pool, rules, feas, daily, seed, setState])

  /** Re-draw. Free when the drawn squad can't advance the draft. */
  const reroll = () => {
    if (phase !== 'revealed') return
    if (!freeReroll && state.skipsUsed >= state.maxSkips) return
    const nextState = freeReroll ? state : { ...state, skipsUsed: state.skipsUsed + 1 }
    setState(nextState)
    setPhase('idle')
    setTarget(null)
    // Re-spin on the next frame so the reel remounts cleanly.
    requestAnimationFrame(() => {
      let squad: Squad
      let cursor = nextState.dailyCursor
      if (nextState.mode === 'daily' && daily) {
        const drawn = drawFromSequence(daily.sequence, cursor, nextState.slots, pool, rules, feas)
        squad = drawn.squad
        cursor = drawn.cursor
      } else {
        squad = drawSquad(pool, nextState.slots, makeRng(Date.now() + seed * 97), nextState.recent, rules, feas)
      }
      setTarget(squad)
      setSeed((s) => s + 1)
      setPhase('spinning')
      setFreeReroll(!squadHasPlaceable(squad, nextState.slots, rules, feas))
      setState({ ...nextState, currentSquad: squad, dailyCursor: cursor })
    })
  }

  /* ── Picking ──────────────────────────────────────────────────────────── */

  const commit = (player: PlayerSeason, slotIndex: number) => {
    const slots = place(state.slots, player, slotIndex)
    const next: DraftState = {
      ...state,
      slots,
      currentSquad: null,
      recent: [state.currentSquad?.id ?? '', ...state.recent].filter(Boolean).slice(0, 4),
    }
    setPicking(null)
    setHighlight(slotIndex)
    setTarget(null)
    setPhase('idle')
    setState(next)
    window.setTimeout(() => setHighlight(null), 700)
    if (isComplete(slots)) window.setTimeout(() => onComplete(next), 480)
  }

  const choose = (player: PlayerSeason) => {
    const open = openSlotsFor(player, state.slots, rules, feas)
    if (open.length === 0) return
    // One option → draft immediately. Several → let them choose the position.
    if (open.length === 1) commit(player, open[0])
    else setPicking(player)
  }

  /* ── Reveal on a timer ────────────────────────────────────────────────── */
  // Driven by a timeout rather than the reel's animation callback so the reveal
  // can never be stranded if the animation is interrupted or skipped.
  useEffect(() => {
    if (phase !== 'spinning') return
    const id = window.setTimeout(() => setPhase('revealed'), SPIN_MS)
    return () => window.clearTimeout(id)
  }, [phase, seed])

  /* ── Space to spin ────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && phase === 'idle' && !picking && !sheetOpen) {
        e.preventDefault()
        spin()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [spin, phase, picking, sheetOpen])

  const revealed = phase === 'revealed' && target
  const skipsLeft = state.maxSkips - state.skipsUsed

  return (
    <div className="pb-32">
      {/* ── Header ── */}
      <div className="sticky top-14 z-30 -mx-4 border-b border-white/[0.06] bg-ink/92 px-4 py-3 backdrop-blur-md md:-mx-8 md:px-8">
        <div className="mx-auto max-w-[520px] md:max-w-[900px]">
          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-2">
              <h1 className="display text-[19px]">Draft</h1>
              <span className="tnum text-[11px] font-bold text-moss">
                {String(filled).padStart(2, '0')} / {XI_SIZE}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setAbandoning(true)}
                disabled={restarts === 0}
                className={`text-[10px] font-bold uppercase tracking-label ${
                  restarts === 0 ? 'cursor-not-allowed text-moss/35' : 'text-moss hover:text-leather'
                }`}
                title={restarts === 0 ? 'No restarts left at this difficulty' : undefined}
              >
                restart{restarts > 0 && restarts < 9 ? ` · ${restarts}` : ''}
              </button>
              <span className="label">skips</span>
              <div className="flex gap-1">
                {[...Array(state.maxSkips)].map((_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rotate-45 rounded-[2px] border ${
                      i < skipsLeft ? 'border-gold/50 bg-gold/60' : 'border-white/15 bg-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-2">
            <ProgressBar value={filled} max={XI_SIZE} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* Which league this counts toward, if any. Without it a player
                arriving from a link has no sign that the season they are about
                to draft is an entry in somebody's contest. */}
            {leagueName && <Pill tone="gold">{leagueName}</Pill>}
            <Pill tone="pitch">{tournament.short}</Pill>
            <Pill>
              {state.config.scope === 'TEAM'
                ? (state.currentSquad?.teamShort ?? state.config.teamKey ?? 'one team')
                : 'all-time'}
            </Pill>
            {state.config.years && (
              <Pill tone="gold">
                {state.config.years[0]}–{state.config.years[1]}
              </Pill>
            )}
            <Pill>{preset.name}</Pill>
            {rules.overseasCap && (
              <Pill tone={overseasCount(state.slots) >= OVERSEAS_LIMIT ? 'leather' : 'muted'}>
                overseas {overseasCount(state.slots)}/{OVERSEAS_LIMIT}
              </Pill>
            )}
            {state.config.hideRatings && <Pill tone="gold">from memory</Pill>}
            {daily && <Pill tone="gold">daily #{daily.number}</Pill>}
          </div>
        </div>
      </div>

      {/* ── Stage ── */}
      <div className="mt-6">
        {/* Plain conditional render: `AnimatePresence mode="wait"` stalls here
            because the reel subtree has its own AnimatePresence. Each panel
            animates itself in, which reads the same. */}
        {phase === 'idle' || !target ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.22 }}
              className="pitch-panel pitch-stripes px-4 py-8 text-center"
            >
              <span className="label">
                {filled === 0 ? 'spin for your first squad' : `${XI_SIZE - filled} slots left to fill`}
              </span>
              <button onClick={spin} className="mt-4 block w-full" aria-label="Spin for a squad">
                <SpinDial spinning={false} />
              </button>
              <div className="mx-auto mt-5 max-w-[280px]">
                <Button size="lg" full onClick={spin}>
                  Spin
                </Button>
                {/* Advice for a keyboard, offered to a phone that has none.
                    Shown where there is one to press. */}
                <p className="mt-2 hidden text-[10px] font-semibold uppercase tracking-label text-moss sm:block">
                  or press space
                </p>
              </div>
              <div className="mt-5 flex justify-center">
                <RoleTally slots={state.slots} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="reel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              {phase === 'spinning' && (
                <SpinReel pool={pool} target={target} spinning seed={seed} />
              )}

              {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                  >
                    {/* ── Drawn squad header ── */}
                    <div className="pitch-panel px-4 py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="label">squad drawn</span>
                        <button
                          onClick={reroll}
                          disabled={!freeReroll && skipsLeft === 0}
                          className={`rounded-lg border px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-label transition-colors ${
                            freeReroll
                              ? 'border-pitch/40 bg-pitch/10 text-pitch'
                              : skipsLeft > 0
                                ? 'border-gold/35 bg-gold/[0.07] text-gold hover:bg-gold/15'
                                : 'cursor-not-allowed border-white/10 text-moss/50'
                          }`}
                        >
                          {freeReroll ? 'dead draw · free re-roll' : `re-roll · ${skipsLeft} left`}
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-end justify-between gap-3">
                        <TeamCrest teamKey={target.teamKey} teamName={target.team} size={38} />
                        <h2 className="display min-w-0 flex-1 text-[26px] leading-none md:text-[32px]">
                          {target.team}
                        </h2>
                        <span className="stat-num shrink-0 text-[30px] text-gold md:text-[36px]">
                          {target.season}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Pill>{target.comp}</Pill>
                        <Pill tone="gold" shout={false}>{ERA_LABEL[target.era]}</Pill>
                      </div>
                    </div>

                    {/* ── Player choices ── */}
                    <div className="mt-5">
                      <h3 className="label-lg">pick one player</h3>
                      <div className="mt-2">
                        <RoleTally slots={state.slots} />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                      {[...target.players]
                        .sort((a, b) => {
                          // Players you can actually pick come first, best first —
                          // the choice that matters should never be buried.
                          const open =
                            Number(canPlace(b, state.slots, rules, feas)) -
                            Number(canPlace(a, state.slots, rules, feas))
                          if (open) return open
                          /*
                           * Hard hides the ratings, but listing them best-first
                           * handed them straight back: the top card was the best
                           * card whether or not its number was showing. On Hard
                           * the order is shuffled instead, so knowing who to take
                           * means knowing the player.
                           *
                           * Seeded off the squad and how far the draft has got,
                           * so it holds still between renders and every player
                           * drawing this squad at this point sees the same order
                           * — the daily has to be the same puzzle for everybody.
                           */
                          if (!state.config.hideRatings) return b.ovr - a.ovr
                          return shuffleRank(a.id) - shuffleRank(b.id)
                        })
                        .map((p, i) => {
                        const open = openSlotsFor(p, state.slots, rules, feas)
                        return (
                          <motion.div
                            key={p.id}
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 + i * 0.05, type: 'spring', stiffness: 300, damping: 26 }}
                          >
                            <PlayerCard
                              player={p}
                              fits={open.length}
                              disabled={open.length === 0}
                              hideRatings={state.config.hideRatings}
                              onClick={() => choose(p)}
                            />
                          </motion.div>
                        )
                      })}
                    </div>
                    <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-label text-moss">
                      tap a card to draft · one player per draw
                    </p>
                  </motion.div>
              )}
            </motion.div>
          )}
      </div>

      {/* ── Bottom rail ── */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.07] bg-ink/94 px-4 pt-2 backdrop-blur-md">
        <div className="mx-auto max-w-[520px] md:max-w-[900px]">
          <XIRail slots={state.slots} onOpen={() => setSheetOpen(true)} highlight={highlight} />
        </div>
      </div>

      {/* ── Abandoning, and setting up what comes next ──
          Rendered only while open, so the settings inside start from the live
          ones each time rather than remembering a change thought better of. */}
      {abandoning && (
        <AbandonDraft
          open
          picked={filled}
          total={XI_SIZE}
          config={state.config}
          onKeepDrafting={() => setAbandoning(false)}
          onRestart={(next) => {
            setAbandoning(false)
            onRestart(next)
          }}
          onChangeEverything={() => {
            setAbandoning(false)
            onQuit()
          }}
          league={leagueName}
        />
      )}

      {/* ── Team sheet drawer ── */}

      <SheetDrawer open={sheetOpen} onClose={() => setSheetOpen(false)} title="Your XI">
        <TeamSheetList slots={state.slots} captainId={state.captainId} />
      </SheetDrawer>

      {/* ── Slot picker ── */}
      <SheetDrawer open={!!picking} onClose={() => setPicking(null)} title="Slot them in">
        {picking && (
          <div>
            <div className="mx-auto max-w-[240px]">
              <PlayerCard player={picking} hero hideRatings={state.config.hideRatings} />
            </div>
            <p className="mt-4 label-lg">choose a position</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {openSlotsFor(picking, state.slots, rules).map((idx) => {
                const slot = state.slots[idx]
                const r = ROLE_STYLE[slot.role]
                return (
                  <motion.button
                    key={idx}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => commit(picking, idx)}
                    className={`rounded-xl border px-2 py-2.5 text-center transition-colors ${r.border} ${r.bg} hover:brightness-125`}
                  >
                    <div className="tnum text-[15px] font-black text-cream">#{slot.no}</div>
                    <div className={`mt-0.5 text-[9px] font-bold tracking-label ${r.text}`}>
                      {slot.role}
                    </div>
                  </motion.button>
                )
              })}
            </div>
            <p className="mt-3 text-[10.5px] leading-snug text-moss">
              Position matters: top-order slots carry more of the batting load.
            </p>
          </div>
        )}
      </SheetDrawer>
    </div>
  )
}
