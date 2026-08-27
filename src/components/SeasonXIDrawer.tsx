import { useEffect, useState } from 'react'
import { SheetDrawer } from './TeamSheet'
import { ROLE_STYLE } from './roles'
import { loadSeasonXI } from '../data/records'
import type { SeasonXI } from '../data/records'
import { PRESETS, RATING_MODE, TOURNAMENTS } from '../game/types'
import type { Role } from '../game/types'

/**
 * Somebody else's season, opened from the ladder.
 *
 * Every result has carried its eleven since the first one was saved and
 * nothing ever showed it, so a row on a leaderboard was a name and a number
 * and no answer to the only question a leaderboard actually raises — how did
 * they get that. Fetched when it is opened rather than with the board, because
 * fifty elevens nobody asked for is fifty elevens of nothing.
 */
export function SeasonXIDrawer({
  id,
  handle,
  onClose,
}: {
  id: string | null
  handle: string
  onClose: () => void
}) {
  /*
   * Keyed by which season was asked for rather than cleared on the way in, so
   * opening one does not need a synchronous state change before the fetch —
   * which is a render thrown away, and on a drawer that is a visible flicker.
   */
  const [got, setGot] = useState<{ id: string; season: SeasonXI | null } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const season = id && got?.id === id ? got.season : null
  const state: 'idle' | 'loading' | 'failed' = !id
    ? 'idle'
    : failed === id
      ? 'failed'
      : got?.id === id
        ? 'idle'
        : 'loading'

  useEffect(() => {
    if (!id || got?.id === id || failed === id) return
    let live = true
    loadSeasonXI(id)
      .then((s) => live && setGot({ id, season: s }))
      .catch(() => live && setFailed(id))
    return () => {
      live = false
    }
  }, [id, got, failed])

  const t = season && TOURNAMENTS[season.format]
  const preset = season && PRESETS.find((p) => p.id === season.presetId)

  return (
    <SheetDrawer open={!!id} onClose={onClose} title={season?.teamName || handle}>
      {state === 'loading' && (
        <p className="py-8 text-center text-[12px] text-moss">Reading the team sheet…</p>
      )}
      {state === 'failed' && (
        <p className="py-8 text-center text-[12px] text-moss">That season could not be read.</p>
      )}

      {season && (
        <>
          {/* ── What it was and what it did ── */}
          <div className="pitch-panel px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="label truncate">
                {handle} · {t?.name}
              </span>
              <span className="label shrink-0">
                {new Date(season.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </div>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <div>
                <div
                  className={`display text-[20px] ${
                    season.perfect
                      ? 'text-gold'
                      : season.outcome === 'CHAMPIONS'
                        ? 'text-pitch'
                        : 'text-cream'
                  }`}
                >
                  {season.outcome}
                </div>
                <div className="tnum mt-0.5 text-[12px] font-bold text-cream-dim">
                  {season.wins}–{season.losses}
                  {season.format === 'TEST' ? `–${season.draws}` : ''}
                  <span className="ml-2 text-[11px] font-semibold text-moss">
                    {season.runs.toLocaleString()} runs · {season.wickets} wkts
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="stat-num block text-[24px] leading-none text-cream">
                  {season.points.toLocaleString()}
                </span>
                <span className="label">points</span>
              </div>
            </div>

            {/* The settings are the handicap, and a score means nothing without
                them: an easy draft over one decade is not a hard one over all. */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[
                preset?.name ?? season.presetId,
                RATING_MODE[season.ratingMode as 'SEASON' | 'PRIME']?.label ?? season.ratingMode,
                season.difficulty,
                season.fromYear && season.toYear
                  ? `${season.fromYear}–${season.toYear}`
                  : 'All-time',
              ].map((chip) => (
                <span
                  key={chip}
                  className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] font-black uppercase tracking-label text-moss"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          {/* ── The eleven ── */}
          <div className="mt-4">
            <span className="label-lg">the eleven</span>
            {season.xi.length === 0 ? (
              <p className="mt-2 text-[11.5px] leading-snug text-moss">
                This season was played before the game started keeping team sheets, so the eleven
                behind it was never recorded.
              </p>
            ) : (
              <div className="surface mt-2 divide-y divide-white/[0.05] px-3.5">
                {season.xi.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <span className="tnum w-5 shrink-0 text-[11px] font-black text-moss">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-bold text-cream">{p.n}</div>
                      <div className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-moss">
                        {p.s}
                      </div>
                    </div>
                    {(() => {
                      const tone = ROLE_STYLE[p.r as Role]
                      return (
                        <span
                          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-label ${
                            tone ? `${tone.border} ${tone.bg} ${tone.text}` : 'border-white/10 bg-white/[0.04] text-moss'
                          }`}
                        >
                          {p.r}
                        </span>
                      )
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </SheetDrawer>
  )
}
