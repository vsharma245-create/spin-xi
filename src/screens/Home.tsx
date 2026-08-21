import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Button, Divider, FeatureCard, Screen, SectionLabel } from '../components/ui'
import { Logo } from '../components/Nav'
import { datasetStats } from '../data/squads'
import { TAKES } from '../data/leaderboard'
import { FORMAT_ORDER, TOURNAMENTS } from '../game/types'
import { todaysChallenge } from '../data/challenges'

const STEPS = [
  { n: '1', title: 'Spin the wheel', desc: 'Every spin lands on a real side from a specific season.' },
  { n: '2', title: 'Draft one player', desc: 'Pick a single name from that squad and slot them into your order.' },
  { n: '3', title: 'Build your XI', desc: 'Repeat until all eleven positions are filled.' },
  { n: '4', title: 'Simulate', desc: 'Play the tournament out and chase a perfect unbeaten run.' },
]

export default function Home() {
  const daily = todaysChallenge()
  const data = datasetStats()

  return (
    <Screen>
      {/* ── Hero ── */}
      <div className="pt-6 text-center md:pt-10">
        <motion.span
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/[0.07] px-3 py-1 text-[9px] font-bold uppercase tracking-label text-gold"
        >
          <span className="h-1 w-1 rounded-full bg-gold" />
          unofficial fan draft game
        </motion.span>

        {data.current && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mt-2 text-[9px] font-bold uppercase tracking-label text-willow"
          >
            squads current through {data.latest}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          className="mt-5"
        >
          <Logo size="lg" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="display mt-6"
        >
          <span className="block text-[34px] leading-[0.94] md:text-[56px]">Build your XI.</span>
          <span className="mt-1.5 block text-[25px] leading-[0.98] text-willow md:text-[38px]">
            Test your cricket brain.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.14 }}
          className="mx-auto mt-4 max-w-[34ch] text-[13.5px] leading-relaxed text-moss md:max-w-[46ch] md:text-[15px]"
        >
          Draft legends from every era. Build your XI. Simulate the tournament.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mx-auto mt-7 flex max-w-[340px] flex-col gap-2"
        >
          <Button to="/play" size="lg" full>
            Start draft →
          </Button>
          <Button to="/daily" variant="secondary" full>
            Daily challenge · #{daily.number}
          </Button>
        </motion.div>
      </div>

      {/* ── Stat strip ── */}
      <div className="mt-10 grid grid-cols-3 gap-2">
        {[
          { v: data.squads, l: 'squad seasons' },
          { v: data.players, l: 'player seasons' },
          { v: data.range, l: 'seasons covered' },
        ].map((s) => (
          <div key={s.l} className="surface px-2 py-3 text-center">
            <div className="stat-num text-[22px] text-cream">{s.v}</div>
            <div className="label mt-1">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ── Ways to play ── */}
      <div className="mt-10">
        <SectionLabel>ways to play</SectionLabel>
        <div className="grid gap-2 md:grid-cols-2">
          <FeatureCard
            to="/play"
            glyph="◉"
            title="Quick draft"
            desc="Spin, pick, build. Three minutes to a full XI."
          />
          <FeatureCard
            to="/daily"
            glyph="◐"
            title="Daily challenge"
            desc={`${daily.objective.title} · same draw for everyone`}
            tag="Today"
          />
          <FeatureCard
            to="/play?format=T20L"
            glyph="♛"
            title="Champions Trophy"
            desc="Finish top 3 in the T20 League to earn an invitation."
            tag="Optional"
          />
          <FeatureCard
            to="/leaderboard"
            glyph="≡"
            title="Leaderboard"
            desc="Global, India and friends ladders."
          />
          <FeatureCard
            to="/profile"
            glyph="◇"
            title="My profile"
            desc="Streaks, trophies and perfect runs."
          />
        </div>
      </div>

      {/* ── Tournaments ── */}
      <div className="mt-10">
        <SectionLabel>tournaments</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {FORMAT_ORDER.map((f) => {
            const t = TOURNAMENTS[f]
            return (
              <Link
                key={f}
                to={`/play?format=${f}`}
                className="surface group px-3.5 py-3 transition-colors hover:border-white/[0.16] hover:bg-ink-600"
              >
                <div className="flex items-baseline justify-between">
                  <span className="label">{t.short}</span>
                  <span className="tnum text-[10px] font-bold text-willow">{t.perfect}</span>
                </div>
                <h3 className="display mt-1.5 text-[15px] leading-tight">{t.name}</h3>
                <p className="mt-1 text-[11px] leading-snug text-moss">{t.blurb}</p>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── How it works ── */}
      <Divider label="how it works" />
      <div className="grid gap-2 md:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-3 rounded-card border border-white/[0.05] px-3.5 py-3">
            <span className="stat-num shrink-0 text-[26px] text-pitch/40">{s.n}</span>
            <div>
              <h3 className="text-[13px] font-extrabold uppercase tracking-[0.03em] text-cream">
                {s.title}
              </h3>
              <p className="mt-0.5 text-[11.5px] leading-snug text-moss">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Community preview ── */}
      <div className="mt-10">
        <SectionLabel right={<span className="label">preview</span>}>cricket takes</SectionLabel>
        <div className="grid gap-2 md:grid-cols-2">
          {TAKES.map((t) => (
            <div key={t.handle} className="surface px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[9px] font-black text-moss">
                  {t.handle.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-[11px] font-bold text-cream-dim">{t.handle}</span>
              </div>
              <p className="font-editorial mt-2 text-[16px] leading-snug text-cream">“{t.take}”</p>
              <div className="mt-2.5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-moss">
                <span>▲ {t.votes.toLocaleString()}</span>
                <span>{t.comments} replies</span>
                <span className="ml-auto rounded-md border border-white/10 px-1.5 py-0.5 text-pitch/70">
                  prove it
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="mt-12 border-t border-white/[0.06] pt-5 text-center">
        <Logo />
        <p className="mx-auto mt-3 max-w-[56ch] text-[10px] leading-relaxed text-moss/70">
          SPIN XI is an independent fan-made cricket draft and tournament simulator. It is not
          affiliated with, endorsed by or associated with any cricket board, league, franchise,
          player association or ratings provider. Player names, team names, ratings and season data
          are used for descriptive and editorial purposes only. No official logos, crests or player
          images are used. Ratings are computed from publicly published ball-by-ball records of
          matches that were actually played, and represent this game&rsquo;s reading of them alone.
        </p>
        <p className="mt-4 text-[10px] text-moss/70">
          <Link to="/privacy" className="underline hover:text-cream-dim">
            Privacy
          </Link>
          <span className="px-2">·</span>
          <Link to="/terms" className="underline hover:text-cream-dim">
            Terms
          </Link>
        </p>
      </footer>
    </Screen>
  )
}
