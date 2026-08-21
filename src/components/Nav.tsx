import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BallMark } from './icons'

/** Scoreboard-ish marks: a ball, a bat, a session clock, a table, a cap. */
const ITEMS = [
  { to: '/', label: 'HOME', glyph: '⬤' },
  { to: '/play', label: 'PLAY', glyph: '⌁' },
  { to: '/daily', label: 'DAILY', glyph: '◑' },
  { to: '/leaderboard', label: 'RANKS', glyph: '☰' },
  { to: '/profile', label: 'PROFILE', glyph: '⬡' },
]

/** Wordmark: the cherry, then "SPIN" in whites and "XI" on a willow tile. */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const t = size === 'lg' ? 'text-[30px]' : 'text-[17px]'
  return (
    <span className={`display inline-flex items-center gap-1.5 ${t}`}>
      <BallMark size={size === 'lg' ? 26 : 17} className="mr-0.5" />
      <span className="text-cream">SPIN</span>
      <span className="rounded-[5px] bg-willow px-1.5 pb-[3px] pt-[1px] leading-none text-ink">
        XI
      </span>
    </span>
  )
}

export function TopBar() {
  const { pathname } = useLocation()
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[900px] items-center justify-between px-4 md:px-8">
        <NavLink to="/" aria-label="SPIN XI home">
          <Logo />
        </NavLink>
        <nav className="hidden items-center gap-1 md:flex">
          {ITEMS.slice(1).map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-label transition-colors ${
                  isActive ? 'bg-white/[0.06] text-cream' : 'text-moss hover:text-cream'
                }`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
        {pathname !== '/play' && (
          <NavLink
            to="/play"
            className="rounded-lg bg-pitch px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-label text-ink md:hidden"
          >
            Play
          </NavLink>
        )}
      </div>
    </header>
  )
}

export function TabBar() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink/92 backdrop-blur-md md:hidden">
      <div className="mx-auto flex max-w-[520px] items-stretch justify-around px-1 pt-1.5">
        {ITEMS.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.to === '/'} className="flex-1">
            {({ isActive }) => (
              <div className="relative flex flex-col items-center gap-0.5 py-1">
                {isActive && (
                  <motion.div
                    layoutId="tab-dot"
                    className="absolute -top-1.5 h-[2px] w-6 rounded-full bg-willow"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}
                <span className={`text-[15px] leading-none ${isActive ? 'text-willow' : 'text-moss'}`}>
                  {it.glyph}
                </span>
                <span
                  className={`text-[8.5px] font-bold uppercase tracking-label ${
                    isActive ? 'text-cream' : 'text-moss'
                  }`}
                >
                  {it.label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
