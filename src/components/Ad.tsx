import { useEffect, useRef, useState } from 'react'
import { AD_CLIENT } from './ads'

/**
 * A paid slot, and the machinery for keeping it out of the way.
 *
 * Three rules hold this together, and all three exist because an ad script is
 * a stranger's code running inside a game people came here to play.
 *
 * It is off unless configured. With no publisher id in the environment nothing
 * renders, nothing is fetched and no third party learns that anybody visited —
 * which is also what the privacy policy says while that is true.
 *
 * It is never on the critical path. The archive already costs a second on a
 * cold load and the whole point of the last round of work was getting that
 * down from sixteen; a blocking script from an ad network would hand it
 * straight back. The library is not requested until a slot is close enough to
 * being seen to be worth loading, and never before the game itself is up.
 *
 * It reserves its own space. An ad that arrives late and pushes the page down
 * under someone's thumb is how a reader loses their place and a player loses a
 * tap, so the box is the right size before anything fills it.
 */

const CLIENT = AD_CLIENT

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/* ── The library, fetched once and only when something needs it ──────────── */

let loading: Promise<void> | null = null

function library(): Promise<void> {
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    if (!CLIENT) return reject(new Error('no publisher id'))
    const tag = document.createElement('script')
    tag.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`
    tag.async = true
    tag.crossOrigin = 'anonymous'
    tag.onload = () => resolve()
    // Blocked by an extension, a network, or a country. Not an error worth
    // showing anybody: the game does not need it to work.
    tag.onerror = () => reject(new Error('blocked'))
    document.head.appendChild(tag)
  })
  return loading
}

/* ── The slot ────────────────────────────────────────────────────────────── */

export type AdShape = 'banner' | 'panel'

/** Reserved heights, so nothing moves when the ad lands. */
const SHAPE: Record<AdShape, { min: number; format: string; full: boolean }> = {
  // Wide and short — under a headline, between sections.
  banner: { min: 100, format: 'horizontal', full: true },
  // Squarer, for a column or the foot of a page.
  panel: { min: 250, format: 'auto', full: true },
}

export function Ad({
  slot,
  shape = 'banner',
  className = '',
}: {
  /** The ad unit's id from the AdSense dashboard. Without one, nothing shows. */
  slot: string | undefined
  shape?: AdShape
  className?: string
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const ins = useRef<HTMLModElement | null>(null)
  const filled = useRef(false)
  // No observer to wait on means nothing to wait for.
  const [state, setState] = useState<'idle' | 'ready' | 'gone'>(() =>
    typeof IntersectionObserver === 'undefined' ? 'ready' : 'idle',
  )

  /* Wait until the slot is near the viewport before fetching anything. */
  useEffect(() => {
    if (!CLIENT || !slot) return
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        watch.disconnect()
        setState('ready')
      },
      // A screen and a half of warning, so it is filled by the time it arrives.
      { rootMargin: '600px 0px' },
    )
    watch.observe(el)
    return () => watch.disconnect()
  }, [slot])

  /* Load, then hand the slot to the network exactly once. */
  useEffect(() => {
    if (state !== 'ready' || filled.current) return
    let live = true
    library()
      .then(() => {
        if (!live || filled.current || !ins.current) return
        filled.current = true
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      })
      .catch(() => {
        // Nothing to show and no reason to hold the space open for it.
        if (live) setState('gone')
      })
    return () => {
      live = false
    }
  }, [state])

  /*
   * An unfilled slot is an empty box with a label on it. AdSense marks its own
   * failures, so the space is given back rather than left as a hole in the
   * page where an advert did not turn up.
   */
  useEffect(() => {
    if (state !== 'ready' || !ins.current) return
    const el = ins.current
    const watch = new MutationObserver(() => {
      if (el.getAttribute('data-ad-status') === 'unfilled') setState('gone')
    })
    watch.observe(el, { attributes: true, attributeFilter: ['data-ad-status'] })
    return () => watch.disconnect()
  }, [state])

  if (!CLIENT || !slot || state === 'gone') return null

  const { min, format, full } = SHAPE[shape]

  return (
    <div ref={box} className={`my-6 ${className}`}>
      {/* Said plainly. A slot that looks like part of the game is a slot that
          gets tapped by mistake, which is bad for the player and, in the end,
          bad for the account. */}
      <div className="mb-1 text-center text-[9px] font-black uppercase tracking-label text-moss/45">
        advertisement
      </div>
      <div
        className="overflow-hidden rounded-card border border-white/[0.05] bg-white/[0.015]"
        style={{ minHeight: min }}
      >
        <ins
          ref={ins}
          className="adsbygoogle"
          style={{ display: 'block', minHeight: min }}
          data-ad-client={CLIENT}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive={full ? 'true' : 'false'}
        />
      </div>
    </div>
  )
}
