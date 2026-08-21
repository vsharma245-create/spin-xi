import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { linkGoogle, signInWithGoogle, takeAuthFailure } from '../data/account'
import type { AuthFailure } from '../data/account'

/** Google's mark, drawn rather than fetched — one less network request, and it
 *  renders identically offline and on every platform. */
function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.2-5.3C29.8 34.9 27 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.2 5.3C39.1 35.9 44 30.6 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  )
}

/**
 * Turning a record into something a person can actually keep.
 *
 * An anonymous account is a token in one browser: clear it, switch devices, or
 * let Safari's week-long storage eviction run, and a career is gone with
 * nothing to recover it to. This is the only way out of that, so it appears
 * once somebody has something worth losing rather than in front of a game they
 * have not played yet — the answer to "why bother?" has to be visible before
 * the question is asked.
 */
export function ClaimAccount({
  drafts,
  level,
  returnTo,
  compact = false,
}: {
  drafts: number
  level: number
  /** Where Google should send them back to. */
  returnTo?: string
  /** A quieter version for the profile, where the prompt is not the point. */
  compact?: boolean
}) {
  const [busy, setBusy] = useState<'claim' | 'signin' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Set when Google is already spoken for and there are seasons here to lose. */
  const [collision, setCollision] = useState(false)

  /*
   * Coming back from Google without finishing — cancelling, or the back
   * button — restores this component exactly as it was left, which meant a
   * button reading "Taking you to Google…" and permanently disabled. The page
   * is restored rather than reloaded, so nothing else resets it.
   */
  /*
   * Something that went wrong on the way back from Google, reported here
   * because this is the only place the player can act on it. It used to reach
   * a console warning and stop there, so a failed sign-in looked exactly like
   * never having pressed the button.
   */
  useEffect(() => {
    // Synchronising with an external system is exactly what this is: the slot
    // holding the redirect outcome is filled before React mounts anything.
    const failure = takeAuthFailure()
    // oxlint-disable-next-line react/set-state-in-effect
    if (failure) setError(failure.message)
  }, [])

  useEffect(() => {
    const wake = () => setBusy(null)
    window.addEventListener('pageshow', wake)
    window.addEventListener('focus', wake)
    return () => {
      window.removeEventListener('pageshow', wake)
      window.removeEventListener('focus', wake)
    }
  }, [])

  const go = async (what: 'claim' | 'signin') => {
    setBusy(what)
    setError(null)
    setCollision(false)
    try {
      if (what === 'claim') await linkGoogle(returnTo)
      else signInWithGoogle(returnTo)
    } catch (err) {
      const failure = err as AuthFailure
      /*
       * The Google account is already attached to a record. That is not an
       * error from where the player is standing — it is the ordinary case of
       * somebody returning on a new device, and the button they pressed is
       * the one they were always going to press. So finish the job: open the
       * record they meant.
       *
       * Unless there is something in this browser worth keeping. Signing in
       * swaps to the other account, and seasons played here as a guest do not
       * come with it, so that is a choice to put in front of them rather than
       * make on their behalf.
       */
      if (failure.taken && drafts === 0) {
        signInWithGoogle(returnTo)
        return
      }
      if (failure.taken) {
        setCollision(true)
      } else {
        setError(failure.message)
      }
      setBusy(null)
    }
  }

  return (
    <div
      className={`rounded-card border border-gold/30 bg-gold/[0.06] ${compact ? 'px-3.5 py-3.5' : 'px-4 py-4'}`}
    >
      <span className="label text-gold">keep this record</span>
      <p className={`mt-1.5 leading-relaxed text-cream-dim ${compact ? 'text-[11.5px]' : 'text-[12.5px]'}`}>
        {drafts > 0 ? (
          <>
            You are <span className="font-bold text-cream">level {level}</span> with{' '}
            <span className="font-bold text-cream">
              {drafts} season{drafts === 1 ? '' : 's'}
            </span>{' '}
            played — and it only exists in this browser. Connect Google and you can pick it up on
            any device.
          </>
        ) : (
          <>
            Your record only exists in this browser. Connect Google and it follows you to any
            device.
          </>
        )}
      </p>

      <button
        onClick={() => go('claim')}
        disabled={busy !== null}
        className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-cream px-3 py-3 text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <GoogleMark size={17} />
        {busy === 'claim' ? 'Taking you to Google…' : 'Continue with Google'}
      </button>

      <button
        onClick={() => go('signin')}
        disabled={busy !== null}
        className="mt-2 w-full text-[10.5px] font-bold uppercase tracking-label text-moss underline-offset-2 hover:text-cream hover:underline disabled:opacity-50"
      >
        {busy === 'signin' ? 'Taking you to Google…' : 'Already have a record? Sign in'}
      </button>

      {collision && (
        <div className="mt-2.5 rounded-lg border border-leather/30 bg-leather/[0.08] px-2.5 py-2">
          <p className="text-[10.5px] leading-snug text-cream-dim">
            That Google account already has a record. Opening it will leave the{' '}
            <span className="font-bold text-cream">
              {drafts} season{drafts === 1 ? '' : 's'}
            </span>{' '}
            played in this browser behind — they stay with the guest account, which nothing else
            can reach.
          </p>
          <button
            onClick={() => go('signin')}
            className="mt-2 w-full rounded-lg bg-cream px-3 py-2 text-[10.5px] font-extrabold uppercase tracking-label text-ink hover:opacity-90"
          >
            Open my existing record
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[10.5px] leading-snug text-leather">{error}</p>}

      <p className="mt-2.5 text-[9.5px] leading-snug text-moss/70">
        Google will ask you to confirm. We only read your email address, to recognise you next
        time — nothing is posted anywhere, and we never see your password. By continuing you
        accept our{' '}
        <Link to="/terms" className="underline hover:text-cream-dim">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline hover:text-cream-dim">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  )
}
