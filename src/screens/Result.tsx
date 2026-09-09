import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Field } from '../components/Field'
import { LeagueTable } from '../components/LeagueTable'
import { Ad } from '../components/Ad'
import { SLOT } from '../components/ads'
import LiveMatch from '../components/LiveMatch'
import { MatchDrawer, MatchRow } from '../components/MatchView'
import { SeasonReview } from '../components/Review'
import { SheetDrawer, TeamSheetList } from '../components/TeamSheet'
import { Button, SectionLabel, StatCard } from '../components/ui'
import { seasonRecords } from '../game/records'
import { drawShareCard } from '../game/shareCard'
import { ClaimAccount } from '../components/ClaimAccount'
import { identity } from '../data/account'
import { loadStats, track } from '../data/records'
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

/**
 * Where a share points.
 *
 * The draw seed makes it playable: the same run of squads, so a score can be
 * answered rather than admired. The settings ride along so the challenge is
 * the same tournament on the same terms.
 */
/**
 * A link that is a challenge rather than a receipt.
 *
 * It always carried the draw — open it and you face the same eleven spins — but
 * it said so nowhere, so whoever clicked it landed on an ordinary setup screen
 * with no idea they had been challenged or what they were chasing. The score
 * and the side's name travel with it now, and the other end reads them.
 */
function challengeLink(r: TournamentResult) {
  const base = typeof window === 'undefined' ? 'https://www.spin-xi.com' : window.location.origin
  if (!r.drawSeed) return base
  const q = new URLSearchParams({
    draw: String(r.drawSeed),
    format: r.format,
    beat: String(r.points),
    by: (r.teamName || 'Their XI').slice(0, 28),
  })
  return `${base}/play?${q}`
}

