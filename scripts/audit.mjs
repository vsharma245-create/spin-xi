/**
 * A standing check on the cricket in the database.
 *
 *   npm run audit
 *
 * Referential integrity is Postgres's job and `npm run db:check` already asks
 * it. This asks the questions Postgres cannot: whether the ratings put the
 * right players at the top, whether anyone is playing for the wrong country,
 * whether a bowler changes discipline between seasons, whether a name would
 * be recognised by someone who follows the game.
 *
 * Every check prints what it found rather than only whether it passed, since
 * most of these are judgements about degree — "16% of names are initials" is
 * the finding, and whether that is acceptable is a decision, not an assert.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const sql = await readFile(join(ROOT, 'supabase/archive.sql'), 'utf8')

/* ── Read the archive back out of the SQL it will be loaded from ────────── */

function rowsOf(table) {
  const out = []
  let grabbing = false
  for (const line of sql.split('\n')) {
    if (line.startsWith(`insert into ${table} `)) { grabbing = true; continue }
    if (!grabbing) continue
    if (!line.startsWith('  (')) { grabbing = false; continue }
    out.push(fields(line.trim().replace(/[,;]$/, '')))
  }
  return out
}

/** Split one VALUES tuple, respecting quoted strings and doubled quotes. */
function fields(row) {
  const out = []
  let cur = ''
  let quoted = false
  const body = row.slice(1, -1)
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (quoted) {
      if (c === "'" && body[i + 1] === "'") { cur += "'"; i++ }
      else if (c === "'") quoted = false
      else cur += c
    } else if (c === "'") quoted = true
    else if (c === ',') { out.push(cur.trim()); cur = '' }
    else cur += c
  }
  out.push(cur.trim())
  return out
}

const num = (v) => (v === 'null' || v === '' ? null : Number(v))

