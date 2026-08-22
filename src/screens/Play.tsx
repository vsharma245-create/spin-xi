import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Screen } from '../components/ui'
import { todaysChallenge } from '../data/challenges'
import { makeRng, newDraft } from '../game/draft'
import { loadDaily, saveResult, track } from '../data/records'
import { loadLeague } from '../data/leagues'
import type { League } from '../data/leagues'
import type { DraftConfig, DraftState, Format, TournamentResult } from '../game/types'
import ChampionsTrophy from './ChampionsTrophy'
import DraftBoard from './DraftBoard'
import DraftSetup from './DraftSetup'
import Result from './Result'
import Simulation from './Simulation'
import XIComplete from './XIComplete'

type Phase = 'setup' | 'draft' | 'xi' | 'sim' | 'result' | 'trophy'

/**
 * Where this season stands on today's daily board.
 *
 * Counted against the people who have actually played it rather than estimated
 * from an invented crowd — which means it is honest, and on a quiet morning it
 * will say first out of three.
 */
async function rankOnDaily(points: number, dateKey: string) {
  const board = await loadDaily(dateKey, 500)
  const better = board.filter((r) => r.points > points).length
  return { place: better + 1, of: Math.max(board.length, better + 1) }
}

export default function Play() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const isDaily = params.get('mode') === 'daily'
  const leagueCode = params.get('league')
  const formatParam = params.get('format') as Format | null
  const daily = useMemo(() => todaysChallenge(), [])

  const [phase, setPhase] = useState<Phase>(isDaily ? 'draft' : 'setup')
  const [state, setState] = useState<DraftState | null>(() =>
    isDaily
      ? newDraft(
          'daily',
          {
            format: daily.format,
            scope: 'ALL',
            teamKey: null,
            years: null,
            presetId: daily.presetId,
            ratingMode: 'SEASON',
            hideRatings: false,
            difficulty: 'NORMAL',
            liveToss: true,
            worldTeams: true,
            overseasCap: true,
            teamName: 'YOUR XI',
          },
          daily.index,
        )
      : null,
  )
  const [result, setResult] = useState<TournamentResult | null>(null)
  const [rank, setRank] = useState<number | null>(null)

  /*
   * An identity for the draft in progress, and when it began.
   *
   * Started, abandoned and finished are three rows about one thing; without a
   * shared id they can only be matched up by guessing from timestamps, which
   * stops working the moment somebody plays twice in a minute. Refs rather
   * than state: nothing on screen reads them, and a re-render for a value
   * only telemetry cares about would be a waste.
   */
  const draftId = useRef<string>('')
  const startedAt = useRef<number>(0)

  const beginDraft = (config: DraftConfig, mode: 'quick' | 'daily') => {
    draftId.current = crypto.randomUUID()
    startedAt.current = Date.now()
    track('draft_started', draftId.current, {
      mode,
      format: config.format,
      preset: config.presetId,
      difficulty: config.difficulty,
    })
  }

  /**
   * The tournament's RNG, created once when the player hits simulate. Daily runs
   * are seeded by the day and the XI so the same team always plays out the same
   * tournament; quick drafts get a fresh roll each time.
   */
  const [rand, setRand] = useState<(() => number) | null>(null)
  // Kept so the season can be recorded with the seed that produced it: the
  // simulation is deterministic, so seed plus XI is enough to replay and check.
  const [seed, setSeed] = useState<number | null>(null)

  /*
   * A league's rules are not a suggestion.
   *
   * They are fetched rather than passed through the URL, and the setup screen
   * is skipped entirely: there is nothing here for the player to choose, and
   * offering them the controls would only invite a season the database is
   * going to refuse.
   */
  const [league, setLeague] = useState<League | null>(null)
  useEffect(() => {
    if (!leagueCode) return
    let live = true
    void loadLeague(leagueCode)
      .then((l) => {
        if (!live || !l) return
        setLeague(l)
        beginDraft(
          {
            format: l.format,
            scope: 'ALL',
            teamKey: null,
            years: l.from_year && l.to_year ? [l.from_year, l.to_year] : null,
            presetId: l.preset_id,
            ratingMode: l.rating_mode,
            hideRatings: l.difficulty === 'HARD',
            difficulty: l.difficulty,
            liveToss: true,
            worldTeams: l.world_teams,
            overseasCap: !l.world_teams,
            teamName: 'YOUR XI',
          },
          'quick',
        )
        setState(
          newDraft('quick', {
            format: l.format,
            scope: 'ALL',
            teamKey: null,
            years: l.from_year && l.to_year ? [l.from_year, l.to_year] : null,
            presetId: l.preset_id,
            ratingMode: l.rating_mode,
            hideRatings: l.difficulty === 'HARD',
            difficulty: l.difficulty,
            liveToss: true,
            worldTeams: l.world_teams,
            overseasCap: !l.world_teams,
            teamName: 'YOUR XI',
          }),
        )
        setPhase('draft')
      })
      .catch(() => {})
    return () => {
      live = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueCode])

  /*
   * A daily draft is already under way when this screen mounts — its state is
   * built in the initialiser, not by pressing start — so it would otherwise be
   * the one kind of draft that never reported starting, and every daily would
   * look like a completion out of nowhere.
   */
  useEffect(() => {
    if (!isDaily || !state) return
    beginDraft(state.config, 'daily')
    // Once, for the draft this mount created.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isDaily])

  const startSim = () => {
    if (!state) return
    const seed =
      state.mode === 'daily'
        ? daily.index * 104729 + state.slots.reduce((n, s) => n + (s.player?.ovr ?? 0), 0)
        : Math.floor(Math.random() * 2 ** 31)
    setSeed(seed)
    setRand(() => makeRng(seed))
    setPhase('sim')
  }

  const start = (config: DraftConfig) => {
    beginDraft(config, 'quick')
    setState(newDraft('quick', config))
    setPhase('draft')
  }

  /**
   * Abandon the draft in progress and begin another, carrying over everything
   * that was not changed in the dialog. A new draft rather than a reset one:
   * the point of restarting is a different draw, and reusing the state would
   * hand back the same squads in the same order.
   */
  const restart = (next: Partial<DraftConfig>) => {
    if (!state) return
    track('draft_abandoned', draftId.current, {
      mode: state.mode,
      format: state.config.format,
      // How far they got before leaving is the whole question: abandoning on
      // the first spin and abandoning on the tenth pick are different problems.
      picks: state.slots.filter((slot) => slot.player).length,
      seconds: Math.round((Date.now() - startedAt.current) / 1000),
    })
    start({ ...state.config, ...next })
  }

  const finish = (r: TournamentResult) => {
    setResult(r)
    const took = startedAt.current ? Date.now() - startedAt.current : null
    track('draft_completed', draftId.current, {
      mode: r.mode,
      format: r.format,
      outcome: r.outcome,
      wins: r.wins,
      seconds: took ? Math.round(took / 1000) : null,
    })
    // Recorded on the server, which is where a career lives. Written after the
    // result is on screen, so a slow network never delays the reveal — and if
    // the write fails the season is lost rather than the screen.
    void saveResult(r, {
      dailyKey: daily.dateKey,
      seed: seed ?? undefined,
      years: state?.config.years ?? null,
      worldTeams: state?.config.worldTeams ?? true,
      durationMs: took,
      leagueId: league?.id ?? null,
    }).catch(() => {
      /* Offline, or signed out. The local copy stands and the ladder misses
         one row — worth far less than blocking the result screen on a POST. */
    })
    if (r.mode === 'daily') {
      void rankOnDaily(r.score.points, daily.dateKey)
        .then((p) => setRank(p.place))
        .catch(() => setRank(null))
    }
    setPhase('result')
  }

  const playAgain = () => {
    setResult(null)
    setRank(null)
    setRand(null)
    setState(null)
    if (isDaily) navigate('/play')
    setPhase('setup')
  }

  return (
    <Screen>
        {phase === 'setup' && (
          <DraftSetup key="setup" initialFormat={formatParam ?? undefined} onStart={start} />
        )}

        {phase === 'draft' && state && (
          <DraftBoard
            key="draft"
            state={state}
            setState={setState}
            onComplete={(s) => {
              setState(s)
              setPhase('xi')
            }}
            /*
             * Leaving a league draft goes back to the league, not to the
             * settings screen. There is nothing to set — the rules are the
             * league's — and landing on a form full of controls that cannot
             * be used is a worse answer than landing where the contest is.
             */
            onQuit={() => (leagueCode ? navigate(`/l/${leagueCode}`) : setPhase('setup'))}
            leagueName={league?.name}
            onRestart={restart}
          />
        )}

        {phase === 'xi' && state && (
          <XIComplete
            key="xi"
            state={state}
            setState={setState}
            onSimulate={startSim}
          />
        )}

        {phase === 'sim' && state && rand && (
          <Simulation
            key="sim"
            slots={state.slots}
            captainId={state.captainId}
            config={state.config}
            mode={state.mode}
            dailyId={state.dailyId}
            rand={rand}
            objective={state.mode === 'daily' ? daily.objective : undefined}
            onDone={finish}
          />
        )}

        {phase === 'result' && result && (
          <Result
            key="result"
            result={result}
            rank={rank}
            onPlayAgain={playAgain}
            onDaily={() => navigate('/daily')}
            onTrophy={() => setPhase('trophy')}
          />
        )}

        {phase === 'trophy' && result && (
          <ChampionsTrophy key="trophy" result={result} onExit={() => setPhase('result')} />
        )}
    </Screen>
  )
}
