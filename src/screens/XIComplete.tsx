import { motion } from 'framer-motion'
import { PitchIcon } from '../components/icons'
import { useEffect, useState } from 'react'
import { Field } from '../components/Field'
import { TeamSheetList } from '../components/TeamSheet'
import { Button, Pill, SectionLabel, StatCard } from '../components/ui'
import { overseasCount, reorderXI, suggestCaptain, teamRatings, xiOf } from '../game/draft'
import { chemistryOf } from '../game/chemistry'
import { pitchSuitability } from '../game/sim'
import { OVERSEAS_LIMIT } from '../data/nations'
import { PITCH, TOURNAMENTS } from '../game/types'
import type { DraftState, PitchType } from '../game/types'

export default function XIComplete({
  state,
  setState,
  onSimulate,
}: {
  state: DraftState
  setState: (s: DraftState) => void
  onSimulate: () => void
}) {
  const [movingFrom, setMovingFrom] = useState<number | null>(null)
  const tournament = TOURNAMENTS[state.config.format]

  // Nominate a captain automatically; the player can override.
  useEffect(() => {
    if (!state.captainId) setState({ ...state, captainId: suggestCaptain(state.slots) })
  }, [state, setState])

  const ratings = teamRatings(state.slots, state.captainId)
  // Who in this side has actually played alongside whom, read off the archive.
  const chemistry = chemistryOf(xiOf(state.slots))
  const suits = pitchSuitability(state.slots, ratings)
  const overseas = overseasCount(state.slots)

  const onMove = (from: number, to: number) => {
    if (from === to) {
      setMovingFrom(movingFrom === from ? null : from)
      return
    }
    setState({ ...state, slots: reorderXI(state.slots, from, to) })
    setMovingFrom(null)
  }

  return (
    <div className="pb-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <span className="label">xi complete · {tournament.name}</span>
        <h1 className="display mt-1 text-[38px] md:text-[52px]">Your XI</h1>
      </motion.div>

      {/* ── Ratings ── */}
      <div className="mt-5 grid grid-cols-4 gap-2">
        <StatCard label="ovr" value={ratings.ovr} accent="pitch" />
        <StatCard label="batting" value={ratings.batting} />
        <StatCard label="bowling" value={ratings.bowling} />
        <StatCard label="balance" value={ratings.balance} accent={ratings.balance >= 80 ? 'cream' : 'gold'} />
      </div>

      {/* ── How well they know each other ── */}
      {chemistry.pairs.length > 0 && (
        <div className="surface mt-3 px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className="label">understanding</span>
            <span className="tnum text-[19px] font-bold leading-none text-pitch">
              {chemistry.score}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {chemistry.pairs.map((p) => (
              <div key={`${p.a.id}-${p.b.id}`} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[11.5px] font-semibold text-cream">
                  {p.a.surname} &amp; {p.b.surname}
                </span>
                <span className="tnum shrink-0 text-[10.5px] text-moss">
                  {p.seasons} seasons together
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-moss">
            Players who have spent seasons in the same side. Worth a little in a close match.
          </p>
        </div>
      )}

      {/* ── Field ── */}
      <div className="mt-4">
        <Field slots={state.slots} captainId={state.captainId} />
      </div>

      {/* ── Conditions readout ── */}
      <div className="mt-6">
        <SectionLabel right={<span className="label">how you'd fare</span>}>conditions</SectionLabel>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(Object.keys(PITCH) as PitchType[]).map((p) => {
            const score = suits[p]
            const best = score === Math.max(...Object.values(suits))
            return (
              <div
                key={p}
                className={`rounded-card border px-3 py-2.5 ${
                  best ? 'border-pitch/35 bg-pitch/[0.07]' : 'border-white/[0.07] bg-ink-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <PitchIcon pitch={p} size={15} className="text-cream-dim" />
                  <span className={`stat-num text-[19px] ${best ? 'text-pitch' : 'text-cream-dim'}`}>
                    {score}
                  </span>
                </div>
                <div className="mt-1 text-[9px] font-bold uppercase leading-tight tracking-label text-moss">
                  {PITCH[p].label}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-moss">
          Each match is played on one of these surfaces. A spin-heavy XI eats turners and struggles
          on green decks — balance is what survives a whole tournament.
        </p>
      </div>

      {overseas > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <Pill tone={overseas > OVERSEAS_LIMIT ? 'leather' : 'muted'}>
            overseas {overseas}/{OVERSEAS_LIMIT}
          </Pill>
          <span className="text-[10.5px] text-moss">
            {state.config.overseasCap && state.config.format === 'T20L'
              ? 'Within league limits.'
              : 'No cap in this tournament.'}
          </span>
        </div>
      )}

      {/* ── Team sheet ── */}
      <div className="mt-6">
        <SectionLabel
          right={
            <span className="label">
              {movingFrom !== null
                ? 'now tap where they should bat'
                : 'tap ⇅ to move anyone, anywhere · C to captain'}
            </span>
          }
        >
          batting order
        </SectionLabel>
        <div className="surface px-3.5 py-1.5">
          <TeamSheetList
            slots={state.slots}
            captainId={state.captainId}
            onSetCaptain={(id) => setState({ ...state, captainId: id })}
            onMove={onMove}
            movingFrom={movingFrom}
          />
        </div>
      </div>

      <div className="mt-7">
        <Button size="lg" full onClick={onSimulate}>
          Simulate {tournament.short} →
        </Button>
        <p className="mt-2 text-center text-[10.5px] text-moss">
          {tournament.group} matches, then {tournament.knockouts.join(' and ').toLowerCase()}. Chase{' '}
          <span className="font-bold text-pitch">{tournament.perfect}</span>.
        </p>
      </div>
    </div>
  )
}
