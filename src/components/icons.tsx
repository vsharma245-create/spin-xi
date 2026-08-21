import { identityOf } from '../data/teamIdentity'
import type { ReactElement } from 'react'
import type { PitchType } from '../game/types'

/**
 * Drawn marks rather than emoji. Emoji render differently on every platform and
 * none of the cricket ones mean what we need — there is no glyph for "this
 * track will turn square". These are four small line drawings that read at
 * 12px: a flat deck, a seaming ball, a turning ball and a set of scales.
 */

const BASE = {
  fill: 'none',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function Batting({ c }: { c: string }) {
  // Bat and ball: runs flow here.
  return (
    <g stroke={c} {...BASE}>
      <g transform="rotate(30 13 12)">
        <rect x="10.4" y="7.4" width="5.4" height="11.2" rx="2.2" />
        <path d="M13.1 7.4V3.2" />
      </g>
      <circle cx="5.4" cy="18.6" r="1.9" fill={c} stroke="none" />
    </g>
  )
}

function Pace({ c }: { c: string }) {
  // A ball with the seam upright, and the bounce off a length.
  return (
    <g stroke={c} {...BASE}>
      <circle cx="12" cy="9" r="4.6" />
      <path d="M12 4.4v9.2" />
      <path d="M3.5 20c3-4.5 5.5-4.5 8.5-4.5s5.5 0 8.5 4.5" />
    </g>
  )
}

function Spin({ c }: { c: string }) {
  // The ball, and the arc it takes after pitching.
  return (
    <g stroke={c} {...BASE}>
      <circle cx="9" cy="7.5" r="3.6" />
      <path d="M6.2 5.2c1.8 1.4 3.6 3 5.6 4.6" />
      <path d="M3.6 20.2c2.6-1 4.7-3 6.2-5.6 1.8-3 5.2-3.9 8.4-1.8" />
      <path d="m15.6 11.4 2.9 1.3-1.2 2.9" />
    </g>
  )
}

function Neutral({ c }: { c: string }) {
  // Scales: nothing given, nothing taken.
  return (
    <g stroke={c} {...BASE}>
      <path d="M12 4v16M7 20h10" />
      <path d="M4 8h16" />
      <path d="M4 8 1.8 13a2.4 2.4 0 0 0 4.4 0Z" />
      <path d="M20 8l-2.2 5a2.4 2.4 0 0 0 4.4 0Z" />
    </g>
  )
}

const SHAPES: Record<PitchType, (p: { c: string }) => ReactElement> = {
  BATTING: Batting,
  PACE: Pace,
  SPIN: Spin,
  NEUTRAL: Neutral,
}

/** Inline surface mark. `size` is the rendered box in pixels. */
export function PitchIcon({
  pitch,
  size = 14,
  className = '',
}: {
  pitch: PitchType
  size?: number
  className?: string
}) {
  const Shape = SHAPES[pitch]
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
    >
      <Shape c="currentColor" />
    </svg>
  )
}

/**
 * The mark: a cricket ball with its seam, quartered the way a new cherry
 * catches the light. Used for the logo lockup and the favicon alike.
 */
export function BallMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={className}>
      <circle cx="16" cy="16" r="14" fill="#C8453A" />
      <path d="M16 2a14 14 0 0 0 0 28" fill="rgba(0,0,0,0.16)" />
      <g stroke="#F4F1E6" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M11.4 3.6c2.6 3.6 4 7.8 4 12.4s-1.4 8.8-4 12.4" />
        <path d="M8.6 6.6c.9.5 1.8 1 2.6 1.6M8.2 11c1 .3 2 .6 3 1.1M8 15.8c1.1 0 2.1.1 3.2.3M8.2 20.6c1-.4 2-.7 3-1M8.6 25c.8-.6 1.7-1.2 2.6-1.7" />
      </g>
    </svg>
  )
}

/**
 * A side's cap badge: its colours, its letters.
 *
 * Drawn rather than fetched — every club here would need a logo file
 * otherwise, most of them are trademarked, and a hundred and sixty-eight
 * images is a slow first load for decoration. Colour and lettering carry the
 * recognition on their own.
 */
export function TeamCrest({
  teamKey,
  teamName,
  size = 28,
}: {
  teamKey: string
  teamName?: string
  size?: number
}) {
  const { primary, accent, monogram, ink } = identityOf(teamKey, teamName)
  return (
    <span
      aria-hidden
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[7px] font-extrabold leading-none"
      style={{
        width: size,
        height: size,
        background: primary,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)',
      }}
    >
      {/*
        The second colour is a corner flash rather than half the badge. Splitting
        the square down the middle put one letter of a two-letter monogram on
        each colour, and whichever ink was chosen, one of them disappeared —
        the West Indies badge read as a lone "W".
      */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{ height: Math.max(3, size * 0.18), background: accent }}
      />
      <span
        className="relative"
        style={{
          fontSize: size * 0.42,
          color: ink,
          letterSpacing: '0.01em',
          // Nudged up off the flash so the letters sit on the plain colour.
          transform: `translateY(${-size * 0.07}px)`,
        }}
      >
        {monogram}
      </span>
    </span>
  )
}

/** A thin colour bar, for rows too tight to carry a crest. */
export function TeamStripe({ teamKey, teamName }: { teamKey: string; teamName?: string }) {
  const { primary, accent } = identityOf(teamKey, teamName)
  return (
    <span
      aria-hidden
      className="block w-[3px] shrink-0 self-stretch rounded-full"
      style={{ background: `linear-gradient(180deg, ${primary}, ${accent})` }}
    />
  )
}
