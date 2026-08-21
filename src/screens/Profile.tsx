import { motion } from 'framer-motion'
import { useState } from 'react'
import { Button, Divider, Screen, SectionLabel, StatCard } from '../components/ui'
import { ACHIEVEMENTS } from '../data/leaderboard'
import { bandForRating, levelProgressOf, ratingOf, titleForLevel } from '../game/types'
import { loadHistory, loadSplits, loadStats } from '../data/records'
import type { Split } from '../data/records'
import type { Format } from '../game/types'
import { useAsync } from '../data/useAsync'
import { identity, signOut } from '../data/account'
import { ClaimAccount } from '../components/ClaimAccount'
import { HandleEditor } from '../components/HandleEditor'
import { FORMAT_ORDER, TOURNAMENTS } from '../game/types'

/**
 * One slice of a career — a tournament, a rating mode, a difficulty.
 *
 * Shown as its own line rather than folded into a career total, because the
 * totals hid what they were made of: a hundred wins says nothing about whether
 * they came in T20 leagues on Easy or Test championships with the ratings
 * hidden.
 */
function Breakdown({
  title,
  note,
  rows,
}: {
  title: string
  note?: string
  rows: { key: string; label: string; sub?: string; tally: Split | null }[]
}) {
  const played = rows.filter((r) => (r.tally?.drafts ?? 0) > 0)
  if (!played.length) return null
  return (
    <div className="mt-7">
      <SectionLabel right={note ? <span className="label">{note}</span> : undefined}>
        {title}
      </SectionLabel>
      <div className="surface divide-y divide-white/[0.05] px-3.5">
        <div className="flex items-center gap-2 py-2 text-[9px] font-bold uppercase tracking-label text-moss/70">
          <span className="flex-1" />
          <span className="tnum w-8 text-right">runs</span>
          <span className="tnum w-14 text-right">w–l</span>
          <span className="tnum w-8 text-right">cups</span>
          <span className="tnum w-16 text-right">runs · wkts</span>
          <span className="tnum w-14 text-right">best pts</span>
        </div>
        {played.map((r) => (
          <div key={r.key} className="flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-extrabold uppercase tracking-[0.03em] text-cream">
                {r.label}
              </div>
              {r.sub && (
                <div className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-moss">
                  {r.sub}
                </div>
              )}
            </div>
            <span className="tnum w-8 text-right text-[12px] font-bold text-cream-dim">
              {r.tally!.drafts}
            </span>
            <span className="tnum w-14 text-right text-[12px] font-bold">
              <span className="text-pitch">{r.tally!.wins}</span>
              <span className="text-moss">–</span>
              <span className="text-leather">{r.tally!.losses}</span>
            </span>
            <span className="tnum w-8 text-right text-[12px] font-bold text-gold">
              {r.tally!.trophies}
            </span>
            <span className="tnum w-16 text-right text-[10.5px] font-bold text-moss">
              {r.tally!.runs.toLocaleString()} · {r.tally!.wickets}
            </span>
            <span className="tnum w-14 text-right text-[13px] font-black text-cream">
              {r.tally!.best_points.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Profile() {
  const stats = useAsync(() => loadStats(), [])
  // Held here so a rename shows immediately, rather than after a refetch.
  const [renamed, setRenamed] = useState<string | null>(null)

  /*
   * Signing out is only offered once Google is attached, because for a guest
   * it would not be signing out — the token in this browser is the only thing
   * that identifies the record, and dropping it destroys the career rather
   * than parking it. A full reload rather than a state reset: every screen
   * holds something read as the previous player, and the cheapest way to be
   * certain none of it survives is to start the app again.
   */
  const leave = () => {
    signOut()
    window.location.href = '/'
  }
  const splits = useAsync(() => loadSplits(), [])
  const history = useAsync(() => loadHistory(20), [])
  const who = useAsync(() => identity(), [])

  const p = stats.data
  const lvl = levelProgressOf(p?.xp ?? 0)
  const rating = ratingOf(
    (history.data ?? []).map((h) => ({
      format: h.format,
      points: h.points,
      index: h.idx,
      at: h.created_at,
    })),
  )

  /**
   * A streak is consecutive days with a daily played, counted back from the
   * most recent. Derived rather than stored: a stored counter and the entries
   * it counts drift apart the first time a write fails.
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

  /** Pull one cut out of the splits, in the order the screen wants to show it. */
  const cut = (kind: Split['kind'], keys: string[]) =>
    keys.map((key) => ({
      key,
      tally: (splits.data ?? []).find((s) => s.kind === kind && s.key === key) ?? null,
    }))

  if (stats.loading) {
    return (
      <Screen>
        <div className="grid min-h-[50vh] place-items-center text-[12.5px] text-moss">
          Finding your record…
        </div>
      </Screen>
    )
  }

  if (!p) {
    return (
      <Screen>
        <div className="grid min-h-[50vh] place-items-center px-6 text-center">
          <div>
            <div className="display text-[19px] text-leather">RAIN DELAY</div>
            <p className="mt-2 text-[12px] leading-relaxed text-moss">
              Your record could not be reached. It is safe — it lives on the server, not on this
              device.
            </p>
          </div>
        </div>
      </Screen>
    )
  }

  const shown = renamed ?? p.handle

  const unlocked: Record<string, boolean> = {
    firstDraft: p.drafts >= 1,
    champion: p.trophies >= 1,
    perfect: p.perfect_runs >= 1,
    streak7: streak >= 7,
    ten: p.drafts >= 10,
    allTime: p.wins >= 50,
  }

  return (
    <Screen>
      {/* ── Identity ── */}
      <div className="pt-2">
        <div className="flex items-center gap-3.5">
          <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-pitch/25 bg-pitch/[0.07]">
            <span className="display text-[22px] text-pitch">{shown.slice(0, 2).toUpperCase()}</span>
            {/* The level, worn on the badge — it is the one number that sums up
                everything below it. */}
            <span className="absolute -bottom-2 -right-2 grid h-7 min-w-7 place-items-center rounded-full border-2 border-ink bg-pitch px-1 text-[12px] font-black text-ink">
              {lvl.level}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <HandleEditor handle={shown} onRenamed={setRenamed} />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-label text-cream-dim">
                {titleForLevel(lvl.level)}
              </span>
              {streak > 0 && (
                <span className="rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-label text-gold">
                  🔥 {streak} day streak
                </span>
              )}
            </div>
          </div>
        </div>

        {/* level bar */}
        <div className="mt-4">
          <div className="mb-1 flex justify-between">
            <span className="label">level {lvl.level}</span>
            <span className="label">
              {lvl.into.toLocaleString()} / {lvl.needed.toLocaleString()} xp
            </span>
          </div>
          <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
            <motion.div
              className="h-full rounded-full bg-pitch"
              initial={{ width: 0 }}
              animate={{ width: `${lvl.fraction * 100}%` }}
              transition={{ type: 'spring', stiffness: 160, damping: 26 }}
            />
          </div>
        </div>
      </div>

      {/* ── Whose record this is ──
          Shown above everything it protects, because the numbers below are
          exactly what is at stake. */}
      {who.data?.anonymous === true && (
        <div className="mt-6">
          <ClaimAccount drafts={p.drafts} level={lvl.level} returnTo="/profile" />
        </div>
      )}
      {who.data?.anonymous === false && (
        <div className="mt-6 flex items-center gap-2.5 rounded-card border border-pitch/25 bg-pitch/[0.05] px-3.5 py-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pitch/20 text-[11px] text-pitch">
            ✓
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-pitch">
              Record saved
            </div>
            <div className="truncate text-[10.5px] text-moss">
              {who.data.email ?? 'Signed in'} — sign in with Google on any device to pick it up.
            </div>
          </div>
          <button
            onClick={leave}
            className="ml-auto shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-label text-moss transition-colors hover:border-leather/40 hover:text-leather"
          >
            Sign out
          </button>
        </div>
      )}

      {/* ── Rating ──
          Separate from the level on purpose. The level says how much has been
          played and only rises; this says how well, and moves both ways. */}
      <div className="surface mt-6 px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="label">match rating</span>
            <div className="flex items-baseline gap-2">
              <span className="stat-num text-[38px] leading-none text-cream">{rating.value}</span>
              <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-pitch">
                {bandForRating(rating.value)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="label">level</span>
            <div className="stat-num text-[26px] leading-none text-cream-dim">{lvl.level}</div>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-moss">
          {rating.provisional ? (
            <>
              Provisional — {rating.toEstablish} more season
              {rating.toEstablish === 1 ? '' : 's'} before it settles. Your rating is the average of
              your best eight seasons out of the last twenty, scored against par for whichever
              tournament each was played in. It rewards how well you draft rather than how often,
              and it can go down.
            </>
          ) : (
            <>
              The average of your best eight seasons out of the last twenty, scored against par for
              whichever tournament each was played in — 1000 is par, and every 100 is a standard
              deviation. It rewards how well you draft rather than how often, and unlike your level
              it can go down.
            </>
          )}
        </p>
      </div>

      {/* ── Career ── */}
      <div className="mt-6 grid grid-cols-3 gap-2">
        <StatCard label="drafts" value={p.drafts} />
        <StatCard label="wins" value={p.wins} accent="pitch" />
        <StatCard label="trophies" value={p.trophies} accent="gold" />
        <StatCard label="perfect runs" value={p.perfect_runs} accent="gold" />
        <StatCard label="best run" value={p.best_wins ? `${p.best_wins} wins` : "—"} />
        <StatCard label="dailies" value={dailies.length} />
        <StatCard label="career xp" value={p.xp.toLocaleString()} accent="pitch" />
        <StatCard label={`to level ${lvl.level + 1}`} value={lvl.toNext.toLocaleString()} />
      </div>

      <Breakdown
        title="by tournament"
        note="each is its own contest"
        rows={cut('format', [...FORMAT_ORDER]).map(({ key, tally }) => ({
          key,
          label: TOURNAMENTS[key as Format].name,
          sub: `${TOURNAMENTS[key as Format].perfect} is perfect`,
          tally,
        }))}
      />

      <Breakdown
        title="by player ratings"
        note="season form or career peak"
        rows={cut('rating_mode', ['SEASON', 'PRIME']).map(({ key, tally }) => ({
          key,
          label: key === 'SEASON' ? 'Season form' : 'Prime',
          sub:
            key === 'SEASON'
              ? 'rated for the season on the card'
              : 'every player at their peak, opponents too',
          tally,
        }))}
      />

      <Breakdown
        title="by difficulty"
        note="re-rolls and hidden ratings"
        rows={cut('difficulty', ['EASY', 'NORMAL', 'HARD']).map(({ key, tally }) => ({
          key,
          label: key.charAt(0) + key.slice(1).toLowerCase(),
          sub:
            key === 'EASY' ? '5 re-rolls' : key === 'NORMAL' ? '3 re-rolls' : 'no re-rolls, ratings hidden',
          tally,
        }))}
      />

      {/* ── Recent ── */}
      <div className="mt-8">
        <SectionLabel right={<span className="label">last {(history.data ?? []).length}</span>}>
          recent drafts
        </SectionLabel>
        {(history.data ?? []).length === 0 ? (
          <div className="surface px-4 py-8 text-center">
            <p className="text-[12.5px] text-moss">No drafts yet.</p>
            <div className="mx-auto mt-4 max-w-[220px]">
              <Button to="/play" full>
                Start your first draft
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            {(history.data ?? []).slice(0, 6).map((r) => (
              <div key={r.id} className="surface flex items-center gap-3 px-3.5 py-3">
                <span
                  className={`grid h-10 w-12 shrink-0 place-items-center rounded-lg border text-[13px] font-black ${
                    r.perfect
                      ? 'border-gold/40 bg-gold/12 text-gold'
                      : r.outcome === 'CHAMPIONS'
                        ? 'border-pitch/40 bg-pitch/12 text-pitch'
                        : 'border-white/10 bg-white/[0.03] text-cream-dim'
                  }`}
                >
                  {r.wins}–{r.losses}
                  {r.draws ? `–${r.draws}` : ''}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-extrabold uppercase tracking-[0.03em] text-cream">
                    {r.team_name} · {r.outcome}
                  </div>
                  <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-moss">
                    {TOURNAMENTS[r.format]?.short ?? r.format} · {r.points.toLocaleString()} pts ·{' '}
                    {r.mode === 'daily' ? 'daily' : 'quick draft'}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-bold text-moss">
                  {new Date(r.created_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Achievements ── */}
      <Divider label="achievements" />
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {ACHIEVEMENTS.map((a) => {
          const on = unlocked[a.key]
          return (
            <div
              key={a.key}
              className={`flex flex-col items-center rounded-card border px-2 py-3 text-center ${
                on ? 'border-pitch/30 bg-pitch/[0.06]' : 'border-white/[0.06] bg-ink-800 opacity-45'
              }`}
              title={a.hint}
            >
              <span className={`text-[19px] ${on ? 'text-pitch' : 'text-moss'}`}>{a.icon}</span>
              <span className="mt-1.5 text-[8.5px] font-bold uppercase leading-tight tracking-label text-cream-dim">
                {a.name}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[10.5px] leading-snug text-moss">
        {who.data?.anonymous === false
          ? 'Your record is on the server and follows your Google sign-in to any device.'
          : 'Your record is on the server, but this browser is the only thing that can reach it until you connect Google.'}
      </p>
    </Screen>
  )
}
