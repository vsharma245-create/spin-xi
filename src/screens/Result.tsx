import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Field } from '../components/Field'
import { LeagueTable } from '../components/LeagueTable'
import { MatchDrawer, MatchRow } from '../components/MatchView'
import { SeasonReview } from '../components/Review'
import { SheetDrawer, TeamSheetList } from '../components/TeamSheet'
import { Button, SectionLabel, StatCard } from '../components/ui'
import { ClaimAccount } from '../components/ClaimAccount'
import { identity } from '../data/account'
import { loadStats } from '../data/records'
import { useAsync } from '../data/useAsync'
import { levelFromPoints } from '../game/types'
import { buildReview } from '../game/review'
import { ordinal, outcomeHeadline, qualifyCutoff, recordOf } from '../game/sim'
import { RATING_MODE, TOURNAMENTS, TROPHY_QUALIFY_STANDING } from '../game/types'
import type { MatchResult, TournamentResult } from '../game/types'

/* ── Perfect-run particles ───────────────────────────────────────────────── */

function Confetti() {
  const bits = useMemo(
    () =>
      [...Array(34)].map((_, i) => ({
        id: i,
        x: (i * 37) % 100,
        delay: (i % 9) * 0.09,
        dur: 2.4 + ((i * 7) % 12) / 10,
        hue: ['#35D07F', '#E5A83C', '#F2EEE3'][i % 3],
        size: 4 + (i % 3) * 2,
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b) => (
        <motion.span
          key={b.id}
          initial={{ y: -30, opacity: 0, rotate: 0 }}
          animate={{ y: 420, opacity: [0, 1, 1, 0], rotate: 420 }}
          transition={{ duration: b.dur, delay: b.delay, ease: 'easeIn' }}
          className="absolute rounded-[1px]"
          style={{ left: `${b.x}%`, width: b.size, height: b.size * 2.2, background: b.hue }}
        />
      ))}
    </div>
  )
}

function Trophy({ gold }: { gold: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 64 64"
      className="mx-auto h-16 w-16"
      initial={{ scale: 0.5, opacity: 0, rotate: -12 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.15 }}
    >
      <path
        d="M20 12h24v10a12 12 0 0 1-24 0V12Z"
        fill="none"
        stroke={gold ? '#E5A83C' : '#35D07F'}
        strokeWidth="2.4"
      />
      <path d="M20 15h-6a6 6 0 0 0 6 6M44 15h6a6 6 0 0 1-6 6" fill="none" stroke={gold ? '#E5A83C' : '#35D07F'} strokeWidth="2" />
      <path d="M32 34v8M24 50h16M28 42h8l2 8H26l2-8Z" fill="none" stroke={gold ? '#E5A83C' : '#35D07F'} strokeWidth="2.4" />
    </motion.svg>
  )
}

/* ── Share text ──────────────────────────────────────────────────────────── */

