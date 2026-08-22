import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/* ── Button ──────────────────────────────────────────────────────────────── */

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  to?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
  disabled?: boolean
  className?: string
  full?: boolean
}

const VARIANT = {
  primary:
    'bg-willow text-ink font-extrabold hover:bg-willow-bright active:bg-willow-deep shadow-[0_0_28px_-10px_rgba(227,165,75,0.75)]',
  secondary: 'bg-ink-700 text-cream font-bold hairline hover:bg-ink-600',
  ghost: 'bg-transparent text-moss font-bold hover:text-cream',
  danger: 'bg-transparent text-leather font-bold border border-leather/30 hover:bg-leather/10',
} as const

const SIZE = {
  md: 'h-11 px-5 text-[13px]',
  lg: 'h-14 px-7 text-[15px]',
} as const

export function Button({
  children,
  onClick,
  to,
  variant = 'primary',
  size = 'md',
  disabled,
  className = '',
  full,
}: ButtonProps) {
  const cls = `inline-flex items-center justify-center gap-2 rounded-xl uppercase tracking-[0.08em] transition-colors select-none ${
    VARIANT[variant]
  } ${SIZE[size]} ${full ? 'w-full' : ''} ${
    disabled ? 'pointer-events-none opacity-35' : ''
  } ${className}`

  const inner = (
    <motion.span
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      className="contents"
    >
      {children}
    </motion.span>
  )

  if (to) {
    return (
      <Link to={to} className={cls} aria-disabled={disabled}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  )
}

/* ── Labels & layout ─────────────────────────────────────────────────────── */

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="label-lg">{children}</h2>
      {right}
    </div>
  )
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`mx-auto w-full max-w-[520px] px-4 pb-28 pt-4 md:max-w-[900px] md:px-8 md:pb-16 md:pt-8 ${className}`}
    >
      {children}
    </motion.main>
  )
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  sub,
  accent = 'cream',
  size = 'md',
}: {
  label: string
  value: ReactNode
  sub?: string
  accent?: 'cream' | 'pitch' | 'gold' | 'leather'
  size?: 'sm' | 'md' | 'lg'
}) {
  const color = {
    cream: 'text-cream',
    pitch: 'text-pitch',
    gold: 'text-gold',
    leather: 'text-leather',
  }[accent]
  const num = { sm: 'text-[22px]', md: 'text-[30px]', lg: 'text-[42px]' }[size]
  return (
    <div className="surface flex flex-col justify-between px-3.5 py-3">
      <span className="label">{label}</span>
      <span className={`stat-num mt-2 ${num} ${color}`}>{value}</span>
      {sub && <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-moss">{sub}</span>}
    </div>
  )
}

export function FeatureCard({
  to,
  glyph,
  title,
  desc,
  tag,
}: {
  to: string
  glyph: string
  title: string
  desc: string
  tag?: string
}) {
  return (
    <Link to={to} className="group block">
      <motion.div
        whileTap={{ scale: 0.985 }}
        className="surface flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:border-white/[0.14] hover:bg-ink-600"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-willow/25 bg-willow/[0.07] text-[17px] text-willow">
          {glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-extrabold uppercase tracking-[0.02em] text-cream">
              {title}
            </h3>
            {tag && (
              <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-1.5 py-px text-[8px] font-bold uppercase tracking-label text-gold">
                {tag}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12px] leading-snug text-moss">{desc}</p>
        </div>
        <span className="shrink-0 text-moss transition-transform group-hover:translate-x-0.5 group-hover:text-willow">
          →
        </span>
      </motion.div>
    </Link>
  )
}

/* ── Progress ────────────────────────────────────────────────────────────── */

export function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
      <motion.div
        className="h-full rounded-full bg-pitch"
        initial={false}
        animate={{ width: `${(value / max) * 100}%` }}
        transition={{ type: 'spring', stiffness: 180, damping: 26 }}
      />
    </div>
  )
}

/* ── Modal ───────────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 md:items-center">
      <div className="absolute inset-0 bg-ink/85 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="surface-raised relative w-full max-w-[420px] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
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

/* ── Small pieces ────────────────────────────────────────────────────────── */

export function Pill({
  children,
  tone = 'muted',
  shout = true,
}: {
  children: ReactNode
  tone?: 'muted' | 'pitch' | 'gold' | 'leather'
  /** Off for labels that carry their own casing — a decade is "2010s", not "2010S". */
  shout?: boolean
}) {
  const t = {
    muted: 'border-white/10 bg-white/[0.04] text-moss',
    pitch: 'border-pitch/30 bg-pitch/10 text-pitch',
    gold: 'border-gold/30 bg-gold/10 text-gold',
    leather: 'border-leather/30 bg-leather/10 text-leather',
  }[tone]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-label ${
        shout ? 'uppercase' : 'normal-case'
      } ${t}`}
    >
      {children}
    </span>
  )
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="my-6 h-px w-full bg-white/[0.06]" />
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/[0.06]" />
      <span className="label">{label}</span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  )
}

/**
 * Reference text — how ranking works, what a rating means.
 *
 * It earns its place on a laptop, where it sits in the margin of attention
 * beside the thing it explains. On a phone the same words are most of a
 * screen, and a player who came to look at a ladder has to scroll past an
 * essay to leave. So the phone gets it folded away and the desktop keeps it
 * open: same words, read when wanted.
 */
export function Explainer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-8">
      <details className="group rounded-card border border-white/[0.06] px-3.5 py-2.5 sm:hidden">
        <summary className="label-lg flex cursor-pointer list-none items-center justify-between text-moss [&::-webkit-details-marker]:hidden">
          {title}
          <span className="text-[10px] text-moss/60 transition-transform group-open:rotate-180">
            ▼
          </span>
        </summary>
        <div className="mt-3 text-[11.5px] leading-relaxed text-moss">{children}</div>
      </details>

      <div className="hidden sm:block">
        <SectionLabel>{title}</SectionLabel>
        <p className="text-[11.5px] leading-relaxed text-moss">{children}</p>
      </div>
    </div>
  )
}

/* ── Choosing ────────────────────────────────────────────────────────────── */

/** A pickable card. Shared by the draft setup and the league setup, which
    are the same act — settling the rules before anybody plays. */
export function Option({
  active,
  disabled,
  onClick,
  children,
  note,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  note?: string
}) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative rounded-xl border px-3 py-2.5 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed border-white/[0.05] bg-ink-800 opacity-40'
          : active
            ? 'border-pitch/55 bg-pitch/[0.08] shadow-[0_0_0_1px_rgba(53,208,127,0.25)]'
            : 'border-white/[0.08] bg-ink-700 hover:border-white/20'
      }`}
    >
      {children}
      {note && <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-moss">{note}</div>}
    </motion.button>
  )
}