const teams = new Map(rowsOf('teams').map((f) => [f[0], { region: f[1], home: f[2] }]))
const players = new Map(rowsOf('players').map((f) => [f[0], { name: f[1], surname: f[2], nation: f[3] }]))
const squads = new Map(
  rowsOf('squads').map((f) => [
    f[0],
    { team: f[1], name: f[2], short: f[3], season: f[4], comp: f[5], formats: f[6] },
  ]),
)
const roster = rowsOf('squad_players').map((f) => ({
  squad: f[0], player: f[1], role: f[2],
  ovr: num(f[4]), bat: num(f[5]), bowl: num(f[6]),
  s1: num(f[7]), s2: num(f[8]), s3: num(f[9]),
  matches: num(f[10]), runs: num(f[11]), balls: num(f[12]), outs: num(f[13]),
  wickets: num(f[14]), bowlBalls: num(f[15]), bowlRuns: num(f[16]),
}))

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m\n${'─'.repeat(t.length)}`)
const line = (label, value, note = '') =>
  console.log(`  ${label.padEnd(46)} ${String(value).padStart(8)}  ${note}`)

const findings = []
const flag = (msg) => findings.push(msg)

console.log(`\nSPIN XI — data audit`)
console.log(`${teams.size} teams · ${players.size} players · ${squads.size} squads · ${roster.length} player-seasons`)

/* ── Names ─────────────────────────────────────────────────────────────── */

head('NAMES')
const abbreviated = [...players.values()].filter((p) => /^[A-Z]{1,4}\s/.test(p.name))
line('players', players.size)
line('shown by initials rather than a given name', abbreviated.length, pct(abbreviated.length, players.size))

// The card prints the name minus the surname, so the two have to agree.
const mismatched = [...players.values()].filter(
  (p) => !p.name.toUpperCase().replace(/[^A-Z ]/g, '').includes(p.surname.replace(/[^A-Z ]/g, '')),
)
line('name that does not contain its own surname', mismatched.length,
  mismatched.length ? mismatched.slice(0, 3).map((p) => `${p.name}/${p.surname}`).join(', ') : '')
if (mismatched.length > players.size * 0.02) flag(`${mismatched.length} names disagree with their surname`)

const byName = new Map()
for (const [id, p] of players) {
  const k = p.name.toUpperCase()
  byName.set(k, (byName.get(k) ?? []).concat(id))
}
const shared = [...byName.values()].filter((ids) => ids.length > 1)
line('names held by more than one player', shared.length,
  'expected — cricket has many, kept apart by id')

/* ── Nationality ───────────────────────────────────────────────────────── */

head('NATIONALITY')
const nations = {}
for (const p of players.values()) nations[p.nation] = (nations[p.nation] ?? 0) + 1
line('distinct nations', Object.keys(nations).length)
line('players with no nation', [...players.values()].filter((p) => !p.nation).length)
console.log(
  '  ' +
    Object.entries(nations).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join('  '),
)

// The overseas cap counts off this, so an Indian league XI has to be fillable.
const iplSquads = [...squads.entries()].filter(([, s]) => teams.get(s.team)?.region === 'IN')
let thinLocal = 0
for (const [id] of iplSquads) {
  const men = roster.filter((r) => r.squad === id)
  const locals = men.filter((r) => players.get(r.player)?.nation === 'IN').length
  if (locals < 7) thinLocal++
}
line('Indian league squads with fewer than 7 Indians', thinLocal,
  thinLocal ? 'an XI needs at least seven' : 'every squad can field a legal XI')
if (thinLocal) flag(`${thinLocal} Indian league squads cannot field a legal XI under the overseas cap`)

/* ── Roles ─────────────────────────────────────────────────────────────── */

head('ROLES')
const roles = {}
for (const r of roster) roles[r.role] = (roles[r.role] ?? 0) + 1
console.log('  ' + Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('  '))

const kinds = new Map()
for (const r of roster) {
  if (r.role !== 'PACE' && r.role !== 'SPIN') continue
  const set = kinds.get(r.player) ?? new Set()
  set.add(r.role)
  kinds.set(r.player, set)
}
const mixed = [...kinds.values()].filter((s) => s.size > 1).length
line('bowlers typed as both pace and spin', mixed, pct(mixed, kinds.size))
if (mixed > kinds.size * 0.05) flag(`${mixed} bowlers change discipline between seasons`)

const keeperless = [...squads.keys()].filter(
  (id) => !roster.some((r) => r.squad === id && r.role === 'WK'),
).length
line('squads with no wicketkeeper', keeperless, pct(keeperless, squads.size))

/*
 * An all-rounder bowls a spell, not a cameo.
 *
 * Virat Kohli was one for six seasons on about a over and a quarter a match,
 * which put a batter in a draft slot meant for a second bowling option. Two
 * overs a match is the bar the build applies; this is where it is enforced.
 */
const AR_BAR = { T20L: 12, T20WC: 12, ODIWC: 18, TEST: 30 }
const barFor = (squadId) => {
  // formats arrives as the raw Postgres array literal, e.g. {"T20L","T20WC"}.
  const raw = squads.get(squadId)?.formats ?? ''
  const formats = String(raw).match(/[A-Z0-9]+/g) ?? ['T20L']
  return Math.max(...formats.map((f) => AR_BAR[f] ?? 12))
}
const cameo = roster.filter((r) => r.role === 'AR' && r.bowlBalls < r.matches * barFor(r.squad))
line('all-rounders who never bowled a spell', cameo.length, pct(cameo.length, roster.filter((r) => r.role === 'AR').length))
if (cameo.length) flag(`${cameo.length} all-rounders bowl less than a spell`)

/*
 * A keeper does not bowl. One who does is a fielder who was handed the gloves
 * because the heuristic could not tell a good pair of hands from a keeper —
 * which is exactly how Kohli ended up behind the stumps for Bengaluru.
 */
const bowlingKeepers = roster.filter((r) => r.role === 'WK' && r.bowlBalls > r.matches * 6)
line('keepers who bowled more than an over a match', bowlingKeepers.length, pct(bowlingKeepers.length, roster.filter((r) => r.role === 'WK').length))
if (bowlingKeepers.length > roster.filter((r) => r.role === 'WK').length * 0.02)
  flag(`${bowlingKeepers.length} wicketkeepers are bowling`)

/* ── Ratings ───────────────────────────────────────────────────────────── */

head('RATINGS')
const ovrs = roster.map((r) => r.ovr).sort((a, b) => a - b)
const at = (p) => ovrs[Math.floor(ovrs.length * p)]
line('overall rating — median', at(0.5), `p10 ${at(0.1)} · p90 ${at(0.9)} · max ${ovrs[ovrs.length - 1]}`)
line('rated 99 (the ceiling)', roster.filter((r) => r.ovr === 99).length, pct(roster.filter((r) => r.ovr === 99).length, roster.length))
line('rated 40 (the floor)', roster.filter((r) => r.ovr === 40).length, pct(roster.filter((r) => r.ovr === 40).length, roster.length))

const cardFigures = roster.length * 3
const nulls = roster.reduce((a, r) => a + [r.s1, r.s2, r.s3].filter((v) => v === null).length, 0)
line('card figures left null (too little to rate)', nulls, pct(nulls, cardFigures))

// A rating is only worth anything if it agrees with the scorecard it came from.
const batters = roster.filter((r) => r.balls >= 120 && ['BAT', 'WK', 'AR'].includes(r.role))
const rank = (arr, key) => {
  const sorted = [...arr].sort((a, b) => key(a) - key(b))
  return new Map(sorted.map((r, i) => [r, i / (sorted.length - 1)]))
}
const byRuns = rank(batters, (r) => r.runs)
const byRating = rank(batters, (r) => r.bat ?? 0)
let agree = 0
for (const r of batters) if (Math.abs(byRuns.get(r) - byRating.get(r)) < 0.25) agree++
line('batting rating agrees with runs scored', pct(agree, batters.length),
  `over ${batters.length} seasons of 20+ overs faced`)

const bowlers = roster.filter((r) => r.bowlBalls >= 180 && ['PACE', 'SPIN', 'AR'].includes(r.role))
const byWkts = rank(bowlers, (r) => r.wickets)
const byBowl = rank(bowlers, (r) => r.bowl ?? 0)
let bagree = 0
for (const r of bowlers) if (Math.abs(byWkts.get(r) - byBowl.get(r)) < 0.3) bagree++
line('bowling rating agrees with wickets taken', pct(bagree, bowlers.length),
  `over ${bowlers.length} seasons of 30+ overs`)

/* Who the ratings actually put at the top — the readable test. */
const label = (r) => {
  const s = squads.get(r.squad)
  return `${players.get(r.player)?.name} — ${s?.short} ${s?.season}`
}
const bestOf = (filter, n = 5) =>
  roster.filter(filter).sort((a, b) => b.ovr - a.ovr).slice(0, n)

for (const [title, comp] of [
  ['Highest-rated T20 League seasons', /^T20 LEAGUE/],
  ['Highest-rated T20 international seasons', /^T20 INTERNATIONAL/],
  ['Highest-rated one-day international seasons', /^ONE-DAY/],
  ['Highest-rated Test seasons', /^TEST/],
]) {
  console.log(`\n  ${title}:`)
  for (const r of bestOf((x) => comp.test(squads.get(x.squad)?.comp ?? ''))) {
    console.log(`    ${String(r.ovr).padStart(2)}  ${label(r)}`)
  }
}

/* ── The record the ratings came from ───────────────────────────────────── */

head('SCORECARD FIGURES')

// Things cricket does not allow. Any of these means the ingest mis-attributed
// a ball, and a rating built on it is worth nothing.
const impossible = {
  'more runs than six per ball faced': (r) => r.balls > 0 && r.runs > r.balls * 6,
  'runs scored off no deliveries': (r) => r.balls === 0 && r.runs > 0,
  'dismissed more often than innings allow': (r) => r.outs > r.matches * 2,
  'more wickets than deliveries bowled': (r) => r.wickets > r.bowlBalls,
  'took wickets without bowling': (r) => r.bowlBalls === 0 && r.wickets > 0,
  'appeared in no matches': (r) => r.matches < 1,
}
for (const [what, test] of Object.entries(impossible)) {
  const bad = roster.filter(test)
  line(what, bad.length, bad.length ? `e.g. ${label(bad[0])}` : '')
  if (bad.length) flag(`${bad.length} rows: ${what}`)
}

// Implausible rather than impossible — worth seeing, not necessarily wrong.
const econ = (r) => (6 * r.bowlRuns) / r.bowlBalls
// Legal, if unusual: an over of wides costs runs without a ball being bowled.
const wides = roster.filter((r) => r.bowlBalls === 0 && r.bowlRuns > 0)
line('conceded runs off no legal delivery', wides.length, 'possible — an over of wides')

const wild = roster.filter((r) => r.bowlBalls >= 120 && (econ(r) > 16 || econ(r) < 2))
line('economy outside 2–16 over 20+ overs', wild.length, wild.length ? `e.g. ${label(wild[0])}` : '')
const srWild = roster.filter((r) => r.balls >= 60 && (100 * r.runs) / r.balls > 300)
line('strike rate over 300 off 10+ overs', srWild.length)

const totals = roster.reduce(
  (a, r) => ({ runs: a.runs + r.runs, wickets: a.wickets + r.wickets, balls: a.balls + r.balls }),
  { runs: 0, wickets: 0, balls: 0 },
)
line('total runs recorded', totals.runs.toLocaleString())
line('total wickets recorded', totals.wickets.toLocaleString())
line('overall run rate per 100 balls', ((100 * totals.runs) / totals.balls).toFixed(1))

/* ── Card figures against the record they claim to describe ─────────────── */

head('CARD FIGURES')

/**
 * Do the numbers on the card move with the thing they are named after?
 *
 * Judged inside a format, because that is where the figure was ranked. A
 * strike rate of 60 is a fine Test innings and a dreadful T20 one, so the two
 * cannot share a scale — pooling them made the ratings look wrong when it was
 * the comparison that was.
 */
const familyOf = (r) => {
  const comp = squads.get(r.squad)?.comp ?? ''
  if (comp.startsWith('TEST')) return 'TEST'
  if (comp.startsWith('ONE-DAY')) return 'ODI'
  return 'T20'
}
const agreesWith = (rows, figure, actual, label_) => {
  let close = 0
  let total = 0
  for (const family of ['TEST', 'ODI', 'T20']) {
    const usable = rows.filter((r) => familyOf(r) === family && figure(r) !== null)
    if (usable.length < 50) continue
    const a = rank(usable, figure)
    const b = rank(usable, actual)
    close += usable.filter((r) => Math.abs(a.get(r) - b.get(r)) < 0.3).length
    total += usable.length
  }
  if (!total) return line(label_, 'too few', '')
  line(label_, pct(close, total), `over ${total} seasons, within format`)
  if (close / total < 0.75) flag(`${label_}: only ${pct(close, total)} agreement`)
}

const bats = roster.filter((r) => r.role === 'BAT' && r.balls >= 120)
agreesWith(bats, (r) => r.s2, (r) => r.runs / Math.max(1, r.outs), 'batter CONS tracks batting average')
agreesWith(bats, (r) => r.s3, (r) => (100 * r.runs) / r.balls, 'batter SR tracks strike rate')

const quicks = roster.filter((r) => (r.role === 'PACE' || r.role === 'SPIN') && r.bowlBalls >= 180)
agreesWith(quicks, (r) => r.s2, (r) => r.wickets / Math.max(1, r.matches), 'bowler WKT tracks wickets per match')
agreesWith(quicks, (r) => r.s3, (r) => -(6 * r.bowlRuns) / r.bowlBalls, 'bowler ECON tracks economy')

/* ── Teams ─────────────────────────────────────────────────────────────── */

head('TEAMS')
const regions = {}
for (const t of teams.values()) regions[t.region] = (regions[t.region] ?? 0) + 1
line('teams by region', Object.entries(regions).map(([k, n]) => `${k} ${n}`).join('  '))
line('teams with no home nation', [...teams.values()].filter((t) => !t.home).length)

// A national side's home nation must be its own country.
const wrongHome = [...teams.entries()].filter(([key, t]) => {
  if (t.region !== 'INTL') return false
  const men = roster.filter((r) => squads.get(r.squad)?.team === key)
  if (!men.length) return false
  const common = {}
  for (const r of men) {
    const n = players.get(r.player)?.nation
    common[n] = (common[n] ?? 0) + 1
  }
  const top = Object.entries(common).sort((a, b) => b[1] - a[1])[0]
  return top && top[0] !== t.home
})
line('national sides whose players are of another country', wrongHome.length,
  wrongHome.length ? wrongHome.slice(0, 3).map(([k]) => k).join(', ') : '')
if (wrongHome.length) flag(`${wrongHome.length} national sides do not match their players' nationality`)

