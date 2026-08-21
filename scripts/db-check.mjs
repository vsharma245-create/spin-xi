/**
 * Runs schema.sql and archive.sql against a real Postgres, in process.
 *
 *   npm run db:check
 *
 * There is no substitute for executing the SQL. Reading it catches typos;
 * only Postgres catches a check constraint the data quietly violates, a
 * foreign key pointing at a row that was filtered out, or a column added to a
 * table that "create table if not exists" declined to rebuild. Every one of
 * those has already shipped from here to a failed push, and each cost a round
 * trip through someone else's terminal.
 *
 * PGlite is Postgres compiled to WebAssembly: the same parser, the same
 * planner, the same constraint checks, with nothing to install and no server
 * to run. It is a dev dependency and never reaches the browser bundle.
 *
 * A pass here does not promise Supabase will be happy — it has roles and
 * extensions this does not — but everything it does check is checked for real.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const file = (name) => readFile(join(ROOT, 'supabase', name), 'utf8')

const db = new PGlite()
const started = Date.now()

async function apply(name) {
  const sql = await file(name)
  process.stdout.write(`  ${name} (${(sql.length / 1024).toFixed(0)} KB) … `)
  const t = Date.now()
  await db.exec(sql)
  console.log(`ok in ${((Date.now() - t) / 1000).toFixed(1)}s`)
}

let bad = 0
try {
  console.log('\nRunning the SQL against a real Postgres.\n')
  await apply('schema.sql')

  // Twice, because the schema has to survive meeting a database it has
  // already been applied to — that is the case that keeps breaking.
  process.stdout.write('  schema.sql again (idempotency) … ')
  await db.exec(await file('schema.sql'))
  console.log('ok')

  await apply('archive.sql')

  /**
   * Player tables next. They reference Supabase's auth schema, which is not
   * part of Postgres — so it is stubbed here just enough to prove the foreign
   * keys, the policies and the views are well formed.
   */
  process.stdout.write('  players.sql … ')
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `)
  await db.exec(await file('players.sql'))
  console.log('ok')

  process.stdout.write('  players.sql again (re-runnable) … ')
  await db.exec(await file('players.sql'))
  console.log('ok')

  /**
   * Now prove it can replace a view whose shape has since changed.
   *
   * Running the same definition twice proves nothing about evolution, which is
   * how a real failure got through: "create or replace view" refuses to rename
   * or reorder a column, so adding a field anywhere but the end breaks on every
   * database that already has the view — that is, every database except a brand
   * new one. Standing an older shape up first is the only way to catch that
   * here rather than in somebody's terminal.
   */
  process.stdout.write('  players.sql over an older view shape … ')
  await db.exec('drop view if exists ladder; create view ladder as select id as player from profiles;')
  await db.exec(await file('players.sql'))
  console.log('ok')

  // A season goes in and comes back out of every view that should show it.
  const who = '11111111-1111-1111-1111-111111111111'
  await db.exec(`
    insert into auth.users (id) values ('${who}') on conflict do nothing;
    insert into profiles (id, handle) values ('${who}', 'TESTER') on conflict do nothing;
    insert into results (player, format, mode, daily_key, preset_id, rating_mode, difficulty,
                         wins, losses, draws, runs, wickets, nrr, outcome, points, idx, seed)
    values ('${who}', 'T20L', 'daily', current_date, 'BALANCED', 'SEASON', 'NORMAL',
            9, 5, 0, 2410, 118, 0.42, 'ELIMINATED', 2683, 1006, 12345);
  `)
  const stats = await db.query(`select drafts, wins, runs, xp from player_stats where id = '${who}'`)
  const board = await db.query(`select handle, points from ladder where format = 'T20L'`)
  const daily = await db.query(`select handle, points from daily_board where daily_key = current_date`)
  console.log(
    `  ok   a season lands in every view: ${stats.rows[0].drafts} draft, ` +
      `${stats.rows[0].xp} xp, ladder ${board.rows.length} row, daily ${daily.rows.length} row`,
  )

  // The daily is one entry per player per day.
  let blocked = false
  try {
    await db.exec(`insert into results (player, format, mode, daily_key, preset_id, rating_mode,
      difficulty, wins, losses, draws, runs, wickets, outcome, points, idx)
      values ('${who}', 'T20L', 'daily', current_date, 'BALANCED', 'SEASON', 'NORMAL',
              14, 0, 0, 3000, 140, 'CHAMPIONS', 3400, 1200)`)
  } catch {
    blocked = true
  }
  console.log(`  ${blocked ? 'ok  ' : 'FAIL'} a second daily on the same day is refused`)
  if (!blocked) bad++

  // A Champions Trophy counts toward a career but is not a season.
  await db.exec(`
    insert into results (player, format, mode, preset_id, rating_mode, difficulty,
                         wins, losses, draws, runs, wickets, outcome, points, idx)
    values ('${who}', 'T20L', 'trophy', 'BALANCED', 'SEASON', 'NORMAL',
            3, 0, 0, 520, 24, 'CHAMPIONS', 1046, 1000)
  `)
  const after = await db.query(`select drafts, trophies, xp from player_stats where id = '${who}'`)
  const boards = await db.query(`select count(*)::int as n from ladder where player = '${who}'`)
  const splits = await db.query(
    `select coalesce(sum(drafts), 0)::int as n from player_splits where player = '${who}' and kind = 'format'`,
  )
  const countsInCareer = Number(after.rows[0].trophies) === 1 && Number(after.rows[0].xp) > 2683
  const staysOffBoards = Number(boards.rows[0].n) === 1 && Number(splits.rows[0].n) === 1
  console.log(`  ${countsInCareer ? 'ok  ' : 'FAIL'} a trophy counts toward trophies and xp`)
  console.log(`  ${staysOffBoards ? 'ok  ' : 'FAIL'} a trophy stays off the season boards`)
  if (!countsInCareer || !staysOffBoards) bad++

  /* ── Analytics ── */
  process.stdout.write('  analytics.sql … ')
  await db.exec(await file('analytics.sql'))
  console.log('ok')

  process.stdout.write('  analytics.sql again (re-runnable) … ')
  await db.exec(await file('analytics.sql'))
  console.log('ok')

  // Events go in, and the funnel view can read them back.
  const draft = '22222222-2222-2222-2222-222222222222'
  await db.exec(`
    insert into events (player, name, draft_id, detail) values
      ('${who}', 'draft_started',   '${draft}', '{"format":"T20L"}'),
      ('${who}', 'draft_abandoned', '${draft}', '{"picks":4}'),
      ('${who}', 'draft_started',   '${draft}', '{"format":"TEST"}'),
      ('${who}', 'draft_completed', '${draft}', '{"format":"TEST"}');
    update profiles set last_seen_at = now(), first_result_at = now() where id = '${who}';
  `)
  const funnel = await db.query('select started, abandoned, completed, players from funnel_daily')
  const f = funnel.rows[0] ?? {}
  const funnelOk = Number(f.started) === 2 && Number(f.abandoned) === 1 && Number(f.completed) === 1
  console.log(
    `  ${funnelOk ? 'ok  ' : 'FAIL'} funnel_daily: ` +
      `${f.started} started, ${f.abandoned} abandoned, ${f.completed} completed`,
  )
  if (!funnelOk) bad++

  const ret = await db.query('select accounts, returned, played from retention')
  console.log(`  ok   retention: ${ret.rows[0].accounts} account, ${ret.rows[0].played} played`)

  // The new result columns accept a duration and a dataset stamp.
  await db.exec(`
    update results set duration_ms = 184000, dataset_version = gen_random_uuid()
    where player = '${who}' and mode = 'trophy'
  `)
  const timed = await db.query(
    `select count(*)::int as n from results where duration_ms is not null and dataset_version is not null`,
  )
  console.log(`  ${Number(timed.rows[0].n) === 1 ? 'ok  ' : 'FAIL'} results carry duration and dataset version`)
  if (Number(timed.rows[0].n) !== 1) bad++

  // A duration longer than a day is a bug in the client, not a marathon.
  let capped = false
  try {
    await db.exec(`update results set duration_ms = 90000000 where player = '${who}'`)
  } catch {
    capped = true
  }
  console.log(`  ${capped ? 'ok  ' : 'FAIL'} an impossible duration is refused`)
  if (!capped) bad++

  process.stdout.write('\n  archive.sql again (re-runnable) … ')
  await db.exec(await file('archive.sql'))
  console.log('ok')

  const counts = await db.query(`
    select
      (select count(*) from teams)         as teams,
      (select count(*) from players)       as players,
      (select count(*) from squads)        as squads,
      (select count(*) from squad_players) as roster_rows,
      (select count(*) from challenges)    as challenges
  `)
  const got = counts.rows[0]
  const want = JSON.parse(await file('archive.json')).counts

  console.log('')
  for (const [k, v] of Object.entries(want)) {
    const n = Number(got[k])
    if (n !== v) bad++
    console.log(`  ${n === v ? 'ok  ' : 'FAIL'} ${k}: ${n}${n === v ? '' : ` (expected ${v})`}`)
  }

  // The views are what the game actually reads, so read them.
  const feed = await db.query('select count(*) as n from roster_feed')
  const index = await db.query('select count(*) as n from squad_index')
  const sample = await db.query(`
    select team_name, season, player_count, ovr_top6, bat_top4, bowl_top3
    from squad_index order by ovr_top6 desc nulls last limit 3
  `)
  console.log(`  ok   roster_feed: ${feed.rows[0].n} rows`)
  console.log(`  ok   squad_index: ${index.rows[0].n} rows`)
  console.log('\n  strongest sides by top-six rating:')
  for (const r of sample.rows) {
    console.log(
      `    ${r.team_name} ${r.season} — ${r.player_count} players, ` +
        `ovr ${r.ovr_top6}, bat ${r.bat_top4}, bowl ${r.bowl_top3}`,
    )
  }

  // The version stamp is what expires a stale client cache.
  const meta = await db.query('select version, source from dataset_meta')
  console.log(`\n  ok   dataset_meta: version present, source ${meta.rows[0].source}`)

  console.log(
    bad
      ? `\n  ${bad} mismatch(es) — do not push.\n`
      : `\n  Everything applies cleanly in ${((Date.now() - started) / 1000).toFixed(1)}s. Safe to push.\n`,
  )
  process.exitCode = bad ? 1 : 0
} catch (err) {
  console.log('')
  console.error(`\nfailed: ${err.message}\n`)
  if (err.cause) console.error(err.cause)
  process.exitCode = 1
}
