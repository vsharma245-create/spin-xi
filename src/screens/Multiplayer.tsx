import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Option, Screen, SectionLabel } from '../components/ui'
import { useAsync } from '../data/useAsync'
import { createLeague, myLeagues, timeLeft } from '../data/leagues'
import { createRoom } from '../data/live'
import { FORMAT_ORDER, PRESETS, TOURNAMENTS } from '../game/types'
import { yearsForFormat } from '../data/squads'
import type { Difficulty, Format, RatingMode } from '../game/types'

/**
 * Playing against people you know.
 *
 * A league is a set of rules and a link. The host settles the rules, plays
 * their own season, and sends the link on; everybody who follows it plays
 * those exact rules whenever they like. Nobody has to be online at the same
 * time, which is the whole point — the arguing happens in a group chat, and
 * that is where the link goes.
 */

const NAMES = [
  'Sunday Club Legends',
  'Nightwatchman XI',
  'The Reverse Swing Society',
  'Corridor of Uncertainty',
  'Village Green Invitational',
  'Tail-Enders United',
  'The Third Man Club',
]
const CATEGORIES = ['Mates', 'Work', 'Family', 'The Group Chat', 'Uni', 'The Club']
const WINDOWS: [string, number | null][] = [
  ['1 hour', 60],
  ['6 hours', 360],
  ['24 hours', 1440],
  ['3 days', 4320],
  ['1 week', 10080],
  ['No deadline', null],
]