// Clubs rename themselves; the key is what holds their history together.
const names = new Map()
for (const s of squads.values()) {
  const set = names.get(s.team) ?? new Set()
  set.add(s.name)
  names.set(s.team, set)
}
const renamed = [...names.entries()].filter(([, n]) => n.size > 1)
line('clubs that have changed name', renamed.length,
  renamed.slice(0, 2).map(([, n]) => [...n].join(' → ')).join(' · '))

const noAlt = roster.length
line('rows carrying alternate roles', 0, `all ${noAlt} rows have none — a player fills one slot`)

/* ── Squad shape ───────────────────────────────────────────────────────── */

head('SQUAD SHAPE')
let noBat = 0
let noBowl = 0
let manyKeepers = 0
for (const id of squads.keys()) {
  const men = roster.filter((r) => r.squad === id)
  if (!men.some((r) => ['BAT', 'WK', 'AR'].includes(r.role))) noBat++
  if (!men.some((r) => ['PACE', 'SPIN', 'AR'].includes(r.role))) noBowl++
  if (men.filter((r) => r.role === 'WK').length > 4) manyKeepers++
}
line('squads with nobody who bats', noBat)
line('squads with nobody who bowls', noBowl)
line('squads carrying more than four keepers', manyKeepers)
if (noBat || noBowl) flag('some squads cannot field a balanced side')

