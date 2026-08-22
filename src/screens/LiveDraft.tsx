import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Screen, SectionLabel } from '../components/ui'
import { PlayerCard } from '../components/PlayerCard'
import { signIn } from '../data/account'
import {
  abandonRoom,
  begin,
  heartbeat,
  leaveSeat,
  loadPicks,
  loadRoom,
  loadSeats,
  makePick,
  previewRoom,
  sit,
} from '../data/live'
import type { Pick, Room, Seat } from '../data/live'
import { botPick, drawOrder, seatSlots, secondsLeft, snakeSeat, totalPicks } from '../game/live'
import { openSlotsFor, rulesFor } from '../game/draft'
import { TOURNAMENTS } from '../game/types'
import type { DraftConfig } from '../game/types'

/**
 * Four people, one pool, taking turns.
 *
 * Nothing here holds the state of the draft. The room is a seed and a list of
 * picks; the seats, the order, the clock and the board are all read off those
 * every render. Two clients cannot drift apart over something neither of them
 * is keeping.
 *
 * Polled rather than pushed. A turn is thirty seconds and a room is four
 * people, so a request a second is plenty and costs nothing but a request a
 * second — where a socket would cost a dependency and a reconnection story.
 */
const POLL_MS = 1000

export default function LiveDraft() {
  const { code = '' } = useParams()

  const [room, setRoom] = useState<Room | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [mySeat, setMySeat] = useState<number | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [taking, setTaking] = useState(false)
  const [copied, setCopied] = useState(false)
  const botting = useRef(false)

  /* ── Getting in ── */
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const account = await signIn()
        if (!live) return
        setMe(account.id)
        const preview = await previewRoom(code)
        if (!preview) return setError('No draft with that link.')
        // Sitting down is idempotent: a refresh keeps the seat you had.
        const seat = await sit(code).catch(() => null)
        if (!live) return
        if (seat !== null) setMySeat(Number(seat))
        const r = await loadRoom(code)
        if (live && r) setRoom(r)
      } catch (err) {
        if (live) setError((err as Error).message)
      }
    })()
    return () => {
      live = false
    }
  }, [code])

  /* ── Reading the room ── */
  const refresh = useCallback(async () => {
    const r = await loadRoom(code)
    if (!r) return
    setRoom(r)
    const [s, p] = await Promise.all([loadSeats(r.id), loadPicks(r.id)])
    setSeats(s)
    setPicks(p)
  }, [code])

  /*
   * The id rather than the room.
   *
   * refresh() replaces the room object every second, so depending on the
   * object would tear this interval down and stand a new one up on every
   * poll. The id is the thing that actually changes when the room does.
   */
  const roomId = room?.id
  useEffect(() => {
    if (!roomId) return
    const id = setInterval(() => {
      void refresh()
      setTick((n) => n + 1)
      if (mySeat !== null) void heartbeat(roomId, mySeat)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [roomId, mySeat, refresh])

  /* ── Everything else is derived ── */
  const config: DraftConfig | null = useMemo(
    () =>
      room && {
        format: room.format,
        scope: 'ALL',
        teamKey: null,
        years: room.from_year && room.to_year ? [room.from_year, room.to_year] : null,
        presetId: room.preset_id,
        ratingMode: room.rating_mode,
        hideRatings: room.difficulty === 'HARD',
        difficulty: room.difficulty,
        liveToss: false,
        worldTeams: room.world_teams,
        overseasCap: !room.world_teams,
        teamName: 'YOUR XI',
      },
    [room],
  )

  const order = useMemo(() => (config && room ? drawOrder(config, room.seed) : []), [config, room])
  const pickNo = picks.length
  const onTurn = room ? snakeSeat(pickNo, room.seats) : 0
  const done = room ? pickNo >= totalPicks(room.seats) : false
  const xis = useMemo(
    () => (config && room ? seatSlots(config, order, picks, room.seats) : []),
    [config, room, order, picks],
  )
  const squad = order.length ? order[pickNo % order.length] : null
  const taken = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks])
  const left = room ? secondsLeft(picks.at(-1)?.created_at ?? null, room.started_at, room.pick_seconds) : 0
  const mine = mySeat !== null && onTurn === mySeat && !done && room?.status === 'drafting'

  /* ── The bot ──
   * Any client may move an overdue seat on, because every client works out
   * the same pick. Whoever writes first is writing what the others were about
   * to; the losers are refused and simply re-read. */
  useEffect(() => {
    if (!room || !config || !squad || done || room.status !== 'drafting') return
    if (left > 0 || botting.current) return
    if (mySeat === null) return
    botting.current = true
    void (async () => {
      const slots = xis[onTurn]
      const choice = slots && botPick(squad, slots, taken, config)
      if (choice) {
        await makePick({
          room_id: room.id,
          pick_no: pickNo,
          seat: onTurn,
          squad_id: squad.id,
          player_id: choice.player.playerId,
          slot: choice.slot,
        })
        await refresh()
      }
      botting.current = false
    })()
  }, [tick, left, room, config, squad, done, onTurn, pickNo, xis, taken, mySeat, refresh])

  const copyCode = async () => {
    await navigator.clipboard.writeText(room?.code ?? '').catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * Leaving.
   *
   * A player hands their seat to the bot, which keeps drafting — three people
   * should not be held up by a fourth who has gone. The host calls the whole
   * thing off instead, because a draft with no host is nobody's to start.
   */
  const quit = async () => {
    if (!room) return
    if (room.host === me) await abandonRoom(room.id)
    else if (mySeat !== null) await leaveSeat(room.id, mySeat)
    window.location.href = '/multiplayer'
  }

  const take = async (playerId: string, slot: number) => {
    if (!room || !squad) return
    setTaking(true)
    await makePick({
      room_id: room.id,
      pick_no: pickNo,
      seat: onTurn,
      squad_id: squad.id,
      player_id: playerId,
      slot,
    })
    await refresh()
    setTaking(false)
  }

  if (error) {
    return (
      <Screen>
        <div className="grid min-h-[50vh] place-items-center px-6 text-center">
          <div>
            <div className="display text-[19px] text-leather">NO SUCH DRAFT</div>
            <p className="mt-2 text-[12px] leading-relaxed text-moss">{error}</p>
            <div className="mx-auto mt-5 max-w-[220px]">
              <Button to="/multiplayer" full>
                Back to multiplayer
              </Button>
            </div>
          </div>
        </div>
      </Screen>
    )
  }

  if (!room || !config) {
    return (
      <Screen>
        <div className="grid min-h-[50vh] place-items-center text-[12.5px] text-moss">
          Finding the draft…
        </div>
      </Screen>
    )
  }

  const sitting = seats.filter((s) => s.player).length

  /* ── Lobby ── */
  if (room.status === 'abandoned') {
    return (
      <Screen>
        <div className="grid min-h-[50vh] place-items-center px-6 text-center">
          <div>
            <div className="display text-[19px] text-leather">CALLED OFF</div>
            <p className="mt-2 text-[12px] leading-relaxed text-moss">
              The host ended this draft. Nothing from it was kept.
            </p>
            <div className="mx-auto mt-5 max-w-[220px]">
              <Button to="/multiplayer" full>
                Back to multiplayer
              </Button>
            </div>
          </div>
        </div>
      </Screen>
    )
  }

  if (room.status === 'lobby') {
    return (
      <Screen>
        <Link to="/multiplayer" className="label text-moss hover:text-cream">
          ← multiplayer
        </Link>
        <h1 className="display mt-2 text-[26px] sm:text-[34px]">Live draft</h1>
        <p className="mt-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-moss">
          {TOURNAMENTS[room.format].name} · {room.difficulty.toLowerCase()} · {room.pick_seconds}s a
          pick
        </p>

        <div className="mt-6">
          <SectionLabel right={<span className="label">{sitting} of {room.seats}</span>}>
            seats
          </SectionLabel>
          <div className="surface divide-y divide-white/[0.05] px-3.5">
            {seats.map((s) => (
              <div key={s.seat} className="flex items-center gap-3 py-2.5">
                <span className="tnum w-6 text-[12px] font-black text-moss">{s.seat + 1}</span>
                <span
                  className={`flex-1 text-[13px] font-bold ${
                    s.player ? (s.player === me ? 'text-pitch' : 'text-cream') : 'text-moss/50'
                  }`}
                >
                  {s.player ? (s.player === me ? 'You' : 'Ready') : 'Waiting…'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-card border border-willow/30 bg-willow/[0.06] px-3.5 py-4 text-center">
          <span className="label text-willow">read this out</span>
          <p className="stat-num mt-1 text-[38px] uppercase tracking-[0.28em] text-cream">
            {room.code}
          </p>
          <button
            onClick={() => void copyCode()}
            className="mt-1 text-[10.5px] font-bold uppercase tracking-label text-moss underline-offset-2 hover:text-cream hover:underline"
          >
            {copied ? 'copied' : 'copy code'}
          </button>
          <p className="mt-2 text-[10px] leading-snug text-moss/70">
            Your mates open Multiplayer and type it in. No link needed.
          </p>
        </div>

        {room.host === me && (
          <div className="mt-6">
            <Button size="lg" full onClick={() => void begin(room.id).then(refresh)}>
              Start the draft →
            </Button>
            <p className="mt-2 text-center text-[10px] text-moss/70">
              Empty seats draft for themselves. Nobody waits on somebody who never arrives.
            </p>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => void quit()}
            className="text-[10.5px] font-bold uppercase tracking-label text-moss underline-offset-2 hover:text-leather hover:underline"
          >
            {room.host === me ? 'Call the draft off' : 'Leave this draft'}
          </button>
        </div>
      </Screen>
    )
  }

  /* ── Drafting ── */
  return (
    <Screen>
      <div className="flex items-baseline justify-between">
        <h1 className="display text-[22px] sm:text-[28px]">
          {done ? 'Draft complete' : `Pick ${pickNo + 1}`}
        </h1>
        {!done && (
          <span
            className={`stat-num text-[20px] ${left <= 5 ? 'text-leather' : 'text-cream'}`}
          >
            {left}s
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {Array.from({ length: room.seats }, (_, seat) => {
          const filled = xis[seat]?.filter((s) => s.player).length ?? 0
          const active = seat === onTurn && !done
          return (
            <div
              key={seat}
              className={`rounded-xl border px-2 py-2 text-center ${
                active ? 'border-pitch/50 bg-pitch/[0.08]' : 'border-white/[0.08] bg-ink-700'
              }`}
            >
              <div className="label text-[8.5px] text-moss">
                {seats[seat]?.player === me ? 'you' : `seat ${seat + 1}`}
              </div>
              <div className={`stat-num text-[15px] ${active ? 'text-pitch' : 'text-cream'}`}>
                {filled}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 text-center">
        <button
          onClick={() => void quit()}
          className="text-[10px] font-bold uppercase tracking-label text-moss/70 underline-offset-2 hover:text-leather hover:underline"
        >
          {room.host === me ? 'Call it off' : 'Leave — the bot takes my seat'}
        </button>
      </div>

      {done ? (
        <div className="mt-6 rounded-card border border-gold/30 bg-gold/[0.06] px-4 py-4 text-center">
          <div className="display text-[17px] text-gold">EVERY XI IS FULL</div>
          <p className="mt-1.5 text-[12px] text-cream-dim">
            Forty-four picks out of one pool. Simulating each XI comes next.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <SectionLabel right={<span className="label">{mine ? 'your pick' : 'watching'}</span>}>
              {squad ? `${squad.team} ${squad.season}` : 'drawing…'}
            </SectionLabel>
            {!mine && (
              <p className="mb-2 text-[11px] text-moss">
                Seat {onTurn + 1} is choosing. Their clock runs out in {left}s, and then anybody
                can move it on.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {squad?.players
                .filter((p) => !taken.has(p.playerId))
                .slice(0, 12)
                .map((p) => {
                  const open = mySeat === null ? [] : openSlotsFor(p, xis[onTurn] ?? [], rulesFor(config))
                  const usable = mine && open.length > 0
                  return (
                    <PlayerCard
                      key={p.id}
                      player={p}
                      hideRatings={config.hideRatings}
                      disabled={!usable || taking}
                      fits={open.length}
                      onClick={() => void take(p.playerId, open[0])}
                    />
                  )
                })}
            </div>
          </div>
        </>
      )}
    </Screen>
  )
}