export default function Multiplayer() {
  const navigate = useNavigate()
  const mine = useAsync(() => myLeagues(), [])

  const [name, setName] = useState(() => NAMES[Math.floor(Math.random() * NAMES.length)])
  const [category, setCategory] = useState<string>('Mates')
  const [format, setFormat] = useState<Format>('T20L')
  const [presetId, setPresetId] = useState('BALANCED')
  const [ratingMode, setRatingMode] = useState<RatingMode>('SEASON')
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL')
  const [scoring, setScoring] = useState<'latest' | 'best'>('best')
  const [minutes, setMinutes] = useState<number | null>(1440)
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(false)
  const [error, setError] = useState('')

  const startLive = async () => {
    setLive(true)
    setError('')
    try {
      const bounds = yearsForFormat(format)
      const room = await createRoom({
        format,
        preset_id: presetId,
        rating_mode: ratingMode,
        difficulty,
        from_year: bounds[0],
        to_year: bounds[1],
        world_teams: true,
        seats: 4,
        pick_seconds: 30,
      })
      navigate(`/d/${room.code}`)
    } catch (err) {
      setError((err as Error).message)
      setLive(false)
    }
  }

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const bounds = yearsForFormat(format)
      const league = await createLeague({
        name: name.trim() || 'Our League',
        category,
        format,
        preset_id: presetId,
        rating_mode: ratingMode,
        difficulty,
        from_year: bounds[0],
        to_year: bounds[1],
        world_teams: true,
        scoring,
        max_players: null,
        closes_at: minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null,
        signed_in_only: false,
      })
      // Straight into their own season: the league does not open until the
      // host has played, so there is nothing to share yet.
      navigate(`/play?league=${league.code}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Screen>
      <div className="pt-2">
        <span className="label">spin xi with mates</span>
        <h1 className="display mt-1 text-[26px] sm:text-[34px] md:text-[46px]">Leagues</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-moss">
          You set the rules once. Everyone drafts their own eleven under them, plays a season
          whenever they like, and the best one wins.
        </p>
      </div>

      {/* ── Live draft ── */}
      <div className="mt-6 rounded-card border border-pitch/25 bg-pitch/[0.05] px-4 py-4">
        <span className="label text-pitch">live draft</span>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-cream-dim">
          Four of you at once, out of one pool of squads. A side somebody else takes is gone —
          which is what makes it a draft rather than four games at the same time.
        </p>
        <div className="mt-3">
          <Button
            full
            onClick={() => void startLive()}
            disabled={live}
            variant="ghost"
          >
            {live ? 'Opening the room…' : 'Start a live draft'}
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-moss/70">
          You get a link to send round. Empty seats draft for themselves, so nobody waits on
          somebody who never turns up.
        </p>
      </div>

      {/*
       * A code, not a link.
       *
       * The host reads five characters into a group chat or across a room and
       * everybody types them in. A link is one tap when it arrives by message
       * and useless when it arrives out loud, and this is a game people play
       * in the same room as often as not.
       */}
      <div className="mt-6 rounded-card border border-white/[0.08] bg-ink-700 px-3.5 py-3.5">
        <span className="label text-moss">have a code?</span>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const code = joinCode.trim().toLowerCase()
            if (code) navigate(`/d/${code}`)
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 10))}
            placeholder="ABCDE"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-ink-800 px-3.5 py-3 text-center text-[20px] font-black uppercase tracking-[0.3em] text-cream placeholder:text-moss/40 focus:border-pitch/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!joinCode.trim()}
            className="shrink-0 rounded-xl bg-pitch px-4 text-[12px] font-extrabold uppercase tracking-label text-ink disabled:opacity-40"
          >
            Join
          </button>
        </form>
      </div>

      {(mine.data ?? []).length > 0 && (
        <div className="mt-6">
          <SectionLabel>your leagues</SectionLabel>
          <div className="surface divide-y divide-white/[0.05] px-3.5">
            {(mine.data ?? []).map((l) => (
              <button
                key={l.id}
                onClick={() => navigate(`/l/${l.code}`)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-cream">{l.name}</div>
                  <div className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-moss">
                    {TOURNAMENTS[l.format].name} · {l.difficulty.toLowerCase()}
                    {timeLeft(l.closes_at) ? ` · ${timeLeft(l.closes_at)}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-moss">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-7">
        <SectionLabel right={<span className="label">locked once created</span>}>
          new league
        </SectionLabel>

        <label className="label mt-1 block text-moss">league name</label>
        <div className="mt-1.5 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-ink-700 px-3.5 py-3 text-[15px] font-extrabold uppercase tracking-[0.04em] text-cream focus:border-pitch/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setName(NAMES[Math.floor(Math.random() * NAMES.length)])}
            className="shrink-0 rounded-xl border border-white/10 px-3 text-[11px] font-bold uppercase tracking-label text-moss hover:text-cream"
          >
            ⇄
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <Option key={c} active={category === c} onClick={() => setCategory(c)}>
              <span className="text-[11.5px] font-extrabold uppercase tracking-[0.03em]">{c}</span>
            </Option>
          ))}
        </div>

        <div className="mt-5">
          <SectionLabel>tournament</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {FORMAT_ORDER.map((f) => (
              <Option key={f} active={format === f} onClick={() => setFormat(f)}>
                <div className="display text-[13px] leading-tight">{TOURNAMENTS[f].name}</div>
              </Option>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <SectionLabel>shape of the xi</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <Option key={p.id} active={presetId === p.id} onClick={() => setPresetId(p.id)} note={p.desc}>
                <div className="display text-[13px] leading-tight">{p.name}</div>
              </Option>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <SectionLabel>difficulty</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {(['EASY', 'NORMAL', 'HARD'] as Difficulty[]).map((d) => (
              <Option key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                <div className="display text-[13px]">{d}</div>
              </Option>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <SectionLabel>ratings</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Option active={ratingMode === 'SEASON'} onClick={() => setRatingMode('SEASON')} note="their rating that year">
              <div className="display text-[13px]">SEASON</div>
            </Option>
            <Option active={ratingMode === 'PRIME'} onClick={() => setRatingMode('PRIME')} note="their best ever">
              <div className="display text-[13px]">PRIME</div>
            </Option>
          </div>
        </div>

        <div className="mt-5">
          <SectionLabel right={<span className="label">cannot change later</span>}>scoring</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Option active={scoring === 'best'} onClick={() => setScoring('best')} note="your highest stands">
              <div className="display text-[13px]">BEST RUN</div>
            </Option>
            <Option active={scoring === 'latest'} onClick={() => setScoring('latest')} note="replays replace it">
              <div className="display text-[13px]">LATEST RUN</div>
            </Option>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-moss/70">
            {scoring === 'latest'
              ? 'Riskier: every replay replaces your score, win or lose.'
              : 'Replay as often as you like; only your best season counts.'}
          </p>
        </div>

        <div className="mt-5">
          <SectionLabel>open for</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {WINDOWS.map(([label, mins]) => (
              <Option key={label} active={minutes === mins} onClick={() => setMinutes(mins)}>
                <span className="text-[11.5px] font-extrabold uppercase tracking-[0.03em]">{label}</span>
              </Option>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-[11px] text-leather">{error}</p>}

        <div className="mt-6">
          <Button size="lg" full onClick={() => void start()} disabled={busy}>
            {busy ? 'Creating…' : 'Create league & play →'}
          </Button>
          <p className="mt-2 text-center text-[10px] text-moss/70">
            You play first. The link opens to your mates once your season is in.
          </p>
        </div>
      </div>
    </Screen>
  )
}