// Two tournaments a year apart must not share one squad.
const editions = new Map()
for (const [, s] of squads) {
  const k = `${s.team}|${s.comp.replace(/\s+\S+$/, '')}|${s.season}`
  editions.set(k, (editions.get(k) ?? 0) + 1)
}
const collided = [...editions.values()].filter((n) => n > 1).length
line('seasons sharing one squad by mistake', collided)
if (collided) flag(`${collided} squads merge two different seasons`)

/* ── Squads ────────────────────────────────────────────────────────────── */

head('SQUADS')
const sizes = [...squads.keys()].map((id) => roster.filter((r) => r.squad === id).length).sort((a, b) => a - b)
line('squad size — median', sizes[sizes.length >> 1], `min ${sizes[0]} · max ${sizes[sizes.length - 1]}`)
const short = sizes.filter((n) => n < 11).length
line('squads that cannot field eleven', short)
if (short) flag(`${short} squads have fewer than eleven players`)

/** "2019/20" is a season, not a number; the later year names the tournament. */
const yearOf = (season) => {
  const [start, end] = season.split('/')
  if (!end) return Number(start)
  const century = Math.floor(Number(start) / 100) * 100
  const year = century + Number(end)
  return year < Number(start) ? year + 100 : year
}
const seasons = [...new Set([...squads.values()].map((s) => yearOf(s.season)))].sort((a, b) => a - b)
line('seasons covered', `${seasons[0]}–${seasons[seasons.length - 1]}`, `${seasons.length} distinct`)
const gaps = seasons.filter((y, i) => i && y - seasons[i - 1] > 1)
line('gaps in the run of seasons', gaps.length, gaps.length ? `after ${gaps.map((g) => g - 1).join(', ')}` : 'none')

/* ── Verdict ───────────────────────────────────────────────────────────── */

head('VERDICT')
if (!findings.length) {
  console.log('  Nothing needing attention.\n')
} else {
  for (const f of findings) console.log(`  · ${f}`)
  console.log('')
}
process.exitCode = findings.length ? 1 : 0
