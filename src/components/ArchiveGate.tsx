import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { completeRedirect } from '../data/account'
import { loadArchive } from '../data/repository'
import { BallMark } from './icons'
import { Button } from './ui'

/**
 * Holds the game back until the archive has landed.
 *
 * Everything downstream — the draft pool, the opponent list, the daily
 * sequence — reads the squad array synchronously, which is what keeps a spin
 * instant. That is only safe if nothing renders before the array is filled, so
 * this is the one place in the app that waits on the network.
 */
export function ArchiveGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [error, setError] = useState<string>('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    /*
     * Coming back from Google, the session arrives in the URL fragment. It has
     * to be taken before anything asks who the player is, or the first request
     * goes out as the old anonymous user — or as nobody at all.
     */
    completeRedirect()
    loadArchive().then(
      () => live && setState('ready'),
      (err: Error) => {
        if (!live) return
        setError(err.message)
        setState('failed')
      },
    )
    return () => {
      live = false
    }
  }, [attempt])

  if (state === 'ready') return <>{children}</>

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[340px] text-center">
        <motion.div
          animate={state === 'loading' ? { rotate: 360 } : {}}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
          className="mx-auto w-fit"
        >
          <BallMark size={40} />
        </motion.div>

        {state === 'loading' ? (
          <>
            <div className="display mt-5 text-[17px] text-cream">MARKING OUT THE RUN-UP</div>
            <p className="mt-1.5 text-[11.5px] text-moss">Fetching the archive…</p>
          </>
        ) : (
          <>
            <div className="display mt-5 text-[19px] text-leather">RAIN DELAY</div>
            <p className="mt-2 text-[12px] leading-relaxed text-moss">
              The cricket archive could not be reached, so there is nothing to draft from yet.
            </p>
            <p className="mt-2 break-words text-[10.5px] leading-snug text-moss/70">{error}</p>
            <div className="mt-5">
              <Button
                full
                onClick={() => {
                  setState('loading')
                  setAttempt((n) => n + 1)
                }}
              >
                Try again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
