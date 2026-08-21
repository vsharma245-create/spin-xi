import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Button, SectionLabel } from '../components/ui'
import { ROLE_STYLE } from '../components/roles'
import { teamsForFormat, yearsForFormat } from '../data/squads'
import { YearRange } from '../components/YearRange'
import { TeamCrest } from '../components/icons'
import { canFillPreset, poolFor, presetById } from '../game/draft'
import { DIFFICULTY, FORMAT_ORDER, PRESETS, RATING_MODE, TOURNAMENTS } from '../game/types'
import type { Difficulty, DraftConfig, Format, RatingMode, Scope } from '../game/types'
import { OVERSEAS_LIMIT } from '../data/nations'

/** Handy spans to jump to, clipped to whatever the chosen format actually has. */
const DECADES: [string, number, number][] = [
  ['2000s', 2000, 2009],
  ['2010s', 2010, 2019],
  ['2020s', 2020, 2029],
]

/** Small selectable tile used throughout the setup screen. */
function Option({
  active,
  disabled,
  onClick,
  children,
  note,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  note?: string
}) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative rounded-xl border px-3 py-2.5 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed border-white/[0.05] bg-ink-800 opacity-40'
          : active
            ? 'border-pitch/55 bg-pitch/[0.08] shadow-[0_0_0_1px_rgba(53,208,127,0.25)]'
            : 'border-white/[0.08] bg-ink-700 hover:border-white/20'
      }`}
    >
      {children}
      {note && <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-moss">{note}</div>}
    </motion.button>
  )
}

/** Row with an ON/OFF switch, used for the match rules. */
/** A compact on/off shortcut, used by the season presets. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold tracking-label transition-colors ${
        on ? 'border-pitch/50 bg-pitch/12 text-pitch' : 'border-white/10 text-moss hover:border-white/25'
      }`}
    >
      {children}
    </button>
  )
}

function Toggle({
  on,
  onToggle,
  title,
  desc,
  locked = false,
}: {
  on: boolean
  onToggle: () => void
  title: string
  desc: string
  /** Shown, but not yours to change — the rule does not apply right now. */
  locked?: boolean
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onToggle}
      disabled={locked}
      aria-disabled={locked}
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
        locked
          ? 'cursor-not-allowed border-white/[0.05] bg-ink-800 opacity-55'
          : 'border-white/[0.08] bg-ink-700 hover:border-white/20'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-cream">
          {title}
        </div>
        <div className="mt-0.5 text-[10.5px] leading-snug text-moss">{desc}</div>
      </div>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
          on ? 'border-pitch/50 bg-pitch/25' : 'border-white/12 bg-white/[0.05]'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={`absolute top-[3px] h-4 w-4 rounded-full ${
            on ? 'left-[25px] bg-pitch' : 'left-[3px] bg-moss'
          }`}
        />
      </span>
    </button>
  )
}

