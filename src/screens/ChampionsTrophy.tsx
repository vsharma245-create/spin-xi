import { motion } from 'framer-motion'
import { PitchIcon } from '../components/icons'
import { useMemo, useState } from 'react'
import LiveMatch from '../components/LiveMatch'
import { MatchDrawer, MatchRow } from '../components/MatchView'
import { Button, SectionLabel } from '../components/ui'
import { attackOf, favoursBatting, ordinal } from '../game/sim'
import { teamRatings, xiOf } from '../game/draft'
import { saveTrophy } from '../data/records'
import { sideLabel, starsOf } from '../game/opponents'
import { newTrophyRun, playTrophyTie, trophyHeadline, trophyOver } from '../game/trophy'
import { PITCH, TROPHY_ROUNDS } from '../game/types'
import type { MatchResult, TournamentResult, TrophyRun } from '../game/types'

/**
 * The post-league invitational. Entry is optional and the eight-side draw is
 * rebuilt from the T20 League's best squads every time it is entered, so the
 * bracket in front of you has never been played before.
 */
export default function ChampionsTrophy({
  result,
  onExit,
}: {
  result: TournamentResult
  onExit: () => void
}) {
  const teamName = result.teamName
  const ratings = useMemo(() => teamRatings(result.slots, result.captainId), [result])
  const attack = useMemo(() => attackOf(result.slots), [result])
  const xi = useMemo(() => xiOf(result.slots), [result])

  // A new seed per draw — pressing re-draw genuinely reshuffles the field.
  const [seed, setSeed] = useState(0)
  const [run, setRun] = useState<TrophyRun>(() => newTrophyRun(Math.random, result.ratingMode))
  const [open, setOpen] = useState<MatchResult | null>(null)
  /** The tie being watched. A knockout that resolves on the click is not a tie. */
  const [live, setLive] = useState<MatchResult | null>(null)
  const [recorded, setRecorded] = useState(false)
  /** The toss for the tie about to be played, rolled once per round. */
  const [tossWon, setTossWon] = useState(() => Math.random() < 0.5)

  const done = trophyOver(run)
  const nextRound = TROPHY_ROUNDS[run.ties.length]
  const nextOpponent = run.field[run.ties.length % run.field.length]
  const nextPitch = run.pitches[Math.min(run.ties.length, run.pitches.length - 1)]

  const redraw = () => {
    setRun(newTrophyRun(Math.random, result.ratingMode))
    setTossWon(Math.random() < 0.5)
    setSeed((n) => n + 1)
  }

  const play = (batFirst: boolean) => {
    const next = { ...run, ties: [...run.ties] }
    playTrophyTie(next, ratings, xi, attack, Math.random, { won: tossWon, batFirst })
    setRun(next)
    setLive(next.ties[next.ties.length - 1]?.match ?? null)
    setTossWon(Math.random() < 0.5)
    if (trophyOver(next) && !recorded) {
      setRecorded(true)
      // Recorded on the server, where a career lives. A failure here costs the
      // run rather than the screen: the bracket stays on show either way.
      void saveTrophy(next, {
        teamName,
        ratingMode: result.ratingMode,
        difficulty: result.difficulty,
        presetId: result.presetId,
      }).catch(() => {})
    }
  }

  if (live)
    return (
      <div className="py-6">
        <LiveMatch
          match={live}
          teamName={teamName}
          format="T20L"
          onDone={() => setLive(null)}
        />
      </div>
    )

  return (
    <div className="pb-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-4">
        <span className="label">invitational · {teamName}</span>
        <h1 className="display mt-1 text-[34px] leading-[0.9] text-gold md:text-[48px]">
          Champions
          <br />
          Trophy
        </h1>
        <p className="mt-2 max-w-[46ch] text-[12px] leading-snug text-moss">
          Eight real sides drawn from the T20 League's strongest recent squads. Three ties,
          no second chances. You are here because you finished{' '}
          <span className="font-bold text-cream">{ordinal(result.standing)}</span>.
        </p>
      </motion.div>

      {/* ── The draw ── */}
      <div className="mt-6">
        <SectionLabel
          right={
            run.ties.length === 0 ? (
              <button
                onClick={redraw}
                className="rounded-lg border border-gold/30 bg-gold/[0.07] px-2.5 py-1 text-[9.5px] font-black uppercase tracking-label text-gold hover:bg-gold/15"
              >
                ⟳ re-draw the field
              </button>
            ) : (
              <span className="label">draw #{seed + 1}</span>
            )
          }
        >
          the draw
        </SectionLabel>

        <motion.div key={seed} className="grid gap-2 md:grid-cols-2">
          {run.field.map((side, i) => {
            const tie = run.ties.find((t) => t.opponent === side)
            const upNext = !done && i === run.ties.length % run.field.length
            return (
              <motion.div
                key={`${seed}-${sideLabel(side)}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`rounded-card border px-3.5 py-2.5 ${
                  tie
                    ? tie.match.outcome === 'W'
                      ? 'border-pitch/35 bg-pitch/[0.06]'
                      : 'border-leather/35 bg-leather/[0.06]'
                    : upNext
                      ? 'border-gold/40 bg-gold/[0.06]'
                      : 'border-white/[0.07] bg-ink-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-extrabold uppercase tracking-[0.03em] text-cream">
                    {sideLabel(side)}
                  </span>
                  <span className="stat-num shrink-0 text-[17px] text-cream-dim">
                    {side.ratings.ovr}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[9.5px] font-semibold uppercase tracking-wider text-moss">
                  {starsOf(side).join(' · ')}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-label">
                  <span className="text-moss">BAT {side.ratings.batting}</span>
                  <span className="text-moss">BOWL {side.ratings.bowling}</span>
                  {upNext && <span className="text-gold">up next</span>}
                  {tie && (
                    <span className={tie.match.outcome === 'W' ? 'text-pitch' : 'text-leather'}>
                      {tie.round} · {tie.match.outcome === 'W' ? 'beaten' : 'knocked us out'}
                    </span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      {/* ── Bracket progress ── */}
      <div className="mt-6 grid grid-cols-3 gap-2">
        {TROPHY_ROUNDS.map((round, i) => {
          const tie = run.ties[i]
          return (
            <div
              key={round}
              className={`rounded-card border px-3 py-2.5 text-center ${
                tie
                  ? tie.match.outcome === 'W'
                    ? 'border-pitch/40 bg-pitch/[0.08]'
                    : 'border-leather/40 bg-leather/[0.08]'
                  : 'border-white/[0.07] bg-white/[0.02]'
              }`}
            >
              <div className="label">{round}</div>
              <div
                className={`display mt-1 text-[15px] ${
                  tie
                    ? tie.match.outcome === 'W'
                      ? 'text-pitch'
                      : 'text-leather'
                    : 'text-moss/50'
                }`}
              >
                {tie ? (tie.match.outcome === 'W' ? 'WON' : 'LOST') : '—'}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Play / finish ── */}
      {!done ? (
        <div className="mt-6 rounded-card border border-gold/25 bg-gold/[0.05] p-4">
          <div className="flex items-center justify-between">
            <span className="label">{nextRound}</span>
            <span className="text-[10.5px] font-bold uppercase tracking-label text-cream">
              v {sideLabel(nextOpponent)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-label text-gold">
            <PitchIcon pitch={nextPitch} size={12} /> {PITCH[nextPitch].label}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-moss">
            {PITCH[nextPitch].note} {starsOf(nextOpponent)[0]} is the one to stop.
          </p>

          {tossWon ? (
            <>
              <p className="display mt-3 text-[15px] text-pitch">YOU WON THE TOSS</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button onClick={() => play(true)} full>
                  Bat first
                </Button>
                <Button variant="secondary" onClick={() => play(false)} full>
                  Bowl first
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="display mt-3 text-[15px] text-leather">TOSS LOST</p>
              <div className="mt-2">
                <Button full onClick={() => play(!favoursBatting(nextPitch))}>
                  They chose · play the tie →
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-6 text-center"
        >
          <h2
            className={`display text-[30px] md:text-[42px] ${
              run.won ? 'text-gold [text-shadow:0_0_40px_rgba(229,168,60,0.4)]' : 'text-cream'
            }`}
          >
            {trophyHeadline(run)}
          </h2>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            <Button size="lg" full onClick={redraw}>
              Enter again · new draw
            </Button>
            <Button size="lg" variant="secondary" full onClick={onExit}>
              Back to result
            </Button>
          </div>
        </motion.div>
      )}

      {/* ── Ties played ── */}
      {run.ties.length > 0 && (
        <div className="mt-8">
          <SectionLabel right={<span className="label">tap for the scorecard</span>}>
            ties played
          </SectionLabel>
          <div className="surface divide-y divide-white/[0.05] px-3.5">
            {run.ties.map((tie) => (
              <MatchRow
                key={tie.round}
                match={tie.match}
                index={0}
                onOpen={() => setOpen(tie.match)}
              />
            ))}
          </div>
        </div>
      )}

      <MatchDrawer
        match={open}
        teamName={teamName}
        onClose={() => setOpen(null)}
        onWatch={(m) => {
          setOpen(null)
          setLive(m)
        }}
      />
    </div>
  )
}
