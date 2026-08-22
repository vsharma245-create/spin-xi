/**
 * What each bowler actually bowled, looked up one player at a time.
 *
 * Type used to be inferred from the share of balls a bowler sent down in the
 * middle overs. That is a proxy, and proxies are wrong at the edges: at 0.45
 * it made Ajit Agarkar a spinner, because a fast-medium containment role is
 * bowled in exactly the overs a spinner bowls. Moving the line only moves
 * which players are wrong.
 *
 * So this asks. Cricsheet gives every player an identifier and a Cricinfo key;
 * Wikidata turns that key into an English Wikipedia article; the article's
 * infobox states the bowling style in words — "right-arm fast medium",
 * "slow left-arm orthodox". Cricsheet has no such field itself: its register
 * is identifiers, and its match data is deliveries.
 *
 * The answers are written to data/bowling.json and committed, so the record
 * is auditable, re-runnable, and does not depend on a network call at build
 * time. Anything not found keeps the old reading, and the audit says how many.
 *
 *   npm run bowling
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data/bowling.json')
const UA = { 'User-Agent': 'spin-xi/1.0 (cricket draft game; bowling styles)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Words to a discipline.
 *
 * Spin is checked first because the phrases overlap: "slow left-arm orthodox"
 * contains "slow", and "left-arm medium" contains neither. A style that says
 * only "right-arm" says nothing, and is left unanswered rather than guessed.
 */
const SPIN = /break|spin|orthodox|googly|chinaman|legbreak|leg-break|slow left|wrist|finger/i
const PACE = /fast|medium|seam|swing|pace|quick/i
export function typeOf(style) {
  if (!style) return null
  const clean = style.replace(/\[\[|\]\]|<[^>]*>|\{\{[^}]*\}\}/g, ' ').trim()
  if (SPIN.test(clean)) return 'SPIN'
  if (PACE.test(clean)) return 'PACE'
  return null
}

async function sparql(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
      headers: { ...UA, Accept: 'text/csv' },
    }).catch(() => null)
    // The endpoint answers in CRLF. Left in place, every title carries a
    // trailing carriage return and matches no article at all.
    if (res?.ok)
      return (await res.text())
        .replace(/\r/g, '')
        .trim()
        .split('\n')
        .slice(1)
    await sleep(attempt * 2000)
  }
  throw new Error('wikidata: gave up')
}

/* ── Who needs one ─────────────────────────────────────────────────────── */

const agg = JSON.parse(await readFile(join(ROOT, '.cricsheet/aggregate.json'), 'utf8'))
const rows = agg.rows ?? agg
const bowled = new Map()
for (const r of rows) {
  if (!r.stats.bowlBalls) continue
  const seen = bowled.get(r.id) ?? { name: r.player, balls: 0 }
  seen.balls += r.stats.bowlBalls
  bowled.set(r.id, seen)
}
// Ten overs is where a reading stops being noise, and where a player is worth
// a request. Below it nobody is drafted as a bowler anyway.
const wanted = [...bowled.entries()].filter(([, v]) => v.balls >= 60)
console.log(`  ${wanted.length} players have bowled enough to need a type`)

/* ── Cricsheet identifier → Cricinfo key ───────────────────────────────── */

const csv = (await readFile(join(ROOT, '.cricsheet/people.csv'), 'utf8')).trim().split('\n')
const cols = csv[0].split(',')
const AT = cols.indexOf('identifier')
const KEYS = ['key_cricinfo', 'key_cricinfo_2', 'key_cricinfo_3'].map((k) => cols.indexOf(k))
const cricinfo = new Map()
for (const line of csv.slice(1)) {
  const f = line.split(',')
  const key = KEYS.map((i) => f[i]).find(Boolean)
  if (key) cricinfo.set(f[AT], key)
}

const askable = wanted.filter(([id]) => cricinfo.has(id))
console.log(`  ${askable.length} of them have a Cricinfo identifier`)

/* ── Cricinfo key → Wikipedia article ──────────────────────────────────── */