export default function DraftSetup({
  initialFormat,
  onStart,
}: {
  initialFormat?: Format
  onStart: (config: DraftConfig) => void
}) {
  const [format, setFormat] = useState<Format>(initialFormat ?? 'T20L')
  const [scope, setScope] = useState<Scope>('ALL')
  const [teamKey, setTeamKey] = useState<string | null>(null)
  const span = useMemo(() => yearsForFormat(format), [format])
  const [years, setYears] = useState<[number, number]>(span)
  const [presetId, setPresetId] = useState('BALANCED')
  const [ratingMode, setRatingMode] = useState<RatingMode>('SEASON')
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL')
  const [liveToss, setLiveToss] = useState(true)
  const [worldTeams, setWorldTeams] = useState(true)
  const [overseasCap, setOverseasCap] = useState(true)
  const [teamName, setTeamName] = useState('')
  const hideRatings = DIFFICULTY[difficulty].hideRatings

  const allTeams = useMemo(() => teamsForFormat(format), [format])
  const preset = presetById(presetId)

  /** A scope choice is only offered when it can actually fill the chosen XI. */
  const viable = useMemo(() => {
    const check = (c: Partial<DraftConfig>) =>
      canFillPreset(
        poolFor({
          format,
          scope: 'ALL',
          teamKey: null,
          era: null,
          presetId,
          ratingMode,
          hideRatings,
          worldTeams,
          years,
          ...c,
        } as DraftConfig),
        presetId,
      )
    return {
      teams: Object.fromEntries(allTeams.map((t) => [t.key, check({ scope: 'TEAM', teamKey: t.key })])),
      years: check({ scope: 'ALL', years }),
    }
  }, [format, presetId, allTeams, hideRatings, ratingMode, worldTeams, years])

  /**
   * Only sides deep enough to build the chosen XI from. A club that played one
   * short season cannot supply eleven men in the right roles, and listing it
   * greyed out just asks the player to keep discovering that for themselves.
   */
  const teams = useMemo(
    () => allTeams.filter((t) => viable.teams[t.key]),
    [allTeams, viable],
  )

  const config: DraftConfig = {
    format,
    scope,
    teamKey,
    years,
    presetId,
    ratingMode,
    hideRatings,
    difficulty,
    liveToss,
    worldTeams,
    overseasCap,
    teamName: teamName.trim().toUpperCase() || 'YOUR XI',
  }
  const yearsAll = years[0] === span[0] && years[1] === span[1]
  const ready =
    viable.years && (scope === 'ALL' || (scope === 'TEAM' && !!teamKey && viable.teams[teamKey]))

  // Narrowing the league to Indian sides can strand a chosen overseas club.
  const onWorldTeams = () =>
    setWorldTeams((v) => {
      if (v) setTeamKey(null)
      return !v
    })

  // Switching format can invalidate a chosen side, and always changes which
  // years exist: T20 internationals start in 2005, Tests at the beginning.
  const onFormat = (f: Format) => {
    setFormat(f)
    setTeamKey(null)
    setYears(yearsForFormat(f))
    if (scope === 'TEAM') setScope('ALL')
  }

  return (
    <div>
      <h1 className="display text-[30px] md:text-[38px]">New draft</h1>
      <p className="mt-1.5 text-[12.5px] text-moss">
        Pick a tournament, choose how wide the pool is, then set your batting order.
      </p>

      {/* ── Team name ── */}
      <div className="mt-7">
        <SectionLabel>team name</SectionLabel>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value.slice(0, 18))}
          placeholder="YOUR XI"
          className="w-full rounded-xl border border-white/[0.08] bg-ink-700 px-3.5 py-3 text-[15px] font-extrabold uppercase tracking-[0.06em] text-cream placeholder:text-moss/50 focus:border-pitch/50 focus:outline-none"
        />
        <p className="mt-1.5 text-[10.5px] text-moss">
          Goes on your result card and anything you share. Skip it and you stay “Your XI”.
        </p>
      </div>

      {/* ── Tournament ── */}
      <div className="mt-7">
        <SectionLabel>tournament</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {FORMAT_ORDER.map((f) => {
            const t = TOURNAMENTS[f]
            return (
              <Option key={f} active={format === f} onClick={() => onFormat(f)}>
                <div className="flex items-baseline justify-between">
                  <span className={`label ${format === f ? 'text-pitch' : ''}`}>{t.short}</span>
                  <span className="tnum text-[9.5px] font-bold text-gold">{t.perfect}</span>
                </div>
                <div className="display mt-1 text-[13.5px] leading-tight">{t.name}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-moss">{t.blurb}</div>
              </Option>
            )
          })}
        </div>
      </div>

      {/* ── Pool ── */}
      <div className="mt-7">
        <SectionLabel>draft pool</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Option active={scope === 'ALL'} onClick={() => setScope('ALL')} note="every side">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.04em]">All-time</span>
          </Option>
          <Option active={scope === 'TEAM'} onClick={() => setScope('TEAM')} note="one side's history">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.04em]">One team</span>
          </Option>
        </div>

        {scope === 'TEAM' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
              {teams.map((t) => (
                <Option
                  key={t.key}
                  active={teamKey === t.key}
                  onClick={() => setTeamKey(t.key)}
                  note={`${t.squads.length} season${t.squads.length === 1 ? '' : 's'}`}
                >
                  <span className="flex items-center gap-2">
                    <TeamCrest teamKey={t.key} teamName={t.label} size={22} />
                  <span className="block truncate text-[11.5px] font-extrabold uppercase tracking-[0.03em]">
                    {t.label}
                  </span>
                  </span>
                </Option>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-moss">
              {teams.length} side{teams.length === 1 ? '' : 's'} deep enough for this batting order.
              {allTeams.length > teams.length &&
                ` ${allTeams.length - teams.length} more can't fill it — try a different team balance.`}
            </p>
          </motion.div>
        )}


        {/* ── Years ──
            Always on, whichever pool is chosen: a range of seasons is a
            different question from which sides are in the draw, and the two
            used to be one button that could only answer one of them. */}
        <div className="mt-4">
          <SectionLabel right={<span className="label">{yearsAll ? 'every season' : `${years[1] - years[0] + 1} of ${span[1] - span[0] + 1} years`}</span>}>
            seasons
          </SectionLabel>
          <div className="rounded-xl border border-white/[0.08] bg-ink-700 px-3.5 pb-2 pt-3">
            <YearRange min={span[0]} max={span[1]} value={years} onChange={setYears} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip on={yearsAll} onClick={() => setYears(span)}>all {span[0]}–{span[1]}</Chip>
              {DECADES.filter(([, from, to]) => to >= span[0] && from <= span[1]).map(([label, from, to]) => {
                const clipped: [number, number] = [Math.max(from, span[0]), Math.min(to, span[1])]
                return (
                  <Chip
                    key={label}
                    on={years[0] === clipped[0] && years[1] === clipped[1]}
                    onClick={() => setYears(clipped)}
                  >
                    {label}
                  </Chip>
                )
              })}
              <Chip on={years[0] === span[1] && years[1] === span[1]} onClick={() => setYears([span[1], span[1]])}>
                latest only
              </Chip>
            </div>
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-moss">
            {viable.years
              ? yearsAll
                ? 'Every season the archive holds for this tournament.'
                : `Only sides that played between ${years[0]} and ${years[1]} are in the draw.`
              : 'Too few sides in those years to fill this batting order — widen the range, or change the team balance.'}
          </p>
        </div>
      </div>

      {/* ── Player ratings ── */}
      <div className="mt-7">
        <SectionLabel right={<span className="label">applies to both sides</span>}>
          player ratings
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {(['SEASON', 'PRIME'] as RatingMode[]).map((m) => (
            <Option
              key={m}
              active={ratingMode === m}
              onClick={() => setRatingMode(m)}
              note={RATING_MODE[m].note}
            >
              <span className="text-[12px] font-extrabold uppercase tracking-[0.04em]">
                {RATING_MODE[m].label}
              </span>
              <div className="mt-1 text-[10px] leading-snug text-moss">{RATING_MODE[m].desc}</div>
            </Option>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-moss">
          Opponents are rated the same way you are — prime sides for a prime draft — so the
          tournament stays a contest either way.
        </p>
      </div>

      {/* ── Team balance ── */}
      <div className="mt-7">
        <SectionLabel>team balance</SectionLabel>
        <div className="grid gap-2 md:grid-cols-2">
          {PRESETS.map((p) => (
            <Option key={p.id} active={presetId === p.id} onClick={() => setPresetId(p.id)}>
              <span className="text-[12px] font-extrabold uppercase tracking-[0.04em]">{p.name}</span>
              <div className="mt-1 text-[10px] leading-snug text-moss">{p.desc}</div>
            </Option>
          ))}
        </div>
      </div>

      {/* ── Required XI ── */}
      <div className="mt-6">
        <SectionLabel>required XI</SectionLabel>
        <div className="surface flex flex-wrap gap-1 p-3">
          {preset.slots.map((role, i) => {
            const r = ROLE_STYLE[role]
            return (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] font-bold uppercase tracking-label ${r.border} ${r.bg} ${r.text}`}
              >
                <span className="tnum opacity-50">#{i + 1}</span>
                {role}
              </span>
            )
          })}
        </div>
      </div>

      {/* ── Difficulty ── */}
      <div className="mt-7">
        <SectionLabel>difficulty</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {(['EASY', 'NORMAL', 'HARD'] as Difficulty[]).map((d) => (
            <Option
              key={d}
              active={difficulty === d}
              onClick={() => setDifficulty(d)}
              note={DIFFICULTY[d].note}
            >
              <span className="text-[12px] font-extrabold uppercase tracking-[0.04em]">
                {DIFFICULTY[d].label}
              </span>
            </Option>
          ))}
        </div>
        {hideRatings && (
          <p className="mt-2 text-[10.5px] leading-snug text-gold/80">
            From-memory mode: ratings stay hidden all draft. Trust your cricket brain.
          </p>
        )}
      </div>

      {/* ── Match rules ── */}
      <div className="mt-7">
        <SectionLabel>match rules</SectionLabel>
        <div className="grid gap-2">
          <Toggle
            on={liveToss}
            onToggle={() => setLiveToss((v) => !v)}
            title="Call the toss"
            desc="Call heads or tails before every knockout, then choose to bat or bowl."
          />
          {format === 'T20L' && (
            <>
              <Toggle
                on={worldTeams}
                onToggle={onWorldTeams}
                title="Clubs from around the world"
                desc={
                  worldTeams
                    ? 'Sydney, Lahore, Barbados and the rest join the draw — and the season.'
                    : 'The Indian league on its own: fifteen franchises, eighteen seasons.'
                }
              />
              <Toggle
                on={worldTeams ? false : overseasCap}
                onToggle={() => setOverseasCap((v) => !v)}
                locked={worldTeams}
                title={`Overseas cap · max ${OVERSEAS_LIMIT}`}
                desc={
                  worldTeams
                    ? 'No cap in a world league — with every country in the draw, nobody is an import.'
                    : 'League rules: no more than four overseas players in your XI.'
                }
              />
            </>
          )}
        </div>
      </div>

      <div className="mt-8">
        <Button size="lg" full disabled={!ready} onClick={() => onStart(config)}>
          Start draft →
        </Button>
        {!ready && (
          <p className="mt-2 text-center text-[10.5px] text-moss">
            {scope === 'TEAM' ? 'Choose a side to draft from.' : 'Choose an era to draft from.'}
          </p>
        )}
      </div>
    </div>
  )
}
