import { useId } from 'react'

/**
 * A two-handled year range.
 *
 * Built from a pair of native range inputs stacked on one track rather than
 * from pointer maths, so it arrives with keyboard support, touch handling and
 * screen-reader labels already working. The inputs are transparent and only
 * their thumbs take pointer events; everything you can see is the track drawn
 * underneath them.
 */
export function YearRange({
  min,
  max,
  value,
  onChange,
}: {
  min: number
  max: number
  value: [number, number]
  onChange: (next: [number, number]) => void
}) {
  const id = useId()
  const [from, to] = value
  const span = Math.max(1, max - min)
  const pct = (year: number) => ((year - min) / span) * 100

  // Handles must not cross: each pushes against the other rather than through it.
  const setFrom = (n: number) => onChange([Math.min(n, to), to])
  const setTo = (n: number) => onChange([from, Math.max(n, from)])

  const thumb =
    'pointer-events-none absolute inset-0 h-9 w-full appearance-none bg-transparent ' +
    '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 ' +
    '[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none ' +
    '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 ' +
    '[&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-pitch ' +
    '[&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.5)] ' +
    '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 ' +
    '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full ' +
    '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink ' +
    '[&::-moz-range-thumb]:bg-pitch [&::-moz-range-track]:bg-transparent ' +
    'focus:outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 ' +
    'focus-visible:[&::-webkit-slider-thumb]:ring-pitch/60'

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="tnum stat-num text-[19px] text-cream">{from}</span>
        <span className="text-[10px] font-bold uppercase tracking-label text-moss">
          {from === to ? 'one season' : `${to - from + 1} years`}
        </span>
        <span className="tnum stat-num text-[19px] text-cream">{to}</span>
      </div>

      <div className="relative mt-1.5 h-9">
        {/* The track, and the stretch of it that is selected. */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/[0.09]" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-pitch/70"
          style={{ left: `${pct(from)}%`, right: `${100 - pct(to)}%` }}
        />
        <input
          type="range"
          aria-label="Earliest year"
          id={`${id}-from`}
          min={min}
          max={max}
          value={from}
          onChange={(e) => setFrom(Number(e.target.value))}
          className={thumb}
        />
        <input
          type="range"
          aria-label="Latest year"
          id={`${id}-to`}
          min={min}
          max={max}
          value={to}
          onChange={(e) => setTo(Number(e.target.value))}
          className={thumb}
        />
      </div>

      <div className="flex justify-between text-[9.5px] font-bold uppercase tracking-label text-moss/70">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}
