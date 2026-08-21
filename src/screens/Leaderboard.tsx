import { useState } from 'react'
import { Screen, SectionLabel } from '../components/ui'
import { dailyEntrants, loadLadder, loadStats } from '../data/records'
import { useAsync } from '../data/useAsync'
import { todaysChallenge } from '../data/challenges'

import { FORMAT_ORDER, levelFromPoints, SCORING, titleForLevel, TOURNAMENTS } from '../game/types'
import type { Format } from '../game/types'


/**
 * Ladders, one per tournament.
 *
 * A single board cannot rank a fourteen-game league against a twelve-Test
 * championship: sorted on a raw win column the longer season wins before anyone
 * drafts a player. Each tournament is its own contest and gets its own table,
 * and the scope tabs cut across whichever one you are looking at.
 */
export default function Leaderboard() {
  const [format, setFormat] = useState<Format>('T20L')
  const daily = todaysChallenge()

  const t = TOURNAMENTS[format]
  const board = useAsync(() => loadLadder(format), [format])
  const me = useAsync(() => loadStats(), [])
  const entrants = useAsync(() => dailyEntrants(daily.dateKey), [daily.dateKey])
  const mine = me.data

  const rows = board.data ?? []

  const isTest = format === 'TEST'

  return (
    <Screen>
      <div className="pt-2">
        <span className="label">daily #{daily.number}</span>
        <h1 className="display mt-1 text-[34px] md:text-[46px]">Leaderboard</h1>
        <p className="mt-1.5 text-[12.5px] text-moss">
          {entrants.data === null
            ? "Today's draw is open."
            : entrants.data === 0
              ? "Nobody has played today's draw yet."
              : `${entrants.data.toLocaleString()} ${entrants.data === 1 ? 'player' : 'players'} on today's draw.`}
        </p>
      </div>

      {/* ── Which tournament ── */}
      <div className="mt-5">
        <SectionLabel right={<span className="label">{t.perfect} is perfect</span>}>
          tournament
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {FORMAT_ORDER.map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                format === f
                  ? 'border-pitch/45 bg-pitch/[0.08]'
                  : 'border-white/[0.08] bg-ink-700 hover:border-white/20'
              }`}
            >
              <div className="text-[9px] font-bold uppercase tracking-label text-moss">
                {TOURNAMENTS[f].short}
              </div>
              <div
                className={`mt-0.5 truncate text-[12px] font-extrabold uppercase tracking-[0.03em] ${
                  format === f ? 'text-pitch' : 'text-cream'
                }`}
              >
                {TOURNAMENTS[f].name}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Rows ── */}
      <div className="surface mt-3 divide-y divide-white/[0.05] px-3.5">
        <div className="flex items-center gap-3 py-2 text-[9px] font-bold uppercase tracking-label text-moss/70">
          <span className="w-6 shrink-0">#</span>
          <span className="w-7 shrink-0" />
          <span className="flex-1">player</span>
          <span className="tnum w-16 shrink-0 text-right">runs · wkts</span>
          <span className="w-11 shrink-0 text-right">w–l</span>
          <span className="w-14 shrink-0 text-right">points</span>
        </div>
        {board.loading && (
          <div className="py-8 text-center text-[12px] text-moss">Reading the ladder…</div>
        )}
        {board.error && (
          <div className="py-8 text-center">
            <div className="display text-[15px] text-leather">RAIN DELAY</div>
            <p className="mt-1.5 text-[11px] text-moss">The ladder could not be reached.</p>
          </div>
        )}
        {!board.loading && !board.error && rows.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[12.5px] text-cream-dim">Nobody has played this one yet.</p>
            <p className="mt-1 text-[11px] text-moss">
              Finish a {TOURNAMENTS[format].name} and the board is yours.
            </p>
          </div>
        )}
        {rows.map((r, i) => {
          const you = mine ? r.player === mine.id : false
          // A board built before the view carried career experience has none;
          // a missing level should read as new, not as NaN.
          const level = levelFromPoints(r.xp ?? 0)
          const perfect = r.losses === 0 && r.draws === 0
          return (
            <div
              key={r.player}
              className={`flex items-center gap-3 py-2.5 ${you ? '-mx-2 rounded-lg bg-pitch/[0.08] px-2' : ''}`}
            >
              <span
                className={`tnum w-6 shrink-0 text-[12px] font-black ${
                  i === 0 ? 'text-gold' : i < 3 ? 'text-cream' : 'text-moss'
                }`}
              >
                {i + 1}
              </span>
              <span className="relative shrink-0">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[9px] font-black text-moss">
                  {r.handle.slice(0, 2).toUpperCase()}
                </span>
                <span
                  className={`absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-[3px] text-[8px] font-black ${
                    you ? 'bg-pitch text-ink' : 'bg-ink-600 text-cream-dim'
                  }`}
                  title={`Level ${level} — ${titleForLevel(level)}`}
                >
                  {level}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`truncate text-[13px] font-bold ${you ? 'text-pitch' : 'text-cream'}`}>
                    {r.handle}
                  </span>
                  {perfect && (
                    <span className="shrink-0 rounded border border-gold/40 bg-gold/10 px-1 text-[7.5px] font-black uppercase tracking-label text-gold">
                      perfect
                    </span>
                  )}
                </div>
                <div className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-moss">
                  {titleForLevel(level)}
                </div>
              </div>
              <span className="tnum w-16 shrink-0 text-right text-[10.5px] font-bold text-moss">
                {r.runs.toLocaleString()} · {r.wickets}
              </span>
              <span className="tnum w-11 shrink-0 text-right text-[12px] font-bold text-cream-dim">
                {r.wins}–{r.losses}
                {isTest ? `–${r.draws}` : ''}
              </span>
              <span className="stat-num w-14 shrink-0 text-right text-[17px] text-cream">
                {r.points.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>

      {mine && !mine.drafts && (
        <p className="mt-4 text-center text-[11px] text-moss">
          Play a {TOURNAMENTS[format].name} to take your place on this ladder.
        </p>
      )}

      <div className="mt-8">
        <SectionLabel>how ranking works</SectionLabel>
        <p className="text-[11.5px] leading-relaxed text-moss">
          Every tournament keeps its own ladder, because a fourteen-game league and a twelve-Test
          championship are not the same achievement and should not share a win column.
          <br />
          <br />
          Within a board you are ranked on <strong className="text-cream-dim">points</strong>:{' '}
          {t.pointsWin === 12 ? '100 a win and 35 a draw' : '100 a win'}, plus{' '}
          {SCORING[format].perRun} a run scored and {SCORING[format].perWicket} a wicket taken. Runs
          count for less in the longer formats, so a par innings is worth about the same in a Test
          as in a T20 and nobody out-ranks anybody merely for playing a longer game. Results still
          decide most of it — runs and wickets separate sides that won the same number, and settle
          the ties a win column cannot.
          <br />
          <br />
          Every row is a season somebody actually played. Results are stored with the seed and the
          eleven that produced them, and the simulation is deterministic, so any run on this board
          can be recomputed and checked.
        </p>
      </div>
    </Screen>
  )
}
