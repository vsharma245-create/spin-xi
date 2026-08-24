import { motion } from 'framer-motion'
import { flagOf } from '../data/nations'
import type { Role, Slot } from '../game/types'
import { ROLE_STYLE, ovrTier } from './roles'

/** Compact bottom rail: eleven numbered slots, always visible during the draft. */
export function XIRail({
  slots,
  onOpen,
  highlight,
}: {
  slots: Slot[]
  onOpen: () => void
  /** Slot index that was just filled — pulses once. */
  highlight?: number | null
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left"
      aria-label="Open your team sheet"
    >
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="label">team sheet</span>
        <span className="label">
          {slots.filter((s) => s.player).length} / {slots.length} · tap to open
        </span>
      </div>
      {/* A little room past the last chip, so the rail ends rather than
          looking as though it has been cut off by the screen edge. */}
      <div className="no-bar flex gap-1 overflow-x-auto pb-0.5 pr-3">
        {slots.map((s, i) => {
          const role = ROLE_STYLE[s.role]
          const tier = s.player ? ovrTier(s.player.ovr) : null
          return (
            <motion.div
              key={i}
              animate={
                highlight === i
                  ? { scale: [1, 1.16, 1], borderColor: ['rgba(53,208,127,0.9)', 'rgba(53,208,127,0.25)'] }
                  : {}
              }
              transition={{ duration: 0.55, ease: 'easeOut' }}
              className={`flex h-[42px] min-w-[33px] flex-1 flex-col items-center justify-center rounded-lg border ${
                s.player
                  ? `${tier!.border} ${tier!.bg}`
                  : 'border-dashed border-white/[0.14] bg-white/[0.02]'
              }`}
            >
              {s.player ? (
                <>
                  <span className={`stat-num text-[13px] ${tier!.text}`}>{s.player.ovr}</span>
                  <span className="max-w-[30px] truncate text-[6.5px] font-bold uppercase tracking-wider text-moss">
                    {s.player.surname}
                  </span>
                </>
              ) : (
                <>
                  <span className={`text-[8px] font-bold tracking-label ${role.text} opacity-60`}>
                    {s.role}
                  </span>
                  <span className="tnum text-[7px] font-bold text-moss">#{s.no}</span>
                </>
              )}
            </motion.div>
          )
        })}
      </div>
    </button>
  )
}

/** Role requirement counters — "BAT 3/4" style. */
export function RoleTally({ slots }: { slots: Slot[] }) {
  const order: Role[] = ['BAT', 'WK', 'AR', 'SPIN', 'PACE']
  const tally = order
    .map((role) => {
      const total = slots.filter((s) => s.role === role).length
      const done = slots.filter((s) => s.role === role && s.player).length
      return { role, total, done }
    })
    .filter((t) => t.total > 0)

  return (
    <div className="flex flex-wrap gap-1.5">
      {tally.map(({ role, total, done }) => {
        const r = ROLE_STYLE[role]
        const complete = done === total
        return (
          <span
            key={role}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-label ${
              complete ? 'border-white/[0.07] bg-white/[0.02] text-moss' : `${r.border} ${r.bg} ${r.text}`
            }`}
          >
            {role}
            <span className="tnum opacity-80">
              {done}/{total}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/** Full team sheet, used in the drawer and on the completed-XI screen. */
export function TeamSheetList({
  slots,
  captainId,
  onSetCaptain,
  onMove,
  movingFrom,
}: {
  slots: Slot[]
  captainId?: string | null
  onSetCaptain?: (id: string) => void
  /** Provided on the XI screen to allow reordering. */
  onMove?: (from: number, to: number) => void
  movingFrom?: number | null
}) {
  return (
    <div className="divide-y divide-white/[0.05]">
      {slots.map((s, i) => {
        const role = ROLE_STYLE[s.role]
        const p = s.player
        /*
         * Any other place in the order. The side is already picked by the time
         * this list can be moved around, so there is no requirement left to
         * check against — a batter can be sent in at eleven and a bowler sent
         * up to open, which is the whole point of being able to arrange it.
         */
        const canReceive =
          movingFrom !== null && movingFrom !== undefined && movingFrom !== i

        return (
          <div
            key={i}
            className={`flex items-center gap-2.5 py-2.5 ${
              canReceive ? 'cursor-pointer rounded-lg bg-pitch/[0.07] ring-1 ring-pitch/30' : ''
            } ${movingFrom === i ? 'rounded-lg bg-white/[0.04]' : ''}`}
            onClick={canReceive && onMove ? () => onMove(movingFrom!, i) : undefined}
          >
            <span className="tnum w-6 shrink-0 text-[11px] font-bold text-moss">#{s.no}</span>
            <span
              className={`w-11 shrink-0 rounded-md border px-1 py-0.5 text-center text-[9px] font-bold tracking-label ${role.border} ${role.bg} ${role.text}`}
            >
              {s.role}
            </span>

            {p ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-bold uppercase text-cream">
                      {p.surname}
                    </span>
                    {captainId === p.id && (
                      <span className="shrink-0 rounded border border-gold/40 bg-gold/10 px-1 text-[8px] font-black text-gold">
                        C
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-moss">
                    {flagOf(p.nation)} {p.teamShort} <span className="text-gold/70">{p.season}</span>
                  </div>
                </div>
                {canReceive && (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-label text-pitch">
                    swap here
                  </span>
                )}
                <span className={`stat-num shrink-0 text-[17px] ${ovrTier(p.ovr).text}`}>{p.ovr}</span>
                {onSetCaptain && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSetCaptain(p.id)
                    }}
                    className={`shrink-0 rounded-md border px-1.5 py-1 text-[8.5px] font-bold uppercase tracking-label ${
                      captainId === p.id
                        ? 'border-gold/40 bg-gold/10 text-gold'
                        : 'border-white/10 text-moss hover:border-gold/30 hover:text-gold'
                    }`}
                  >
                    C
                  </button>
                )}
                {onMove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMove(i, i)
                    }}
                    className={`shrink-0 rounded-md border px-1.5 py-1 text-[8.5px] font-bold uppercase tracking-label ${
                      movingFrom === i
                        ? 'border-pitch/50 bg-pitch/10 text-pitch'
                        : 'border-white/10 text-moss hover:text-cream'
                    }`}
                  >
                    ⇅
                  </button>
                )}
              </>
            ) : (
              <div className="flex-1 text-[12px] font-bold uppercase tracking-[0.1em] text-white/15">
                {canReceive ? 'move here' : '— — —'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Bottom drawer. Rendered conditionally with an enter animation only —
 * framer-motion v13 exit animations do not reliably resolve here, which would
 * strand the drawer on screen after closing.
 */
export function SheetDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
        className="absolute inset-0 bg-ink/85 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        className="relative max-h-[82vh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-ink-800 p-4 pb-8 md:rounded-3xl md:border"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 md:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="display text-[17px]">{title}</h3>
          <button onClick={onClose} className="text-moss hover:text-cream" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  )
}
