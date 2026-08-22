/**
 * Applies schema.sql and archive.sql to a Postgres database.
 *
 *   npm run db:push
 *
 * Asks for the connection string when it runs rather than taking it as an
 * argument, so the password never lands in your shell history. Nothing is
 * stored: the string lives in memory for the length of the run.
 *
 * Get the string from Supabase → Project Settings → Database → Connection
 * string → URI, and replace [YOUR-PASSWORD] with the database password you
 * set when you created the project.
 */
import { SLOTS } from './challenges.mjs'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { lookup as dnsLookup } from 'node:dns'
import pg from 'pg'

/**
 * Supabase's direct database host resolves on IPv6 only. Node asks for IPv4
 * first and reports the host as missing entirely, which reads like a typo in
 * the connection string rather than what it is. Ask for both families and take
 * whatever answers.
 */
const lookup = (host, opts, cb) =>
  dnsLookup(host, { ...opts, family: 0, all: false, verbatim: true }, cb)

const ROOT = new URL('..', import.meta.url).pathname

/**
 * One reader for the whole run, not one per question.
 *
 * A readline interface per prompt looks tidier and quietly loses answers:
 * closing one leaves stdin paused mid-line, and the next interface can open
 * having already eaten the keystrokes meant for it. That failure is invisible
 * from here — the field simply arrives empty — and downstream it surfaces as
 * the server rejecting a username of "postgres." with nothing after the dot,
 * which reads like a network fault rather than a dropped keystroke.
 */
const interactive = Boolean(process.stdin.isTTY)
const rl = interactive
  ? createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  : null

/** Whatever was piped in, so the script can be driven by a test or a CI job. */
const piped = interactive
  ? []
  : (await new Promise((resolve) => {
      let buf = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (d) => (buf += d))
      process.stdin.on('end', () => resolve(buf))
    })).split('\n')

/** Prompt, optionally masking what is typed so a password is not left on screen. */
function ask(question, { hidden = false } = {}) {
  if (!interactive) {
    process.stdout.write(question + (hidden ? '\n' : '\n'))
    return Promise.resolve((piped.shift() ?? '').trim())
  }
  return new Promise((resolve) => {
    let masking = hidden
    const onData = (char) => {
      if (!masking) return
      if (['\n', '\r', '\u0004'].includes(char.toString('utf8'))) masking = false
      else process.stdout.write('\u001B[2K\u001B[200D' + question + '*'.repeat(rl.line.length))
    }
    if (hidden) process.stdin.on('data', onData)
    rl.question(question, (answer) => {
      if (hidden) {
        process.stdin.removeListener('data', onData)
        process.stdout.write('\n')
      }
      resolve(answer.trim())
    })
  })
}

/** Keep asking until there is actually an answer. */
async function require_(question, opts) {
  for (;;) {
    const answer = await ask(question, opts)
    if (answer) return answer
    console.log('  ↑ that came through empty — type a value and press Enter.')
  }
}

/**
 * Two ways in. A connection string is fine when it works, but a password with
 * an "@" or "#" in it silently corrupts one — everything after the last "@" is
 * read as the hostname — and the resulting error blames your password rather
 * than the punctuation. So the guided route asks for the pieces separately and
 * never builds a URL at all.
 */
/** The project ref is the first label of the Supabase URL you already configured. */
async function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF
  const env = await readFile(join(ROOT, '.env.local'), 'utf8').catch(() => '')
  const url = env.match(/^VITE_SUPABASE_URL\s*=\s*(\S+)/m)?.[1]
  const ref = url?.match(/https?:\/\/([a-z0-9]+)\.supabase\./)?.[1]
  if (!ref) {
    console.error('\nCould not read your project ref from .env.local.')
    console.error('Expected a line like VITE_SUPABASE_URL=https://<ref>.supabase.co')
    console.error('Set it there, or run with SUPABASE_PROJECT_REF=<ref> npm run db:push\n')
    process.exit(1)
  }
  return ref
}

/**
 * Connection details, asking for as little as possible.
 *
 * Everything except the password is already known — the project ref is in
 * .env.local, and the pooler host is a template around it — so the only thing
 * left to type is the one thing that must not be written down. Each field is
 * passed to the driver separately rather than assembled into a URL, because a
 * password containing "@" or "#" silently corrupts a connection string:
 * everything after the last "@" is parsed as the hostname, and the failure
 * that follows blames the password rather than the punctuation.
 */
async function connectionConfig() {
  if (process.env.DATABASE_URL) return [{ connectionString: process.env.DATABASE_URL }]

  const ref = await projectRef()
  const region = process.env.SUPABASE_REGION || 'ap-southeast-2'
  console.log(`\nProject ${ref} in ${region}.`)
  console.log('Set SUPABASE_REGION if that region is wrong.\n')

  const password = await require_('  Database password (typing is hidden): ', { hidden: true })

  // Supabase puts a project behind aws-0 or aws-1; both are tried in turn.
  return [0, 1].map((n) => ({
    host: `aws-${n}-${region}.pooler.supabase.com`,
    port: 5432,
    user: `postgres.${ref}`,
    password,
    database: 'postgres',
  }))
}