function shareText(r: TournamentResult) {
  const t = TOURNAMENTS[r.format]
  const grid = r.matches
    .map((m) => (m.outcome === 'W' ? '🟩' : m.outcome === 'D' ? '🟨' : '🟥'))
    .join('')
  const ko = r.knockouts.map((m) => `${m.round} ${m.outcome === 'W' ? '✅' : '❌'}`).join('  ')
  return [
    `SPIN XI · ${t.name}`,
    r.teamName,
    `${outcomeHeadline(r)} · ${recordOf(r)} · ${r.points} PTS`,
    grid,
    ko,
    `OVR ${r.ratings.ovr} · BAT ${r.ratings.batting} · BOWL ${r.ratings.bowling}`,
    r.objective ? `${r.objective.title}: ${r.objective.met ? 'ACHIEVED ✅' : 'MISSED ❌'}` : '',
    r.perfect ? 'PERFECT RUN 🏆' : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export default function Result({
  result,
  rank,
  onPlayAgain,
  onDaily,
  onTrophy,
}: {
  result: TournamentResult
  rank?: number | null
  onPlayAgain: () => void
  onDaily: () => void
  /** Offered only to the league's top three. */
  onTrophy?: () => void
}) {
  const t = TOURNAMENTS[result.format]

  /**
   * Whether this record can survive this browser, and what it is worth.
   * Read together so the prompt can say "level 3, four seasons" rather than
   * asking someone to protect an abstraction.
   */
  const claim = useAsync(async () => {
    const [me, stats] = await Promise.all([identity(), loadStats()])
    return { anonymous: me.anonymous, drafts: stats?.drafts ?? 0, level: levelFromPoints(stats?.xp ?? 0) }
  }, [])

  const [xiOpen, setXiOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [openMatch, setOpenMatch] = useState<MatchResult | null>(null)
  const review = useMemo(() => buildReview(result), [result])
  const trophyOpen =
    !!onTrophy && result.format === 'T20L' && result.standing <= TROPHY_QUALIFY_STANDING
  const headline = outcomeHeadline(result)
  const champion = result.outcome === 'CHAMPIONS'

  const share = async () => {
    const text = shareText(result)
    try {
      if (navigator.share) {
        await navigator.share({ text, title: 'SPIN XI' })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  return (
    <div className="relative pb-10">
      {result.perfect && <Confetti />}

      {/* ── Headline ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative pt-6 text-center"
      >
        <span className="label">{t.name}</span>
        <div className="display mt-1.5 text-[15px] tracking-[0.1em] text-cream-dim">
          {result.teamName}
        </div>

        {champion && <div className="mt-3">
          <Trophy gold={result.perfect} />
        </div>}

        <motion.h1
          initial={{ scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 18, delay: 0.08 }}
          className={`display mt-3 text-[40px] leading-[0.88] md:text-[62px] ${
            result.perfect
              ? 'text-gold [text-shadow:0_0_46px_rgba(229,168,60,0.45)]'
              : champion
                ? 'text-pitch [text-shadow:0_0_40px_rgba(53,208,127,0.35)]'
                : 'text-cream'
          }`}
        >
          {headline}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.24 }}
          className="mt-3 flex items-center justify-center gap-4"
        >
          <span className="stat-num text-[52px] text-cream md:text-[64px]">{recordOf(result)}</span>
          <div className="text-left">
            <div className="stat-num text-[24px] text-pitch">{result.points}</div>
            <div className="label">points</div>
          </div>
        </motion.div>

        {result.perfect && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="font-editorial mt-3 text-[19px] italic text-gold"
          >
            You built a perfect XI.
          </motion.p>
        )}

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
          <span className="label">finished</span>
          <span
            className={`text-[13px] font-black ${
              result.standing <= qualifyCutoff(result.format) ? 'text-pitch' : 'text-leather'
            }`}
          >
            {ordinal(result.standing)}
          </span>
          <span className="label">of {result.table.length}</span>
        </div>

        {rank != null && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
            <span className="label">rank today</span>
            <span className="tnum text-[13px] font-black text-cream">#{rank.toLocaleString()}</span>
          </div>
        )}
      </motion.div>

      {/* ── Daily objective ── */}
      {result.objective && (
        <div
          className={`mt-6 rounded-card border px-3.5 py-3 ${
            result.objective.met
              ? 'border-pitch/35 bg-pitch/[0.07]'
              : 'border-leather/30 bg-leather/[0.06]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="label">today's objective</span>
            <span
              className={`text-[10px] font-black uppercase tracking-label ${
                result.objective.met ? 'text-pitch' : 'text-leather'
              }`}
            >
              {result.objective.met ? 'achieved' : 'missed'}
            </span>
          </div>
          <div className="display mt-1.5 text-[17px]">{result.objective.title}</div>
          <p className="mt-0.5 text-[11px] text-moss">{result.objective.desc}</p>
        </div>
      )}

      {/* ── Test Championship standing ── */}
      {result.pct !== undefined && (
        <div className="surface mt-6 flex items-center justify-between px-3.5 py-3">
          <div>
            <span className="label">points percentage</span>
            <p className="mt-0.5 text-[11px] text-moss">
              Win 12 · draw 4 · loss 0, across {result.matches.length} Tests.
            </p>
          </div>
          <span className="stat-num text-[30px] text-gold">{result.pct}%</span>
        </div>
      )}

      {/* ── Ratings ── */}
      <div className="mt-6 flex items-center justify-between">
        <span className="label">team ratings</span>
        <span className="label">{RATING_MODE[result.ratingMode].label.toLowerCase()} ratings</span>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-2">
        <StatCard label="ovr" value={result.ratings.ovr} accent="pitch" />
        <StatCard label="batting" value={result.ratings.batting} />
        <StatCard label="bowling" value={result.ratings.bowling} />
        <StatCard label="balance" value={result.ratings.balance} />
      </div>

      {/* ── Collectable earned ── */}
      {result.cardEarned && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-3 flex items-center gap-3 rounded-card border border-gold/25 bg-gold/[0.05] px-3.5 py-3"
        >
          <span className="text-[19px]">🃏</span>
          <div className="min-w-0 flex-1">
            <span className="label">card earned</span>
            <div className="display truncate text-[15px] text-cream">{result.cardEarned.name}</div>
            <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-moss">
              {result.cardEarned.team} · {result.cardEarned.season}
            </div>
          </div>
          <span className="shrink-0 rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-label text-gold">
            {result.cardEarned.tier}
          </span>
        </motion.div>
      )}

      {/* ── Keeping it ──
          Offered here rather than on arrival, because this is the first moment
          a player has something they would mind losing. A season just ended, a
          card was earned, and the reason to bother is on the screen above. */}
      {claim.data?.anonymous === true && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-3"
        >
          <ClaimAccount
            drafts={claim.data.drafts}
            level={claim.data.level}
            returnTo="/profile"
            compact
          />
        </motion.div>
      )}

      {/* ── Actions ── */}
      <div className="mt-6 grid gap-2 md:grid-cols-2">
        <Button size="lg" full onClick={onPlayAgain}>
          Play again
        </Button>
        <Button size="lg" variant="secondary" full onClick={share}>
          {copied ? 'Copied ✓' : 'Share result'}
        </Button>
        <Button variant="secondary" full onClick={() => setXiOpen(true)}>
          View XI
        </Button>
        <Button variant="ghost" full onClick={onDaily}>
          Daily challenge
        </Button>
      </div>

      {/* ── Champions Trophy invitation ── */}
      {trophyOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 rounded-card border border-gold/35 bg-gold/[0.06] p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="label">invitation earned</span>
            <span className="text-[9px] font-black uppercase tracking-label text-gold">
              top {TROPHY_QUALIFY_STANDING} only
            </span>
          </div>
          <div className="display mt-1.5 text-[22px] text-gold">CHAMPIONS TROPHY</div>
          <p className="mt-1 text-[11.5px] leading-snug text-moss">
            Finishing {ordinal(result.standing)} puts your XI in the invitational. Eight sides drawn
            fresh from the T20 League's best squads, three knockout ties, no league to fall back on.
            Entering is optional — the league result already stands.
          </p>
          <div className="mt-3">
            <Button size="lg" full onClick={onTrophy}>
              Enter the Champions Trophy →
            </Button>
          </div>
        </motion.div>
      )}

      <SeasonReview review={review} result={result} onOpenMatch={setOpenMatch} />

      {/* ── League table ── */}
      <div className="mt-9">
        <SectionLabel right={<span className="label">top {qualifyCutoff(result.format)} advance</span>}>
          {result.format === 'T20L' ? 'league table' : 'group table'}
        </SectionLabel>
        <LeagueTable
          rows={result.table}
          cutoff={qualifyCutoff(result.format)}
          draws={t.draws}
        />
      </div>

      {/* ── Full scorecard ── */}
      <div className="mt-9">
        <SectionLabel right={<span className="label">tap any match to replay it</span>}>
          match log
        </SectionLabel>
        <div className="surface divide-y divide-white/[0.05] px-3.5">
          {[...result.matches, ...result.knockouts].map((m) => (
            <MatchRow key={m.round} match={m} onOpen={() => setOpenMatch(m)} />
          ))}
        </div>
      </div>

      <MatchDrawer
        match={openMatch}
        teamName={result.teamName}
        onClose={() => setOpenMatch(null)}
      />

      <SheetDrawer open={xiOpen} onClose={() => setXiOpen(false)} title="Your XI">
        <Field slots={result.slots} captainId={result.captainId} />
        <div className="mt-3">
          <TeamSheetList slots={result.slots} captainId={result.captainId} />
        </div>
      </SheetDrawer>
    </div>
  )
}
