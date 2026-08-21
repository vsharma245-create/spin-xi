import { useEffect, useRef, useState } from 'react'
import { HANDLE_MAX, handleProblem, rename, tidyHandle } from '../data/account'

/**
 * Changing the name you play under.
 *
 * The handle is generated at first launch so nobody meets a signup form, which
 * is right for the first three minutes and wrong forever after — a player who
 * has earned a place on a ladder wants their own name on it. It lives on the
 * account rather than the device, so it follows a sign-in to a new browser,
 * and every board reads it by join, so a rename applies to seasons already
 * played rather than leaving an old name scattered through the history.
 */
export function HandleEditor({
  handle,
  onRenamed,
}: {
  handle: string
  onRenamed: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(handle)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  function open() {
    setDraft(handle)
    setError('')
    setEditing(true)
  }

  function close() {
    setEditing(false)
    setError('')
  }

  async function save() {
    const next = tidyHandle(draft)
    if (next === handle) return close()

    const problem = handleProblem(next)
    if (problem) return setError(problem)

    setBusy(true)
    setError('')
    try {
      const updated = await rename(next)
      onRenamed(updated.handle)
      setEditing(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        className="group flex min-w-0 items-center gap-2 text-left"
        aria-label="Change your name"
      >
        <h1 className="display truncate text-[22px] leading-none sm:text-[30px]">{handle}</h1>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-moss transition-colors group-hover:text-willow"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    )
  }

  return (
    <div className="min-w-0">
      {/* A real form, so Enter submits the way it does everywhere else — and
          so a phone keyboard offers "Go" rather than a newline. */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
          maxLength={HANDLE_MAX}
          disabled={busy}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          className="display min-w-0 flex-1 rounded-lg border border-willow/40 bg-white/[0.04] px-2 py-1 text-[18px] leading-none text-cream outline-none focus:border-willow disabled:opacity-50 sm:text-[22px]"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-willow px-3 py-2 text-[10px] font-bold uppercase tracking-label text-ink disabled:opacity-50"
        >
          {busy ? 'Saving' : 'Save'}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-label text-moss disabled:opacity-50"
        >
          Cancel
        </button>
      </form>
      {error ? (
        <p className="mt-1.5 text-[10.5px] leading-snug text-leather">{error}</p>
      ) : (
        <p className="mt-1.5 text-[10px] text-moss/70">
          This is the name on every ladder. {HANDLE_MAX - tidyHandle(draft).length} characters left.
        </p>
      )}
    </div>
  )
}
