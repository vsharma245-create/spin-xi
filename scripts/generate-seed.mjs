/**
 * Generates supabase/seed.sql from the TypeScript roster archive.
 *
 * The archive is the source of truth until the database takes over; after
 * that, this script is how you re-seed a fresh environment. Nothing is
 * retyped by hand, so the migration cannot introduce transcription errors.
 *
 *   node scripts/generate-seed.mjs
 *
 * It also reports data-quality problems it finds on the way through —
 * conflicting nationalities for the same player, squads too thin to field an
 * XI — because a migration is the best moment to notice them.
 */
import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

/** Bundle the data module and run it, so we read exactly what the app reads. */
async function loadArchive() {
  const dir = await mkdtemp(join(tmpdir(), 'spinxi-'))
  const entry = join(dir, 'entry.mjs')
  const out = join(dir, 'bundle.mjs')
  await writeFile(
    entry,
    `import { SQUADS } from ${JSON.stringify(join(ROOT, 'src/data/squads.ts'))}
     process.stdout.write(JSON.stringify(SQUADS))`,
  )
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' })
  const { execFileSync } = await import('node:child_process')
  return JSON.parse(execFileSync(process.execPath, [out], { maxBuffer: 1 << 28 }).toString())
}

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = (list) => `'{${list.map((v) => `"${v}"`).join(',')}}'`
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Batched multi-row inserts: one statement per 400 rows keeps the editor happy. */
function insert(table, columns, rows, batch = 400) {
  const out = []
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch)
    out.push(
      `insert into ${table} (${columns.join(', ')}) values\n` +
        chunk.map((r) => `  (${r.join(', ')})`).join(',\n') +
        `\non conflict do nothing;`,
    )
  }
  return out.join('\n\n')
}

const squads = await loadArchive()

/* ── Teams ─────────────────────────────────────────────────────────────── */

const teams = new Map()
for (const s of squads) {
  const intl = !s.formats.includes('T20L')
  teams.set(s.teamKey, {
    key: s.teamKey,
    region: intl ? 'INTL' : s.region,
    home: intl ? s.players[0]?.nation ?? null : s.region === 'WORLD' ? s.players[0]?.nation ?? null : 'IN',
  })
}

/* ── Players, and the nationality check ────────────────────────────────── */

const nationsSeen = new Map()
const players = new Map()
for (const s of squads) {
  for (const p of s.players) {
    const id = slug(p.name)
    if (!players.has(id)) players.set(id, { id, name: p.name, surname: p.surname, nation: p.nation })
    const seen = nationsSeen.get(id) ?? new Map()
    seen.set(p.nation, (seen.get(p.nation) ?? 0) + 1)
    nationsSeen.set(id, seen)
  }
}

const conflicts = []
for (const [id, seen] of nationsSeen) {
  if (seen.size > 1) {
    // Take the most common reading, and say which ones disagreed.
    const ranked = [...seen].sort((a, b) => b[1] - a[1])
    players.get(id).nation = ranked[0][0]
    conflicts.push(`${players.get(id).name}: ${ranked.map(([n, c]) => `${n}×${c}`).join(', ')}`)
  }
}

/* ── Rows ──────────────────────────────────────────────────────────────── */

const teamRows = [...teams.values()].map((t) => [q(t.key), q(t.region), q(t.home)])
const playerRows = [...players.values()].map((p) => [q(p.id), q(p.name), q(p.surname), q(p.nation)])
const squadRows = squads.map((s) => [
  q(s.id), q(s.teamKey), q(s.team), q(s.teamShort), q(s.season), q(s.comp), arr(s.formats),
])

const rosterRows = []
for (const s of squads) {
  for (const p of s.players) {
    rosterRows.push([
      q(s.id), q(slug(p.name)), q(p.role), p.ovr,
      p.stats[0].value, p.stats[1].value, p.stats[2].value,
      arr(p.alt),
    ])
  }
}

/* ── Challenges: the rotation the client walks by day ──────────────────── */

const FORMAT_CYCLE = ['T20L', 'ODIWC', 'T20L', 'T20WC', 'T20L', 'TEST', 'ODIWC']
const PRESET_CYCLE = ['BALANCED', 'CLASSIC_ODI', 'BALANCED', 'PACE_BATTERY', 'BALANCED', 'AR_ARMY']
const OBJECTIVES = [
  ['SET AND DEFEND', 'Win 4+ matches batting first.'],
  ['CHASE MASTER', 'Win 5+ matches chasing a target.'],
  ['GO UNBEATEN', 'Finish the group stage without a loss.'],
  ['LIFT THE TROPHY', 'Win the final. Nothing else counts.'],
]
// One slot per day of a 84-day cycle: the lowest common multiple of the three
// rotations, so the pairing of format, shape and objective never repeats early.
const challengeRows = []
for (let slot = 0; slot < 84; slot++) {
  const [title, desc] = OBJECTIVES[slot % OBJECTIVES.length]
  challengeRows.push([
    slot,
    q(FORMAT_CYCLE[slot % FORMAT_CYCLE.length]),
    q(PRESET_CYCLE[slot % PRESET_CYCLE.length]),
    q(title),
    q(desc),
    'true',
  ])
}

/* ── Emit ──────────────────────────────────────────────────────────────── */

const sql = `-- SPIN XI — seed data
-- Generated by scripts/generate-seed.mjs. Do not edit by hand: regenerate.
--
--   ${squads.length} squad-seasons · ${rosterRows.length} player-seasons · ${players.size} players
--
-- Run schema.sql first, then this. Safe to re-run: every insert is
-- "on conflict do nothing".

begin;

${insert('teams', ['key', 'region', 'home_nation'], teamRows)}

${insert('players', ['id', 'name', 'surname', 'nation'], playerRows)}

${insert('squads', ['id', 'team_key', 'team_name', 'team_short', 'season', 'competition', 'formats'], squadRows)}

${insert('squad_players', ['squad_id', 'player_id', 'role', 'ovr', 's1', 's2', 's3', 'alt_roles'], rosterRows)}

${insert('challenges', ['slot', 'format', 'preset_id', 'objective', 'objective_desc', 'active'], challengeRows)}

commit;
`

await writeFile(join(ROOT, 'supabase/seed.sql'), sql)

const thin = squads.filter((s) => s.players.length < 11)
console.log(`seed.sql written`)
console.log(`  ${teams.size} teams · ${players.size} players · ${squads.length} squads · ${rosterRows.length} roster rows`)
console.log(`  ${(sql.length / 1024).toFixed(0)} KB of SQL`)
if (conflicts.length) {
  console.log(`\n  ${conflicts.length} nationality conflicts — most common reading used:`)
  for (const c of conflicts) console.log(`    ${c}`)
}
if (thin.length) {
  console.log(`\n  ${thin.length} squads with fewer than 11 players:`)
  for (const s of thin) console.log(`    ${s.teamShort} ${s.season} (${s.players.length})`)
}