const article = new Map()
const BATCH = 150
for (let i = 0; i < askable.length; i += BATCH) {
  const slice = askable.slice(i, i + BATCH)
  const values = slice.map(([id]) => `"${cricinfo.get(id)}"`).join(' ')
  const found = await sparql(`SELECT ?key ?article WHERE {
    VALUES ?key { ${values} }
    ?p wdt:P2697 ?key .
    ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> .
  }`)
  const byKey = new Map(found.map((l) => [l.split(',')[0], l.split(',').slice(1).join(',')]))
  for (const [id] of slice) {
    const url = byKey.get(cricinfo.get(id))
    if (url) article.set(id, decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' '))
  }
  process.stdout.write(`\r  articles: ${article.size} of ${Math.min(i + BATCH, askable.length)}`)
  await sleep(200)
}
console.log(`\n  ${article.size} have an English Wikipedia article`)

/* ── Article → the words in the infobox ────────────────────────────────── */

/*
 * Resume rather than start again.
 *
 * A re-run existed only to pick up articles the API refused, and it refetched
 * all two thousand of them to do it — ten minutes to collect a hundred. What
 * is already answered is already answered.
 */
let record = {}
try {
  record = JSON.parse(await readFile(OUT, 'utf8')).players ?? {}
  console.log(`  ${Object.keys(record).length} already on record; only the rest are asked for`)
} catch {
  /* first run */
}
const titles = [...article.entries()].filter(([id]) => !record[id])
let asked = 0
let refused = 0
for (let i = 0; i < titles.length; i += 50) {
  const slice = titles.slice(i, i + 50)
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content' +
    '&rvslots=main&format=json&formatversion=2&redirects=1&titles=' +
    encodeURIComponent(slice.map(([, t]) => t).join('|'))
  /*
   * Wikipedia rate-limits, and says so in plain text rather than JSON.
   *
   * A batch that came back refused used to be skipped in silence, fifty
   * players at a time — which is why two thirds of the articles produced
   * nothing and it looked like a parsing fault. Refusals are now waited out
   * and retried, and a batch that will not come is reported rather than lost.
   */
  let json = null
  for (let attempt = 1; attempt <= 5 && !json; attempt++) {
    const res = await fetch(url, { headers: UA }).catch(() => null)
    if (res?.ok) {
      json = await res.json().catch(() => null)
      if (json) break
    }
    await sleep(attempt * 3000)
  }
  if (!json) refused += slice.length
  if (json) {
    /*
     * A page rarely comes back under the name it was asked for. "Rashid Khan
     * (cricketer)" answers as "Rashid Khan"; others are normalised for case or
     * underscores. Matching on the requested title therefore missed almost
     * everything — 488 of 2278 — while the articles themselves were fine.
     * The API says what it renamed, so the chain is followed.
     */
    const moved = new Map()
    for (const m of json.query?.normalized ?? []) moved.set(m.from, m.to)
    for (const m of json.query?.redirects ?? []) moved.set(m.from, m.to)
    const settle = (t) => {
      let at = t
      for (let hop = 0; hop < 4 && moved.has(at); hop++) at = moved.get(at)
      return at
    }
    const byTitle = new Map((json.query?.pages ?? []).map((p) => [p.title, p]))
    for (const [id, title] of slice) {
      const page = byTitle.get(settle(title))
      const text = page?.revisions?.[0]?.slots?.main?.content ?? ''
      const m = text.match(/\|\s*bowling\s*=\s*([^\n|]+)/i)
      const style = m ? m[1].replace(/\[\[|\]\]|<[^>]*>|\{\{[^}]*\}\}/g, ' ').replace(/\s+/g, ' ').trim() : null
      const type = typeOf(style)
      if (type) {
        record[id] = { name: bowled.get(id).name, style, type, article: title }
      }
    }
  }
  asked += slice.length
  process.stdout.write(`\r  infoboxes: ${Object.keys(record).length} typed, ${asked} of ${titles.length} read`)
  // Kind to a free API that is doing us a favour.
  await sleep(900)
}

await mkdir(join(ROOT, 'data'), { recursive: true })
await writeFile(
  OUT,
  JSON.stringify(
    {
      built: new Date().toISOString(),
      source: 'English Wikipedia infoboxes, joined via Cricsheet and Wikidata identifiers',
      asked: askable.length,
      typed: Object.keys(record).length,
      players: record,
    },
    null,
    1,
  ),
)
const spin = Object.values(record).filter((r) => r.type === 'SPIN').length
console.log(
  `\n\n  ${Object.keys(record).length} of ${askable.length} typed from their own article` +
    ` (${spin} spin, ${Object.keys(record).length - spin} pace)`,
)
if (refused) console.log(`  ${refused} articles could not be read — re-run to pick them up`)
console.log(`  → data/bowling.json`)