const candidates = (await connectionConfig()).map((c) => ({
  ...c,
  ssl: { rejectUnauthorized: false },
  lookup,
}))

/** Supabase puts a project on aws-0 or aws-1; try both rather than ask. */
async function connect() {
  let last
  for (const config of candidates) {
    const c = new pg.Client(config)
    try {
      await c.connect()
      if (config.host) console.log(`\nconnected to ${config.host}\n`)
      else console.log('\nconnected\n')
      return c
    } catch (err) {
      await c.end().catch(() => {})
      last = err
      if (!/Tenant or user not found|ENOTFOUND/i.test(err.message)) throw err
    }
  }
  throw last
}

const run = async (file) => {
  const sql = await readFile(join(ROOT, 'supabase', file), 'utf8')
  process.stdout.write(`  ${file} (${(sql.length / 1024).toFixed(0)} KB) … `)
  const started = Date.now()
  await client.query(sql)
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

let client
try {
  client = await connect()
  await run('schema.sql')
  await run('archive.sql')
  // After the archive, which owns the challenges table and rebuilds it with
  // whatever rotation it was generated against. This replaces that with the
  // current one, so the rotation can move without a full dataset rebuild.
  await run('challenges.sql')
  // Players last, and separately: this file is additive and is never dropped,
  // because the two above delete and rebuild everything they own.
  await run('players.sql')
  // Telemetry last of all. It only ever adds, it is read by nothing the game
  // renders, and keeping it after the player tables means a failure here
  // cannot leave a ladder half-built.
  await run('analytics.sql')
  await run('multiplayer.sql')
  await run('live.sql')

  // The player side has no expected counts — it grows on its own — so it is
  // checked for existence rather than size.
  const { rows: present } = await client.query(`
    select
      to_regclass('public.profiles')     is not null as profiles,
      to_regclass('public.results')      is not null as results,
      to_regclass('public.player_stats') is not null as player_stats,
      to_regclass('public.events')       is not null as events,
      to_regclass('public.leagues')      is not null as leagues,
      to_regclass('public.draft_rooms')  is not null as draft_rooms,
      to_regclass('public.draft_picks')  is not null as draft_picks,
      to_regclass('public.league_table') is not null as league_table,
      to_regclass('public.funnel_daily') is not null as funnel_daily,
      to_regclass('public.ladder')       is not null as ladder,
      to_regclass('public.daily_board')  is not null as daily_board
  `)
  const missing = Object.entries(present[0]).filter(([, ok]) => !ok).map(([k]) => k)

  const { rows } = await client.query(`
    select
      (select count(*) from teams)         as teams,
      (select count(*) from players)       as players,
      (select count(*) from squads)        as squads,
      (select count(*) from squad_players) as roster_rows,
      (select count(*) from challenges)    as challenges
  `)
  const c = rows[0]
  const { rows: players } = await client.query(
    'select (select count(*) from profiles) as profiles, (select count(*) from results) as results',
  )
  console.log(
    `\n  ${c.teams} teams · ${c.players} players · ${c.squads} squads · ` +
      `${c.roster_rows} roster rows · ${c.challenges} challenges`,
  )

  // What the archive build said it produced, rather than a number typed here
  // that goes stale the first time the dataset grows.
  const expected = JSON.parse(await readFile(join(ROOT, 'supabase/archive.json'), 'utf8')).counts
  // The rotation is applied after the archive and from its own file, so the
  // archive's idea of how many challenges there are is one revision behind by
  // design. Ask the module that actually generates them.
  expected.challenges = SLOTS
  const wrong = Object.entries(expected).filter(([k, v]) => Number(c[k]) !== v)
  console.log(
    wrong.length
      ? `\n  ⚠ not what was expected: ${wrong.map(([k, v]) => `${k} should be ${v}`).join(', ')}\n`
      : missing.length
        ? `\n  ⚠ player tables missing: ${missing.join(', ')}\n`
        : `\n  ✓ everything landed. ${players[0].profiles} players, ${players[0].results} results so far.\n`,
  )
} catch (err) {
  console.error(`\nfailed: ${err.message}\n`)
  if (/password authentication|SASL/i.test(err.message)) {
    console.error('That is a wrong database password — the one you set when creating the project,')
    console.error('not the anon key. Reset it under Project Settings → Database if you have lost it.\n')
  }
  if (/Tenant or user not found/i.test(err.message)) {
    console.error('The pooler did not recognise that project. The username it was given is')
    console.error('"postgres.<project ref>", so an empty or mistyped ref lands here.')
    console.error('Your ref is the code in your Supabase URL, e.g. dtgrvvswdddluxprnxux\n')
  } else if (/ENOTFOUND|ETIMEDOUT|ENETUNREACH/i.test(err.message)) {
    console.error('Could not reach the host.\n')
    console.error('Supabase direct connections are IPv6-only. If your network has no IPv6,')
    console.error('use the Session pooler string instead — Project Settings → Database →')
    console.error('Connection string → Session pooler. Its host ends in .pooler.supabase.com')
    console.error('and its username looks like postgres.dtgrvvswdddluxprnxux\n')
  }
  process.exitCode = 1
} finally {
  await client?.end().catch(() => {})
  rl?.close()
}
