import React from 'react'
import { Modal } from './ui'
import { FORMAT_ORDER, RATING_MODE, TOURNAMENTS } from '../game/types'
import type { Difficulty, DraftConfig, Format, RatingMode } from '../game/types'

/**
 * Confirming an abandoned draft, and setting up the next one in the same
 * breath.
 *
 * Quitting used to drop you on the home screen without asking, which loses an
 * XI to a mistapped button. It also assumed the reason for quitting was wanting
 * to stop, when much more often it is wanting to start again — a draw went
 * badly, or the tournament was the wrong choice. So the way out of a draft is
 * also the way into the next one: the three settings most likely to be the
 * reason are here, and starting fresh applies them without a trip back through
 * the whole setup screen.
 */
export function AbandonDraft({
  open,
  picked,
  total,
  config,
  onKeepDrafting,
  onRestart,
  onChangeEverything,
  league,
}: {
  open: boolean
  picked: number
  total: number
  config: DraftConfig
  onKeepDrafting: () => void
  onRestart: (next: Partial<DraftConfig>) => void
  onChangeEverything: () => void
  /**
   * The league this draft belongs to, if any.
   *
   * A league's rules are the same for everyone by definition, so the settings
   * below are not the player's to change here. Offering them would let
   * somebody draft eleven players and simulate a whole season before the
   * database refused it for being played under different rules.
   */
  league?: string
}) {
  // Held locally, and nothing is applied unless the draft is actually
  // abandoned. The dialog is unmounted while closed, so these start from the
  // live settings every time it opens rather than remembering a change you
  // thought better of.
  const [format, setFormat] = React.useState<Format>(config.format)
  const [ratingMode, setRatingMode] = React.useState<RatingMode>(config.ratingMode)
  const [difficulty, setDifficulty] = React.useState<Difficulty>(config.difficulty)

  return (
    <Modal open={open} onClose={onKeepDrafting} title="Abandon this draft?">
      <p className="text-[12.5px] leading-relaxed text-moss">
        You have picked <span className="font-bold text-cream">{picked}</span> of {total}. That XI
        goes with it — there is no getting it back.
        {league && (
          <>
            {' '}
            You will start again on the same rules, because everyone in{' '}
            <span className="font-bold text-cream">{league}</span> plays them.
          </>
        )}
      </p>

      <div className={`mt-4 ${league ? 'hidden' : ''}`}>
        <span className="label">next draft</span>

        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {FORMAT_ORDER.map((f) => (
            <Choice key={f} on={format === f} onClick={() => setFormat(f)}>
              {TOURNAMENTS[f].name}
            </Choice>
          ))}
        </div>

        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(['SEASON', 'PRIME'] as RatingMode[]).map((m) => (
            <Choice key={m} on={ratingMode === m} onClick={() => setRatingMode(m)}>
              {RATING_MODE[m].label}
            </Choice>
          ))}
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {(['EASY', 'NORMAL', 'HARD'] as Difficulty[]).map((d) => (
            <Choice key={d} on={difficulty === d} onClick={() => setDifficulty(d)}>
              {d}
            </Choice>
          ))}
        </div>

        <button
          onClick={onChangeEverything}
          className="mt-2 text-[10.5px] font-bold uppercase tracking-label text-moss underline-offset-2 hover:text-cream hover:underline"
        >
          change everything instead
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          onClick={onKeepDrafting}
          className="rounded-xl border border-white/12 bg-ink-700 px-3 py-3 text-[12px] font-extrabold uppercase tracking-[0.04em] text-cream hover:border-white/25"
        >
          No, keep drafting
        </button>
        <button
          onClick={() => onRestart(league ? {} : { format, ratingMode, difficulty })}
          className="rounded-xl border border-leather/45 bg-leather/12 px-3 py-3 text-[12px] font-extrabold uppercase tracking-[0.04em] text-leather hover:bg-leather/20"
        >
          Yes, start fresh
        </button>
      </div>
    </Modal>
  )
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`truncate rounded-lg border px-2 py-2 text-[10.5px] font-bold uppercase tracking-[0.03em] transition-colors ${
        on ? 'border-pitch/50 bg-pitch/12 text-pitch' : 'border-white/10 bg-ink-700 text-moss hover:border-white/25'
      }`}
    >
      {children}
    </button>
  )
}