function shareText(r: TournamentResult) {
  const t = TOURNAMENTS[r.format]
  const grid = r.matches
    .map((m) => (m.outcome === 'W' ? '🟩' : m.outcome === 'D' ? '🟨' : '🟥'))
    .join('')
  const ko = r.knockouts.map((m) => `${m.round} ${m.outcome === 'W' ? '✅' : '❌'}`).join('  ')
  /*
   * An invitation, not a scoreboard.
   *
   * This used to open with the side's name and its ratings and read as a boast,
   * and a boast gives whoever receives it nothing to do. Forty-five people
   * finished a season and one of them shared it. What travels is a number
   * somebody can beat and the promise that they get the same squads to do it
   * with — which the link has always delivered and the words never mentioned.
   */
  return [
    `I got ${r.teamName || 'my XI'} to ${r.points.toLocaleString()} in the SPIN XI ${t.name}.`,
    `${recordOf(r)} · ${outcomeHeadline(r)}`,
    '',
    grid,
    ko,
    r.perfect ? 'PERFECT RUN 🏆' : '',
    '',
    `Same ${r.matches.length} squads, same order. Beat it 👇`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export default function Result({
  result,
  rank,
  challenge,
  onPlayAgain,
  onDaily,
  onTrophy,
}: {
  result: TournamentResult
  rank?: number | null
  /** Set when this season was played off somebody else's challenge link. */
  challenge?: { beat: number; by: string | null } | null
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
  /** Any match of the season, played back rather than read. */
  const [live, setLive] = useState<MatchResult | null>(null)
  // Read back off the scorecards that were already generated, so this costs
  // nothing beyond the walk and cannot disagree with the match log below it.
  const records = useMemo(
    () => seasonRecords([...result.matches, ...result.knockouts]),
    [result],
  )
  const review = useMemo(() => buildReview(result), [result])
  const trophyOpen =
    !!onTrophy && result.format === 'T20L' && result.standing <= TROPHY_QUALIFY_STANDING
  const headline = outcomeHeadline(result)
  const champion = result.outcome === 'CHAMPIONS'

  /**
   * Share the season.
   *
   * Three things travel together and each was missing. A picture, because a
   * block of text is not something anybody posts. A link, because the share
   * carried none at all and whoever saw it had no way back to the game. And
   * the draw, so the link is a challenge rather than a boast — open it and you
   * face the same eleven spins.
   */
  const share = async () => {
    const url = challengeLink(result)
    const text = `${shareText(result)}\n\n${url}`
    /*
     * Recorded because a share is the only thing here that brings anybody new,
     * and none of it was written down: how many people press it, which way it
     * goes out, and whether they went through with it were all unknowable.
     *
     * `via` matters as much as the count. A picture posted to a timeline and a
     * line of text pasted into a group chat travel very differently, and the
     * device decides which of the three happens, not the player.
     */
    const sent = (via: 'image' | 'link' | 'clipboard') =>
      track('result_shared', undefined, {
        via,
        format: result.format,
        outcome: result.outcome,
        champion: result.outcome === 'CHAMPIONS',
      })

    try {
      const png = await drawShareCard(result)
      const file = png && new File([png], 'spin-xi.png', { type: 'image/png' })
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'SPIN XI' })
        sent('image')
        return
      }
      if (navigator.share) {
        await navigator.share({ text, url, title: 'SPIN XI' })
        sent('link')
        return
      }
      // No share sheet: leave them the picture and the words.
      if (png) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(png)
        a.download = 'spin-xi.png'
        a.click()
        URL.revokeObjectURL(a.href)
      }
      await navigator.clipboard.writeText(text)
      sent('clipboard')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /*
       * Backing out of the share sheet lands here, and so does a real failure.
       * Neither is counted: a share that was thought better of did not happen.
       */
    }
  }

  if (live)
    return (
      <div className="py-6">
        <LiveMatch
          match={live}
          teamName={result.teamName}
          format={result.format}
          onDone={() => setLive(null)}
        />
      </div>
    )

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
          className={`display mt-3 text-[32px] leading-[0.9] md:text-[62px] ${
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
          <span className="stat-num text-[38px] text-cream md:text-[64px]">{recordOf(result)}</span>
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
      {/*
        * Answering the challenge.
        *
        * Somebody who arrived from a link and played the whole season was
        * never told whether they had beaten it, which leaves the loop open at
        * exactly the moment it could close — and a person who has just won has
        * the best reason anybody ever has to send one back.
        */}
      {challenge && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-6 rounded-card border px-4 py-3.5 ${
            result.points > challenge.beat
              ? 'border-pitch/40 bg-pitch/[0.08]'
              : 'border-leather/35 bg-leather/[0.07]'
          }`}
        >
          <span className="label">the challenge</span>
          <div
            className={`display mt-1 text-[20px] ${
              result.points > challenge.beat ? 'text-pitch' : 'text-leather'
            }`}
          >
            {result.points > challenge.beat ? 'YOU BEAT IT' : 'NOT THIS TIME'}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-moss">
            {challenge.by || 'They'} scored{' '}
            <span className="font-bold text-cream-dim">{challenge.beat.toLocaleString()}</span>. You
            made <span className="font-bold text-cream-dim">{result.points.toLocaleString()}</span>
            {result.points > challenge.beat
              ? ` — ${(result.points - challenge.beat).toLocaleString()} clear. Send it back.`
              : ` — ${(challenge.beat - result.points).toLocaleString()} short. Same squads, one more go.`}
          </p>
        </motion.div>
      )}

      {/*
        * Challenging somebody is the primary action.
        *
        * It was the second of four, in the grey, labelled "Share result" — a
        * receipt nobody had a reason to press. What the link actually does is
        * hand somebody the same fourteen squads in the same order, which is a
        * thing worth doing and which the button never said.
        */}
      <div className="mt-6 grid gap-2 md:grid-cols-2">
        <Button size="lg" full onClick={share}>
          {copied ? 'Copied ✓' : `Challenge a mate to beat ${result.points.toLocaleString()}`}
        </Button>
        <Button size="lg" variant="secondary" full onClick={onPlayAgain}>
          Play again
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

      {/* ── The season's best individual performances ── */}
      {records.length > 0 && (
        <div className="mt-9">
          <SectionLabel right={<span className="label">across the season</span>}>
            season records
          </SectionLabel>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {records.map((r) => (
              <div key={r.label} className="surface flex flex-col px-3 py-2.5">
                <span className="label">{r.label}</span>
                <div className="tnum mt-1 text-[22px] font-bold leading-none text-cream">
                  {r.figure}
                </div>
                <div className="mt-1 truncate text-[11px] font-bold text-cream">{r.who}</div>
                <div className="text-[10px] leading-snug text-moss">{r.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Between the reading and the re-reading. The season is over, nothing is
          waiting on a tap, and no part of the game is behind it. */}
      <Ad slot={SLOT.result} shape="banner" />

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
        onWatch={(m) => {
          setOpenMatch(null)
          setLive(m)
        }}
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
