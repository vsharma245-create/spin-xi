/**
 * Every roster row, checked one at a time.
 *
 * The audit reports rates — 98% of this, 100% of that — which is the right
 * shape for judging a dataset and the wrong shape for trusting a row. This
 * asks of each of the forty-two thousand: is there anything here that could
 * not be true of a cricketer who played that season?
 *
 * It prints the offenders, not a percentage.
 *
 *   npm run rows:check
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const db = new PGlite()
await db.exec(await readFile('supabase/schema.sql', 'utf8'))
await db.exec(await readFile('supabase/archive.sql', 'utf8'))

type Row = {
  squad_id: string; player_id: string; name: string; surname: string; nation: string
  role: string; ovr: number; bat: number | null; bowl: number | null
  s1: number | null; s2: number | null; s3: number | null
  matches: number; runs: number; balls: number; outs: number
  wickets: number; bowl_balls: number; bowl_runs: number
  season: string; team_name: string; formats: string
}

const { rows } = (await db.query(`
  select sp.*, p.name, p.surname, p.nation, s.season, s.team_name, s.formats::text as formats
  from squad_players sp
    join players p on p.id = sp.player_id
    join squads  s on s.id = sp.squad_id
`)) as { rows: Row[] }

const NATIONS = new Set(
  (await db.query('select distinct nation from players')).rows.map((r: { nation: string }) => r.nation),
)
const ROLES = new Set(['BAT', 'WK', 'AR', 'PACE', 'SPIN'])

/** Each rule answers: could this row describe a real cricketer's season? */
const RULES: [string, (r: Row) => boolean][] = [
  ['a name',                     (r) => !!r.name?.trim() && !!r.surname?.trim()],
  ['a name that is not an id',   (r) => !/^[0-9a-f]{8}$/.test(r.name)],
  ['a known country',            (r) => /^[A-Z]{2}$/.test(r.nation) && NATIONS.has(r.nation)],
  ['a real role',                (r) => ROLES.has(r.role)],
  ['an overall in range',        (r) => r.ovr >= 40 && r.ovr <= 99],
  ['batting in range',           (r) => r.bat === null || (r.bat >= 40 && r.bat <= 99)],
  ['bowling in range',           (r) => r.bowl === null || (r.bowl >= 40 && r.bowl <= 99)],
  ['card figures in range',      (r) => [r.s1, r.s2, r.s3].every((v) => v === null || (v >= 20 && v <= 99))],
  ['at least one match',         (r) => r.matches >= 1],
  ['nothing negative',           (r) => [r.runs, r.balls, r.outs, r.wickets, r.bowl_balls, r.bowl_runs].every((v) => v >= 0)],
  ['runs that fit the balls',    (r) => r.runs <= r.balls * 6],
  ['dismissals that fit',        (r) => r.outs <= r.matches * 2],
  ['wickets that fit the balls', (r) => r.wickets <= r.bowl_balls],
  ['no wickets without bowling', (r) => !(r.bowl_balls === 0 && r.wickets > 0)],
  ['runs conceded that fit',     (r) => r.bowl_runs <= r.bowl_balls * 8 + 40],
  ['a bowler who bowled',        (r) => !((r.role === 'PACE' || r.role === 'SPIN') && r.bowl_balls === 0)],
  ['a keeper who is not a quick',(r) => !(r.role === 'WK' && r.bowl_balls > r.matches * 12)],
  ['a season it could belong to',(r) => /^\d{4}(\/\d{2})?$/.test(r.season)],
  ['a squad that plays a format',(r) => /T20L|ODIWC|T20WC|TEST/.test(r.formats)],
]

const broken = new Map<string, Row[]>()
for (const r of rows) {
  for (const [what, holds] of RULES) {
    if (!holds(r)) (broken.get(what) ?? broken.set(what, []).get(what)!).push(r)
  }
}

console.log(`  ${rows.length.toLocaleString()} roster rows, ${RULES.length} rules each`)
let bad = 0
for (const [what, rs] of broken) {
  bad += rs.length
  const eg = rs[0]
  console.log(`  ${String(rs.length).padStart(6)} × missing ${what}`)
  console.log(`           e.g. ${eg.name} (${eg.nation}) ${eg.role} ${eg.team_name} ${eg.season}`)
}
console.log(bad ? `\n  ${bad} rows have something wrong` : '\n  every row holds')
process.exit(bad ? 1 : 0)
