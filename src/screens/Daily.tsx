import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Divider, Pill, Screen, SectionLabel, StatCard } from '../components/ui'
import { ROLE_STYLE } from '../components/roles'
import { todaysChallenge } from '../data/challenges'
import { loadDaily } from '../data/records'
import { useAsync } from '../data/useAsync'
import { presetById } from '../game/draft'
import { loadHistory, loadStats, myDaily } from '../data/records'
import { TOURNAMENTS } from '../game/types'

export default function Daily() {
  const navigate = useNavigate()
  const daily = todaysChallenge()
  // The real field, not a number invented from the date.
  const board = useAsync(() => loadDaily(daily.dateKey), [daily.dateKey])
  const mine = useAsync(() => myDaily(daily.dateKey), [daily.dateKey])
  const stats = useAsync(() => loadStats(), [])
  const history = useAsync(() => loadHistory(30), [])
  const played = mine.data

  /**
   * Consecutive days with a daily played, counted back from the most recent.
   * Derived from the entries rather than stored, so it cannot drift away from
   * the days it is meant to be counting.
   */
  const dailies = (history.data ?? [])
    .filter((h) => h.daily_key)
    .map((h) => h.daily_key as string)
    .sort()
    .reverse()
  let streak = 0
  for (let i = 0; i < dailies.length; i++) {
    const expected = new Date(dailies[0])
    expected.setDate(expected.getDate() - i)
    if (dailies[i] === expected.toISOString().slice(0, 10)) streak++
    else break
  }
  const t = TOURNAMENTS[daily.format]
  const preset = presetById(daily.presetId)

  return (
    <Screen>
      <div className="pt-2">
        <span className="label">today · same draw for everyone</span>
        <h1 className="display mt-1 text-[34px] md:text-[46px]">
          Daily <span className="text-pitch">#{daily.number}</span>
        </h1>
      </div>

      {/* ── Challenge card ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="pitch-panel pitch-stripes mt-5 p-4"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="pitch">{t.short}</Pill>
          <Pill>{preset.name}</Pill>
          <Pill tone="gold">chase {t.perfect}</Pill>
        </div>

        <h2 className="display mt-3 text-[24px] leading-tight md:text-[30px]">
          {daily.objective.title}
        </h2>
        <p className="mt-1 text-[12.5px] leading-snug text-moss">{daily.objective.desc}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5">
            <span className="label">players today</span>
            <div className="stat-num mt-1 text-[22px] text-cream">
              {board.data ? board.data.length.toLocaleString() : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5">
            <span className="label">best today</span>
            <div className="stat-num mt-1 text-[22px] text-gold">
              {board.data?.[0] ? `${board.data[0].wins}–${board.data[0].losses}` : '—'}
            </div>
          </div>
        </div>

        <div className="mt-4">
          {played ? (
            <div className="rounded-xl border border-pitch/30 bg-pitch/[0.07] px-3.5 py-3">
              <span className="label">your result</span>
              <div className="mt-1 flex items-end justify-between">
                <span className="stat-num text-[30px] text-cream">
                  {played.wins}–{played.losses}
                  {played.draws ? `–${played.draws}` : ''}
                </span>
                <div className="text-right">
                  <div className="text-[11px] font-extrabold uppercase tracking-label text-pitch">
                    {played.outcome}
                  </div>
                  <div className="tnum text-[10px] font-bold text-moss">{played.points} pts</div>
                </div>
              </div>
              <p className="mt-2 text-[10.5px] text-moss">
                One go a day. Come back tomorrow for #{daily.number + 1}.
              </p>
            </div>
          ) : (
            <Button size="lg" full onClick={() => navigate('/play?mode=daily')}>
              Play daily →
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Required XI ── */}
      <div className="mt-6">
        <SectionLabel>today's batting order</SectionLabel>
        <div className="surface flex flex-wrap gap-1 p-3">
          {preset.slots.map((role, i) => {
            const r = ROLE_STYLE[role]
            return (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] font-bold uppercase tracking-label ${r.border} ${r.bg} ${r.text}`}
              >
                <span className="tnum opacity-50">#{i + 1}</span>
                {role}
              </span>
            )
          })}
        </div>
      </div>

      {/* ── Streak ── */}
      <Divider label="your streak" />
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="streak" value={`${streak}`} sub="days" accent="gold" />
        <StatCard label="dailies played" value={dailies.length} />
        <StatCard label="best wins" value={stats.data?.best_wins || '—'} accent="pitch" />
      </div>

      <div className="mt-6 text-center">
        <Link to="/leaderboard" className="text-[11px] font-bold uppercase tracking-label text-pitch">
          see today's leaderboard →
        </Link>
      </div>
    </Screen>
  )
}
