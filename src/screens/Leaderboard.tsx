import { useState } from 'react'
import { Screen, SectionLabel } from '../components/ui'
import { dailyEntrants, loadBoard, loadDaily, loadStats, startOfToday } from '../data/records'
import type { LadderRow } from '../data/records'
import { useAsync } from '../data/useAsync'
import { todaysChallenge } from '../data/challenges'

import { FORMAT_ORDER, levelFromPoints, SCORING, titleForLevel, TOURNAMENTS } from '../game/types'
import type { Format } from '../game/types'


/** A pill switch, used for both the board and the period. */
function Switch<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: T; label: string }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-ink-800 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`flex-1 rounded-lg px-3 py-2 text-[10.5px] font-bold uppercase tracking-label transition-colors ${
            value === o.key ? 'bg-white/[0.09] text-cream' : 'text-moss hover:text-cream-dim'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Two different contests, kept apart.
 *
 * The daily is one fixed draw everybody gets, so it is only ever a question of
 * who did best with it *today* — a lifetime daily board would rank people on
 * how many days they had shown up. The tournaments are the opposite: you pick
 * your own squads, so a best-ever board is the real measure, with today's
 * runs available for anyone who wants a race they can still enter.
 *
 * They used to share one screen, which read as though the daily line described
 * the ladder underneath it.
 */
export default function Leaderboard() {
  const [board, setBoard] = useState<'TOURNAMENT' | 'DAILY'>('TOURNAMENT')
  const [format, setFormat] = useState<Format>('T20L')
  const [period, setPeriod] = useState<'ALLTIME' | 'TODAY'>('ALLTIME')
  const daily = todaysChallenge()

  const t = TOURNAMENTS[format]
  // The daily runs whichever format today's draw is, not whichever tab is open.
  const active: Format = board === 'DAILY' ? daily.format : format
  const ladder = useAsync(
    () => loadBoard(format, period === 'TODAY' ? startOfToday() : null),
    [format, period],
  )
  const todays = useAsync(
    () => loadDaily(daily.dateKey) as Promise<LadderRow[]>,
    [daily.dateKey],
  )
  const me = useAsync(() => loadStats(), [])
  const entrants = useAsync(() => dailyEntrants(daily.dateKey), [daily.dateKey])
  const mine = me.data

  const showing = board === 'DAILY' ? todays : ladder
  const rows = showing.data ?? []

  const isTest = board === 'DAILY' ? daily.format === 'TEST' : format === 'TEST'

  return (
    <Screen>
      <div className="pt-2">
        <h1 className="display mt-1 text-[34px] md:text-[46px]">Leaderboard</h1>
        <p className="mt-1.5 text-[12.5px] text-moss">
          {board === 'DAILY'
            ? entrants.data
              ? `${entrants.data.toLocaleString()} ${entrants.data === 1 ? 'player' : 'players'} on today's draw — daily #${daily.number}.`
              : `Nobody has played today's draw yet — daily #${daily.number}.`
            : period === 'TODAY'
              ? 'The best tournament seasons played today, ranked on points.'
              : 'Your best season in each tournament, ranked on points.'}
        </p>
      </div>

      <div className="mt-4">
        <Switch
          options={[
            { key: 'TOURNAMENT', label: 'Tournaments' },
            { key: 'DAILY', label: "Today's daily" },
          ]}
          value={board}
          onChange={setBoard}
        />
      </div>

      {/* ── Which tournament ── */}
      <div className={`mt-5 ${board === 'DAILY' ? 'hidden' : ''}`}>
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

      {board === 'TOURNAMENT' && (
        <div className="mt-2.5">
          <Switch
            options={[
              { key: 'ALLTIME', label: 'All-time' },
              { key: 'TODAY', label: 'Today' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </div>
      )}

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
        {showing.loading && (
          <div className="py-8 text-center text-[12px] text-moss">Reading the ladder…</div>
        )}
        {showing.error && (
          <div className="py-8 text-center">
            <div className="display text-[15px] text-leather">RAIN DELAY</div>
            <p className="mt-1.5 text-[11px] text-moss">The ladder could not be reached.</p>
          </div>
        )}
        {!showing.loading && !showing.error && rows.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[12.5px] text-cream-dim">
              {board === 'DAILY'
                ? "Nobody has played today's draw yet."
                : period === 'TODAY'
                  ? `No ${TOURNAMENTS[format].name} played today.`
                  : 'Nobody has played this one yet.'}
            </p>
            <p className="mt-1 text-[11px] text-moss">
              {board === 'DAILY'
                ? 'Be the first, and the day is yours.'
                : `Finish a ${TOURNAMENTS[format].name} and the board is yours.`}
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
          {board === 'DAILY'
            ? "Play today's draw to take your place on it."
            : `Play a ${TOURNAMENTS[format].name} to take your place on this ladder.`}
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
          {TOURNAMENTS[active].pointsWin === 12 ? '100 a win and 35 a draw' : '100 a win'}, plus{' '}
          {SCORING[active].perRun} a run scored and {SCORING[active].perWicket} a wicket taken. Runs
          count for less in the longer formats, so a par innings is worth about the same in a Test
          as in a T20 and nobody out-ranks anybody merely for playing a longer game. Results still
          decide most of it — runs and wickets separate sides that won the same number, and settle
          the ties a win column cannot.
          <br />
          <br />
          The daily keeps a board of its own, and only for the day it belongs to. Everybody drafts
          from the same squads on a daily, so it asks who read one shared draw best — and ranking a
          lifetime of them would reward turning up rather than drafting well. Tournament boards work
          the other way: you choose your own squads, so your best season stands, with today's runs
          there for a race that is still open.
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
