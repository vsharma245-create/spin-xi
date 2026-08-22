import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Screen, SectionLabel } from '../components/ui'
import { useAsync } from '../data/useAsync'
import { joinLeague, loadLeague, loadLeagueTable, previewLeague, timeLeft } from '../data/leagues'
import { TOURNAMENTS } from '../game/types'
import { signIn } from '../data/account'

/**
 * One league: what the rules are, who is in it, and where you stand.
 *
 * The same address serves a stranger who has just been sent the link and a
 * player who has already played, because from the outside they are the same
 * request — show me this league. What differs is only how much of it the
 * database is willing to return.
 */
export default function LeaguePage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [joined, setJoined] = useState(0)

  const league = useAsync(() => loadLeague(code), [code, joined])
  const preview = useAsync(() => previewLeague(code), [code, joined])
  const me = useAsync(() => signIn(), [])
  const table = useAsync(
    async () => (league.data ? loadLeagueTable(league.data.id) : []),
    [league.data?.id],
  )

  const inIt = Boolean(league.data)
  const rules = league.data ?? preview.data
  const link = `${window.location.origin}/l/${code}`

  const join = async () => {
    setBusy(true)
    setError('')
    try {
      await joinLeague(code)
      setJoined((n) => n + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    const text = `Join my SPIN XI league — ${rules?.name ?? ''}`
    if (navigator.share) {
      await navigator.share({ title: 'SPIN XI', text, url: link }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (league.loading || preview.loading) {
    return (
      <Screen>
        <div className="grid min-h-[50vh] place-items-center text-[12.5px] text-moss">
          Finding the league…
        </div>
      </Screen>
    )
  }

  if (!rules) {
    return (
      <Screen>
        <div className="grid min-h-[50vh] place-items-center px-6 text-center">
          <div>
            <div className="display text-[19px] text-leather">NO SUCH LEAGUE</div>
            <p className="mt-2 text-[12px] leading-relaxed text-moss">
              That link has expired, or a character is missing from it.
            </p>
            <div className="mx-auto mt-5 max-w-[220px]">
              <Button to="/multiplayer" full>
                Start your own
              </Button>
            </div>
          </div>
        </div>
      </Screen>
    )
  }

  const closes = timeLeft(rules.closes_at)
  const rows = table.data ?? []
  const mine = me.data?.id

  return (
    <Screen>
      <div className="pt-2">
        <Link to="/multiplayer" className="label text-moss hover:text-cream">
          ← leagues
        </Link>
        <h1 className="display mt-2 text-[24px] leading-tight sm:text-[32px]">{rules.name}</h1>
        <p className="mt-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-moss">
          {TOURNAMENTS[rules.format].name} · {rules.difficulty.toLowerCase()} ·{' '}
          {rules.rating_mode.toLowerCase()} ratings
          {closes ? ` · ${closes}` : ' · no deadline'}
        </p>
        <p className="mt-1 text-[10.5px] text-moss/70">
          {rules.scoring === 'best'
            ? 'Your best season counts — replay as often as you like.'
            : 'Your latest season counts — every replay replaces it.'}
        </p>
      </div>

      {!inIt && (
        <div className="mt-6 rounded-card border border-gold/30 bg-gold/[0.06] px-4 py-4">
          <span className="label text-gold">you have been invited</span>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-cream-dim">
            {'players' in rules && rules.players === 1
              ? 'The host has played. Draft your own eleven under the same rules and see if you can beat them.'
              : `${'players' in rules ? rules.players : 0} playing. Same rules for everyone — only the eleven differs.`}
          </p>
          {'is_open' in rules && !rules.is_open ? (
            <p className="mt-3 text-[11px] text-leather">
              This league is not open yet — the host has still to play their own season.
            </p>
          ) : (
            <div className="mt-3">
              <Button full onClick={() => void join()} disabled={busy}>
                {busy ? 'Joining…' : 'Join this league'}
              </Button>
            </div>
          )}
          {error && <p className="mt-2 text-[10.5px] text-leather">{error}</p>}
        </div>
      )}

      {inIt && (
        <>
          {/*
           * Sharing is held back until the host has played.
           *
           * The link is useless before then — it opens on "the host has still
           * to play" — and offering it invites exactly what the rule exists to
           * prevent: sending it out, watching the field land, and playing last
           * against a known target.
           */}
          {!preview.data?.is_open ? (
            <div className="mt-6">
              <Button size="lg" full onClick={() => navigate(`/play?league=${code}`)}>
                Play your season →
              </Button>
              <p className="mt-2 text-center text-[10.5px] leading-snug text-moss">
                The link opens to your mates once your own season is in. Nobody can join before
                that, so nobody is playing against a score you already know.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button onClick={() => navigate(`/play?league=${code}`)} full>
                {rows.some((r) => r.player === mine) ? 'Play again' : 'Play your season'}
              </Button>
              <Button variant="ghost" onClick={() => void share()} full>
                {copied ? 'Link copied' : 'Share link'}
              </Button>
            </div>
          )}
        </>
      )}

      <div className="mt-7">
        <SectionLabel
          right={<span className="label">{rows.length} played</span>}
        >
          table
        </SectionLabel>
        <div className="surface divide-y divide-white/[0.05] px-3.5">
          {table.loading && (
            <div className="py-8 text-center text-[12px] text-moss">Reading the table…</div>
          )}
          {!table.loading && rows.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-[12.5px] text-cream-dim">Nobody has played yet.</p>
              <p className="mt-1 text-[11px] text-moss">Be the first and set the mark.</p>
            </div>
          )}
          {rows.map((r, i) => {
            const you = r.player === mine
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate text-[13px] font-bold ${you ? 'text-pitch' : 'text-cream'}`}>
                      {r.handle}
                    </span>
                    {r.perfect && (
                      <span className="shrink-0 rounded border border-gold/40 bg-gold/10 px-1 text-[7.5px] font-black uppercase tracking-label text-gold">
                        perfect
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-moss">
                    {r.team_name} · {r.wins}–{r.losses}
                    {rules.format === 'TEST' ? `–${r.draws}` : ''} · {r.runs.toLocaleString()} runs
                  </div>
                </div>
                <span className="stat-num w-14 shrink-0 text-right text-[17px] text-cream">
                  {r.points.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {inIt && preview.data?.is_open && (
        <div className="mt-5 rounded-card border border-white/[0.06] px-3.5 py-3">
          <span className="label text-moss">the link</span>
          <p className="mt-1 break-all text-[11.5px] text-cream-dim">{link}</p>
        </div>
      )}
    </Screen>
  )
}
