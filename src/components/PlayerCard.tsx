import { motion } from 'framer-motion'
import { flagOf } from '../data/nations'
import { tierOf } from '../game/types'
import type { PlayerSeason, Tier } from '../game/types'
import { ROLE_STYLE, ovrTier } from './roles'

/** Rarity treatment for the card's top edge and tier label. */
const TIER_STYLE: Record<Tier, { text: string; edge: string; label: string }> = {
  IMMORTAL: { text: 'text-gold', edge: 'from-gold/70', label: 'immortal' },
  ICON: { text: 'text-pitch', edge: 'from-pitch/60', label: 'icon' },
  RARE: { text: 'text-cream-dim', edge: 'from-cream/35', label: 'rare' },
  COMMON: { text: 'text-moss', edge: 'from-white/15', label: 'common' },
}

/** Two-letter monogram used as the card watermark, e.g. "JB". */
function monogram(name: string) {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * The given-name line above the big surname. Surname overrides can be multi-word
 * ("DE VILLIERS") or already carry the whole identity ("RASHID KHAN"), so strip
 * whatever the card is about to show rather than assuming the last word.
 */
function givenName(name: string, surname: string) {
  const n = name.trim()
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ')
  const ln = norm(n)
  const ls = norm(surname)
  if (ln.endsWith(ls)) return n.slice(0, n.length - surname.length).trim()
  if (ln.startsWith(ls)) return ''
  const parts = n.split(' ')
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : ''
}

/**
 * Abstract card art: a cricket-ball disc with seam arcs, tinted per role.
 * No photographs and no likenesses — geometry and typography only.
 */
function CardArt({ hex, seed }: { hex: string; seed: number }) {
  const rot = (seed % 5) * 7 - 14
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden
      className="pointer-events-none absolute -right-5 -top-3 h-[112px] w-[112px]"
      style={{ transform: `rotate(${rot}deg)` }}
    >
      <defs>
        <radialGradient id={`ball${seed}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={hex} stopOpacity="0.3" />
          <stop offset="100%" stopColor={hex} stopOpacity="0.02" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="46" fill={`url(#ball${seed})`} />
      <circle cx="60" cy="60" r="46" fill="none" stroke={hex} strokeOpacity="0.2" strokeWidth="1" />
      <path d="M22 44 Q60 60 22 76" fill="none" stroke={hex} strokeOpacity="0.3" strokeWidth="1.4" />
      <path d="M30 40 Q68 60 30 80" fill="none" stroke={hex} strokeOpacity="0.15" strokeWidth="1" />
    </svg>
  )
}

/* ── Full collectible card ───────────────────────────────────────────────── */

export function PlayerCard({
  player,
  onClick,
  disabled,
  selected,
  hero,
  captain,
  hideRatings,
  /** How many open slots this player fits — drives the "+" affordance. */
  fits,
}: {
  player: PlayerSeason
  onClick?: () => void
  disabled?: boolean
  selected?: boolean
  hero?: boolean
  captain?: boolean
  hideRatings?: boolean
  fits?: number
}) {
  const role = ROLE_STYLE[player.role]
  const tier = ovrTier(player.ovr)
  const tier2 = TIER_STYLE[tierOf(player.ovr)]
  const seed = player.name.length + player.ovr
  const first = givenName(player.name, player.surname)
  const interactive = !!onClick && !disabled
  const multi = (fits ?? 0) > 1 || player.alt.length > 0

  return (
    <motion.button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      whileTap={interactive ? { scale: 0.975 } : undefined}
      whileHover={interactive ? { y: -3 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={[
        'group relative flex w-full flex-col overflow-hidden rounded-card border text-left transition-colors',
        hero ? 'p-5' : 'p-3.5',
        disabled
          ? 'cursor-not-allowed border-white/[0.05] bg-ink-800'
          : selected
            ? 'border-pitch/60 bg-turf-800 shadow-glow'
            : `border-white/[0.08] bg-ink-700 ${interactive ? 'hover:border-white/20' : ''}`,
      ].join(' ')}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 100% 0%, ${role.hex}1F 0%, transparent 62%)`,
        }}
      />
      {/* rarity edge — a quiet collectible signal, brightest on the greats */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r to-transparent ${tier2.edge}`}
      />
      <CardArt hex={role.hex} seed={seed} />

      <span
        aria-hidden
        className={`pointer-events-none absolute right-2 select-none font-display font-black leading-none tracking-tight3 text-white/[0.045] ${
          hero ? 'bottom-1 text-[128px]' : 'bottom-0 text-[86px]'
        }`}
      >
        {monogram(player.name)}
      </span>

      {/* ── OVR + role ── */}
      <div className="relative z-10 flex items-start justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className={`stat-num ${hero ? 'text-[46px]' : 'text-[34px]'} ${hideRatings ? 'text-moss' : tier.text}`}>
            {hideRatings ? '••' : player.ovr}
          </span>
          {hero && !hideRatings && <span className="label mb-1">ovr</span>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-label ${role.border} ${role.bg} ${role.text}`}
          >
            {player.role}
            {multi && <span className="ml-0.5 opacity-70">+</span>}
          </span>
          {captain && (
            <span className="rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-label text-gold">
              C
            </span>
          )}
        </div>
      </div>

      {/* ── name ── */}
      <div className={`relative z-10 ${hero ? 'mt-7' : 'mt-5'}`}>
        <div
          className={`flex items-center gap-1 truncate font-semibold uppercase tracking-[0.14em] text-moss ${
            hero ? 'text-[11px]' : 'text-[9px]'
          }`}
        >
          <span className={hero ? 'text-[13px]' : 'text-[11px]'}>{flagOf(player.nation)}</span>
          <span className="truncate">{first || player.teamShort}</span>
        </div>
        <div className={`display truncate text-cream ${hero ? 'text-[30px]' : 'text-[19px]'}`} title={player.name}>
          {player.surname}
        </div>
      </div>

      {/* ── team + season ── */}
      <div className="relative z-10 mt-2.5 flex items-center gap-1.5 border-t border-white/[0.07] pt-2.5">
        <span
          className={`min-w-0 flex-1 truncate font-semibold uppercase tracking-[0.06em] text-cream-dim ${
            hero ? 'text-[11px]' : 'text-[9.5px]'
          }`}
        >
          {hero ? player.team : player.teamShort}
        </span>
        {player.prime && (
          <span
            className="shrink-0 rounded-md border border-gold/40 bg-gold/10 px-1 py-px text-[7.5px] font-black uppercase tracking-label text-gold"
            title={`Rated at their ${player.peakSeason} peak`}
          >
            prime
          </span>
        )}
        <span className={`tnum shrink-0 font-bold text-gold ${hero ? 'text-[12px]' : 'text-[10px]'}`}>
          {player.season}
        </span>
      </div>

      {hero && (
        <div className={`relative z-10 mt-2 text-[9px] font-bold uppercase tracking-label ${tier2.text}`}>
          {tier2.label} card
        </div>
      )}

      {/* ── sub-ratings ── */}
      <div className="relative z-10 mt-2.5 grid grid-cols-3 gap-1">
        {player.stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-white/[0.06] bg-black/25 px-1.5 py-1.5 text-center"
          >
            <div className="text-[7.5px] font-bold uppercase tracking-label text-moss">{s.label}</div>
            <div className={`stat-num mt-0.5 ${hero ? 'text-[17px]' : 'text-[14px]'} ${hideRatings ? 'text-moss' : 'text-cream'}`}>
              {hideRatings ? '••' : s.value}
            </div>
          </div>
        ))}
      </div>

      {disabled && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-ink/70 px-3">
          <span className="rounded-md border border-white/15 bg-ink px-2 py-1 text-center text-[8.5px] font-bold uppercase leading-tight tracking-label text-moss">
            no eligible slot
          </span>
        </div>
      )}
    </motion.button>
  )
}

/* ── Compact row ─────────────────────────────────────────────────────────── */

export function PlayerRow({
  player,
  captain,
  slotNo,
  slotRole,
  onSetCaptain,
}: {
  player: PlayerSeason
  captain?: boolean
  slotNo?: number
  slotRole?: string
  onSetCaptain?: () => void
}) {
  const role = ROLE_STYLE[player.role]
  const tier = ovrTier(player.ovr)
  return (
    <div className="flex items-center gap-2.5 border-b border-white/[0.05] py-2.5 last:border-0">
      {slotNo !== undefined && (
        <span className="tnum w-5 shrink-0 text-[10px] font-bold text-moss">#{slotNo}</span>
      )}
      <span
        className={`grid h-8 w-9 shrink-0 place-items-center rounded-lg border text-[13px] font-black ${tier.border} ${tier.bg} ${tier.text}`}
      >
        {player.ovr}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-bold uppercase tracking-[0.02em] text-cream">
            {player.surname}
          </span>
          {captain && (
            <span className="shrink-0 rounded border border-gold/40 bg-gold/10 px-1 text-[8px] font-black text-gold">
              C
            </span>
          )}
        </div>
        <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-moss">
          {flagOf(player.nation)} {player.teamShort} <span className="text-gold/70">{player.season}</span>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-label ${role.border} ${role.bg} ${role.text}`}
      >
        {slotRole ?? player.role}
      </span>
      {onSetCaptain && (
        <button
          onClick={onSetCaptain}
          className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-label transition-colors ${
            captain
              ? 'border-gold/40 bg-gold/10 text-gold'
              : 'border-white/10 text-moss hover:border-gold/30 hover:text-gold'
          }`}
        >
          {captain ? 'capt' : 'set c'}
        </button>
      )}
    </div>
  )
}
