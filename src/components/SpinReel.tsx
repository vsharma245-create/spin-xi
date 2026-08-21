import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { Squad } from '../game/types'

const ITEM_H = 64

/**
 * Slot-machine reel. Builds a strip of decoy squads ending on the real draw and
 * eases it to a stop — the moment of tension before the pick.
 */
export function SpinReel({
  pool,
  target,
  spinning,
  seed,
}: {
  pool: Squad[]
  target: Squad | null
  spinning: boolean
  seed: number
}) {
  // Rebuilt only when a new spin starts, so the strip is stable mid-animation.
  const strip = useMemo(() => {
    if (!target) return []
    const decoys: Squad[] = []
    for (let i = 0; i < 16; i++) {
      decoys.push(pool[(seed * 7 + i * 13) % pool.length])
    }
    return [...decoys, target]
  }, [target, seed, pool])

  if (!target) return null

  const finalY = -(strip.length - 1) * ITEM_H

  return (
    <div
      className="pitch-stripes relative overflow-hidden rounded-card border border-pitch/[0.18] bg-turf-900"
      style={{ height: ITEM_H }}
    >
      {/* fade masks top and bottom */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-turf-900 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-turf-900 to-transparent" />
      {/* centre indicator */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[2px] seam" />

      <motion.div
        key={seed}
        initial={{ y: 0 }}
        animate={{ y: spinning ? finalY : finalY }}
        transition={
          spinning
            ? { duration: 1.75, ease: [0.12, 0.72, 0.12, 1] }
            : { duration: 0 }
        }
      >
        {strip.map((s, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-4"
            style={{ height: ITEM_H }}
          >
            <div className="min-w-0">
              <div className="display truncate text-[19px] leading-none text-cream">
                {s.teamShort}
              </div>
              <div className="mt-1 truncate text-[9px] font-bold uppercase tracking-label text-moss">
                {s.comp}
              </div>
            </div>
            <div className="stat-num shrink-0 text-[26px] text-gold">{s.season}</div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

/** The idle spin button: a ball with an orbiting seam. */
export function SpinDial({ spinning }: { spinning: boolean }) {
  return (
    <div className="relative mx-auto h-[132px] w-[132px]">
      {/* pulse rings while idle */}
      {!spinning && (
        <>
          <span className="absolute inset-0 rounded-full border border-pitch/25 animate-pulse-ring" />
          <span
            className="absolute inset-0 rounded-full border border-pitch/20 animate-pulse-ring"
            style={{ animationDelay: '0.9s' }}
          />
        </>
      )}
      <motion.svg
        viewBox="0 0 120 120"
        className="relative h-full w-full"
        animate={spinning ? { rotate: 360 * 4 } : { rotate: 0 }}
        transition={spinning ? { duration: 1.8, ease: [0.2, 0.7, 0.2, 1] } : { duration: 0.3 }}
      >
        <defs>
          <radialGradient id="dial" cx="34%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#35D07F" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#35D07F" stopOpacity="0.03" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="54" fill="url(#dial)" stroke="#35D07F" strokeOpacity="0.3" />
        <circle cx="60" cy="60" r="42" fill="none" stroke="#35D07F" strokeOpacity="0.14" />
        {/* stitched seam */}
        <path d="M18 42 Q60 60 18 78" fill="none" stroke="#35D07F" strokeOpacity="0.5" strokeWidth="1.6" />
        <path d="M102 42 Q60 60 102 78" fill="none" stroke="#35D07F" strokeOpacity="0.5" strokeWidth="1.6" />
        {[...Array(12)].map((_, i) => (
          <line
            key={i}
            x1="60"
            y1="8"
            x2="60"
            y2="14"
            stroke="#F2EEE3"
            strokeOpacity="0.18"
            strokeWidth="1.5"
            transform={`rotate(${i * 30} 60 60)`}
          />
        ))}
      </motion.svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="display text-[15px] tracking-[0.12em] text-pitch">
          {spinning ? '···' : 'SPIN'}
        </span>
      </div>
    </div>
  )
}
