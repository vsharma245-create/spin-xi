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

  /* ── Multiplayer ── */
  process.stdout.write('  multiplayer.sql … ')
  await db.exec(await file('multiplayer.sql'))
  console.log('ok')

  process.stdout.write('  multiplayer.sql again (re-runnable) … ')
  await db.exec(await file('multiplayer.sql'))
  console.log('ok')

  {
    const host = '33333333-3333-3333-3333-333333333333'
    const mate = '44444444-4444-4444-4444-444444444444'
    await db.exec(`
      insert into auth.users (id) values ('${host}'), ('${mate}') on conflict do nothing;
      insert into profiles (id, handle) values ('${host}', 'HOST'), ('${mate}', 'MATE')
        on conflict do nothing;
      insert into leagues (code, name, host, format, preset_id, rating_mode, difficulty,
                           world_teams, scoring, from_year, to_year)
      values ('abc123', 'Sunday Legends', '${host}', 'T20L', 'BALANCED', 'SEASON', 'HARD',
              true, 'best', 2010, 2020);
      insert into league_entries (league_id, player)
        select id, '${host}' from leagues where code = 'abc123';
      insert into league_entries (league_id, player)
        select id, '${mate}' from leagues where code = 'abc123';
    `)

    const season = (who, diff, pts, yrs = '2010, 2020') => `
      insert into results (player, league_id, format, mode, preset_id, rating_mode, difficulty,
                           from_year, to_year, world_teams, wins, losses, draws, runs, wickets,
                           outcome, points, idx)
      select '${who}', id, 'T20L', 'quick', 'BALANCED', 'SEASON', '${diff}', ${yrs}, true,
             9, 5, 0, 2400, 110, 'ELIMINATED', ${pts}, 1000
      from leagues where code = 'abc123'`

    await db.exec(season(host, 'HARD', 2600))
    await db.exec(season(mate, 'HARD', 2900))

    // Playing on Easy in a Hard league must be refused.
    let blockedDiff = false
    try { await db.exec(season(mate, 'EASY', 9999)) } catch { blockedDiff = true }
    console.log(`  ${blockedDiff ? 'ok  ' : 'FAIL'} a season on the wrong difficulty is refused`)
    if (!blockedDiff) bad++

    // So must a wider span of years than the league agreed.
    let blockedYears = false
    try { await db.exec(season(mate, 'HARD', 9999, '1990, 2026')) } catch { blockedYears = true }
    console.log(`  ${blockedYears ? 'ok  ' : 'FAIL'} a season outside the league's years is refused`)
    if (!blockedYears) bad++

    // A stranger cannot enter a league they never joined.
    const stranger = '55555555-5555-5555-5555-555555555555'
    await db.exec(`insert into auth.users (id) values ('${stranger}') on conflict do nothing;
                   insert into profiles (id, handle) values ('${stranger}', 'STRANGER') on conflict do nothing;`)
    let blockedJoin = false
    try { await db.exec(season(stranger, 'HARD', 5000)) } catch { blockedJoin = true }
    console.log(`  ${blockedJoin ? 'ok  ' : 'FAIL'} a season from someone who never joined is refused`)
    if (!blockedJoin) bad++

    /*
     * A league opens because the host has played, not because a flag was set.
     * The flag version failed in production exactly once and silently: the
     * season saved, the write that followed it did not, and the link stayed
     * shut with nothing to say why.
     */
    {
      const solo = '66666666-6666-6666-6666-666666666666'
      await db.exec(`
        insert into auth.users (id) values ('${solo}') on conflict do nothing;
        insert into profiles (id, handle) values ('${solo}', 'SOLOHOST') on conflict do nothing;
        insert into leagues (code, name, host, format, preset_id, rating_mode, difficulty,
                             world_teams, scoring)
        values ('shut01', 'Not Played Yet', '${solo}', 'T20L', 'BALANCED', 'SEASON', 'NORMAL',
                true, 'best');
        insert into league_entries (league_id, player)
          select id, '${solo}' from leagues where code = 'shut01';
      `)
      const shut = await db.query(`select is_open from league_preview('shut01')`)
      const open = await db.query(`select is_open from league_preview('abc123')`)
      const right = shut.rows[0].is_open === false && open.rows[0].is_open === true
      console.log(
        `  ${right ? 'ok  ' : 'FAIL'} a league opens on the host's season, not a flag ` +
          `(unplayed ${shut.rows[0].is_open}, played ${open.rows[0].is_open})`,
      )
      if (!right) bad++
    }

    // The rules cannot be rewritten once people are playing to them.
    let locked = false
    try { await db.exec(`update leagues set difficulty = 'EASY' where code = 'abc123'`) } catch { locked = true }
    console.log(`  ${locked ? 'ok  ' : 'FAIL'} a league's rules cannot be changed afterwards`)
    if (!locked) bad++

    // 'best' keeps the higher of two runs; 'latest' would keep the newer.
    await db.exec(season(mate, 'HARD', 1200))
    // Session-level: `set local` outside a transaction is discarded, which
    // left auth.uid() null and the view correctly showing nothing.
    await db.exec(`set request.jwt.claim.sub = '${mate}'`)
    const table = await db.query(`select handle, points from league_table order by points desc`)
    const kept = table.rows.find((r) => r.handle === 'MATE')?.points
    console.log(
      `  ${Number(kept) === 2900 ? 'ok  ' : 'FAIL'} scoring 'best' keeps the higher run (${kept})`,
    )
    if (Number(kept) !== 2900) bad++
    console.log(`  ok   league table: ${table.rows.length} rows for a member`)

    /*
     * Now read them as somebody who is not the owner.
     *
     * Everything above runs as the superuser, which bypasses row level
     * security completely — so a policy can be catastrophically wrong and
     * every test still passes. That is exactly what happened: the policy on
     * league_entries asked league_entries who the members were, called itself,
     * and every read of a league came back "infinite recursion detected in
     * policy" the moment it met a real database.
     */
    await db.exec(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'rls_probe') then
          create role rls_probe nologin;
        end if;
      end $$;
      grant usage on schema public to rls_probe;
      grant select on leagues, league_entries, league_table, results, profiles to rls_probe;
      grant execute on function in_league(uuid) to rls_probe;
    `)

    let recursion = null
    let visible = -1
    try {
      await db.exec(`set role rls_probe; set request.jwt.claim.sub = '${mate}';`)
      const seen = await db.query('select count(*)::int as n from leagues')
      visible = Number(seen.rows[0].n)
    } catch (err) {
      recursion = String(err.message ?? err)
    } finally {
      await db.exec('reset role')
    }
    console.log(
      `  ${recursion ? 'FAIL' : 'ok  '} leagues are readable under row level security` +
        (recursion ? ` — ${recursion.slice(0, 60)}` : ` (member sees ${visible})`),
    )
    if (recursion) bad++

    // And a stranger must see none of it.
    let strangerSees = -1
    try {
      await db.exec(`set role rls_probe; set request.jwt.claim.sub = '${stranger}';`)
      const seen = await db.query('select count(*)::int as n from leagues')
      strangerSees = Number(seen.rows[0].n)
    } finally {
      await db.exec('reset role')
    }
    console.log(
      `  ${strangerSees === 0 ? 'ok  ' : 'FAIL'} a stranger sees no leagues (${strangerSees})`,
    )
    if (strangerSees !== 0) bad++
    await db.exec(`set request.jwt.claim.sub = ''`)

    // A league season belongs on its league's table, not on the public one.
    const onPublic = await db.query(
      `select count(*)::int as n from ladder where player in ('${host}', '${mate}')`,
    )
    console.log(
      `  ${Number(onPublic.rows[0].n) === 0 ? 'ok  ' : 'FAIL'} league seasons stay off the public ladder`,
    )
    if (Number(onPublic.rows[0].n) !== 0) bad++

    // Nor on the splits that sit beside a public rating.
    const inSplits = await db.query(
      `select coalesce(sum(drafts), 0)::int as n from player_splits where player = '${mate}'`,
    )
    console.log(
      `  ${Number(inSplits.rows[0].n) === 0 ? 'ok  ' : 'FAIL'} league seasons stay out of the rated splits`,
    )
    if (Number(inSplits.rows[0].n) !== 0) bad++

    // But they still count toward a career, because they were played.
    const career = await db.query(`select drafts, xp from player_stats where id = '${mate}'`)
    const counted = Number(career.rows[0]?.drafts ?? 0) > 0
    console.log(
      `  ${counted ? 'ok  ' : 'FAIL'} league seasons still count toward a career ` +
        `(${career.rows[0]?.drafts} drafts, ${career.rows[0]?.xp} xp)`,
    )
    if (!counted) bad++
  }

  /* ── The daily rotation, applied on its own ── */
  process.stdout.write('  challenges.sql … ')
  await db.exec(await file('challenges.sql'))
  console.log('ok')

  process.stdout.write('  challenges.sql again (re-runnable) … ')
  await db.exec(await file('challenges.sql'))
  console.log('ok')

  const rotation = await db.query(
    'select count(*)::int as slots, count(distinct objective)::int as objectives from challenges',
  )
  const { slots, objectives } = rotation.rows[0]
  // Every objective must be one the simulation can actually check, or it can
  // never be met; the list here is the switch in sim.ts.
  const scoreable = new Set([
    'SET AND DEFEND', 'CHASE MASTER', 'GO UNBEATEN', 'LIFT THE TROPHY',
    'TOP OF THE TABLE', 'NO CHOKE', 'PERFECT START', 'ON A ROLL', 'COMEBACK',
    'CENTURION', 'FIVE-FOR', 'BOWLED THEM OUT', 'CRUSHING WIN',
  ])
  // The SQL builds the rotation from three arrays and a modulo. That is only
  // right if it agrees with the same three cycles in challenges.mjs, so a
  // sample of slots is compared against them rather than trusted.
  const { challengeRows } = await import('./challenges.mjs')
  const probeSlots = [0, 1, 12, 13, 41, 42, 200, 365, 545]
  const sampled = await db.query(
    `select slot, format, preset_id, objective from challenges where slot in (${probeSlots.join(',')}) order by slot`,
  )
  const drift = sampled.rows.filter((row) => {
    const want = challengeRows[row.slot]
    const strip = (v) => String(v).replace(/^'|'$/g, '')
    return (
      strip(want[1]) !== row.format ||
      strip(want[2]) !== row.preset_id ||
      strip(want[3]) !== row.objective
    )
  })
  console.log(
    `  ${drift.length === 0 ? 'ok  ' : 'FAIL'} generated rotation matches the cycles it came from` +
      (drift.length ? ` — slot ${drift[0].slot} differs` : ` (${probeSlots.length} slots checked)`),
  )
  if (drift.length) bad++

  const listed = await db.query('select distinct objective from challenges')
  const unscoreable = listed.rows.map((r) => r.objective).filter((o) => !scoreable.has(o))
  const longEnough = Number(slots) > 365
  console.log(
    `  ${longEnough ? 'ok  ' : 'FAIL'} rotation: ${slots} slots, ${objectives} objectives ` +
      `(repeats after ${slots} days)`,
  )
  console.log(
    `  ${unscoreable.length === 0 ? 'ok  ' : 'FAIL'} every objective has a rule in sim.ts` +
      (unscoreable.length ? `: ${unscoreable.join(', ')} cannot be met` : ''),
  )
  if (!longEnough || unscoreable.length) bad++

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

  /*
   * The archive owns the challenges table and has just rebuilt it with the
   * rotation it was generated against, which is why the count above is the
   * archive's. Production applies challenges.sql after the archive for exactly
   * this reason, so the last word on the rotation is checked last here too.
   */
  await db.exec(await file('challenges.sql'))
  const finalRotation = await db.query('select count(*)::int as n from challenges')
  const finalSlots = Number(finalRotation.rows[0].n)
  console.log(
    `  ${finalSlots > 365 ? 'ok  ' : 'FAIL'} rotation survives an archive rebuild: ${finalSlots} slots`,
  )
  if (finalSlots <= 365) bad++

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
