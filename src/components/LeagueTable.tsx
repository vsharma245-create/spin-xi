import type { TableRow } from '../game/types'

/**
 * The table, used both at the end of the league stage and on the result screen.
 * The dashed line is the qualification cut — the single most important thing on
 * the screen, because it is what decides whether there is any more cricket.
 */
export function LeagueTable({
  rows,
  cutoff,
  draws,
  limit,
}: {
  rows: TableRow[]
  cutoff: number
  /** Test cricket has a draws column; the white-ball formats do not. */
  draws?: boolean
  /** Show only the top N plus your own row, for tighter spaces. */
  limit?: number
}) {
  const shown = limit
    ? rows.filter((r, i) => i < limit || r.us)
    : rows

  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3.5 py-2 text-[9px] font-black uppercase tracking-label text-moss">
        <span className="w-4 shrink-0">#</span>
        <span className="flex-1">team</span>
        <span className="w-8 shrink-0 text-right">w</span>
        {draws && <span className="w-8 shrink-0 text-right">d</span>}
        <span className="w-8 shrink-0 text-right">l</span>
        <span className="w-9 shrink-0 text-right">pts</span>
        <span className="w-12 shrink-0 text-right">nrr</span>
      </div>
      {shown.map((row) => {
        const place = rows.indexOf(row) + 1
        return (
          <div
            key={row.name}
            className={`flex items-center gap-2 px-3.5 py-2 ${row.us ? 'bg-pitch/[0.09]' : ''} ${
              place === cutoff ? 'border-b border-dashed border-gold/30' : ''
            }`}
          >
            <span className="tnum w-4 shrink-0 text-[10px] font-black text-moss">{place}</span>
            <span
              className={`flex-1 truncate text-[11.5px] font-bold uppercase tracking-[0.02em] ${
                row.us ? 'text-pitch' : 'text-cream-dim'
              }`}
            >
              {row.name}
              {row.us && <span className="ml-1.5 text-[8.5px] text-moss">you</span>}
            </span>
            <span className="tnum w-8 shrink-0 text-right text-[11px] font-bold text-cream">
              {row.wins}
            </span>
            {draws && (
              <span className="tnum w-8 shrink-0 text-right text-[11px] font-bold text-gold">
                {row.draws}
              </span>
            )}
            <span className="tnum w-8 shrink-0 text-right text-[11px] font-bold text-moss">
              {row.losses}
            </span>
            <span className="tnum w-9 shrink-0 text-right text-[11px] font-black text-cream">
              {row.points}
            </span>
            <span
              className={`tnum w-12 shrink-0 text-right text-[10px] font-bold ${
                row.nrr >= 0 ? 'text-pitch/80' : 'text-leather/80'
              }`}
            >
              {row.nrr > 0 ? '+' : ''}
              {row.nrr.toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
