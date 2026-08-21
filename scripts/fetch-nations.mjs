/**
 * Builds a player → nationality table from public, citable sources.
 *
 *   node scripts/fetch-nations.mjs
 *
 * Nationality is the one fact the ball-by-ball archive cannot supply. It is
 * never stated in a scorecard, and the obvious inference — "capped for a
 * country, therefore of it" — has a hole in it: Cricsheet withholds every
 * Afghanistan men's match as a matter of policy, so no Afghan player can ever
 * appear to hold a cap. Rashid Khan would come out Indian, and walk into an
 * Indian T20 League XI without using an overseas slot.
 *
 * So the gap is filled from Wikidata, joined on the Cricinfo player id that
 * Cricsheet's own register publishes for each of its identifiers. That is an
 * identifier-to-identifier join, not a guess at who a name belongs to.
 *
 * Two Wikidata properties matter, and they are not the same thing:
 *   P1532  country for sport — who a player is eligible to represent
 *   P27    citizenship       — which passport they hold
 * Cricket cares about the first. The second is the fallback, and it is
 * genuinely wrong often enough to matter: a Barbadian is a citizen of
 * Barbados but plays for the West Indies, and an England player is very
 * often "United Kingdom", which names no cricket team at all.
 *
 * Writes .cricsheet/nations.json. Cached — delete it to refetch.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const CACHE = join(ROOT, '.cricsheet')
const OUT = join(CACHE, 'nations.json')
const REGISTER = join(CACHE, 'people.csv')

const UA = 'spin-xi/1.0 (hobby cricket drafting game; one-off dataset build)'

/**
 * Country names as Wikidata writes them, mapped to the codes the game uses.
 *
 * Wikidata answers with labels rather than cricket teams, so several have to
 * be translated: England players are filed under the United Kingdom, which is
 * not a side; the West Indies is not a country at all and arrives as ten
 * separate Caribbean states; Wales has no team of its own and plays as
 * England. Anything not listed is a nation the game does not recognise.
 */
const NATION_OF_LABEL = {
  India: 'IN',
  Australia: 'AU',
  Pakistan: 'PK',
  'Sri Lanka': 'LK',
  'South Africa': 'ZA',
  'New Zealand': 'NZ',
  Afghanistan: 'AF',
  Bangladesh: 'BD',
  Zimbabwe: 'ZW',
  Ireland: 'IE',
  'Republic of Ireland': 'IE',
  Netherlands: 'NL',
  'Kingdom of the Netherlands': 'NL',
  Scotland: 'SC',
  'United Arab Emirates': 'AE',
  Nepal: 'NP',
  Oman: 'OM',
  Namibia: 'NA',
  'United States of America': 'US',
  'Papua New Guinea': 'PG',
  Canada: 'CA',
  Kenya: 'KE',
  'Hong Kong': 'HK',
  Bermuda: 'BM',
  England: 'EN',
  'United Kingdom': 'EN',
  Wales: 'EN',
  // The West Indies, as its member states.
  Jamaica: 'WI',
  Barbados: 'WI',
  'Trinidad and Tobago': 'WI',
  Guyana: 'WI',
  'Antigua and Barbuda': 'WI',
  'Saint Lucia': 'WI',
  'Saint Vincent and the Grenadines': 'WI',
  Grenada: 'WI',
  Dominica: 'WI',
  'Saint Kitts and Nevis': 'WI',
}

/* ── Cricsheet's register: its identifiers, and everyone else's ────────── */

/** Minimal CSV reader. The register is machine-written and quotes only the
 *  fields that need it, but names like "Walter Monckton, 1st Viscount" do. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const head = rows.shift()
  return rows
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

async function register() {
  let text
  try {
    text = await readFile(REGISTER, 'utf8')
  } catch {
    process.stdout.write('  downloading Cricsheet people register… ')
    const res = await fetch('https://cricsheet.org/register/people.csv', { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`register: ${res.status} ${res.statusText}`)
    text = await res.text()
    await mkdir(CACHE, { recursive: true })
    await writeFile(REGISTER, text)
    console.log('ok')
  }
  return parseCsv(text)
}

/* ── Wikidata ──────────────────────────────────────────────────────────── */

const UA_HEADERS = { Accept: 'text/csv', 'User-Agent': UA }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * What Wikidata knows about the players Cricsheet actually has.
 *
 * The obvious request — every cricketer on Wikidata — cannot be served: the
 * query service answers anything it cannot finish in sixty seconds by
 * returning *part* of the answer with a 200 and no warning, so the table came
 * out different on every run with nothing to say which run was right. Paging
 * with LIMIT/OFFSET fails the same way, because the ORDER BY it needs forces
 * the whole result to be built before any of it can be skipped. Discovering
 * the id space by prefix works but is enormously wasteful — hundreds of
 * counting round trips to find out what we already know.
 *
 * We already know. Cricsheet's register lists the Cricinfo id of every player
 * in the archive, so the ids are handed to Wikidata a batch at a time instead
 * of being searched for. Each request is small, none can time out, and the
 * result is exact: we asked about a known list and can say precisely which of
 * it came back.
 */
const BATCH = 300

async function ask(query) {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: UA_HEADERS })
      if (res.ok) return parseCsv(await res.text())
      if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${res.statusText}`)
    } catch (err) {
      if (attempt === 4) throw err
    }
    await sleep(attempt * 2500)
  }
  throw new Error('wikidata: gave up after four attempts')
}

/**
 * Two identifiers, asked separately.
 *
 * Cricinfo ids reach most players; CricketArchive covers a different four and
 * a half thousand, and the ones it adds are exactly the players Cricinfo's
 * side of Wikidata misses — the county professional who never played an
 * international. Both are identifier joins, so neither can mistake one player
 * for another.
 */
async function askBy(property, ids, label) {
  const wanted = [...new Set(ids)].filter(Boolean)
  const rows = []
  for (let i = 0; i < wanted.length; i += BATCH) {
    const values = wanted.slice(i, i + BATCH).map((id) => `"${id}"`).join(' ')
    rows.push(
      ...(await ask(`SELECT ?key ?name ?sport ?citizen ?born WHERE {
        VALUES ?key { ${values} }
        ?p wdt:${property} ?key ; rdfs:label ?name .
        FILTER(lang(?name) = "en")
        OPTIONAL { ?p wdt:P1532 ?sc . ?sc rdfs:label ?sport   FILTER(lang(?sport) = "en") }
        OPTIONAL { ?p wdt:P27   ?cc . ?cc rdfs:label ?citizen FILTER(lang(?citizen) = "en") }
        OPTIONAL { ?p wdt:P569  ?born }
      }`)),
    )
    process.stdout.write(
      `\r  ${label}: asked about ${Math.min(i + BATCH, wanted.length)} of ${wanted.length}` +
        ` · ${rows.length} rows`,
    )
    await sleep(200)
  }
  const found = new Set(rows.map((r) => r.key)).size
  console.log(`\n  ${label}: ${found} of ${wanted.length} found on Wikidata`)
  return rows
}

async function askWikidata(people) {
  const byCricinfo = await askBy('P2697', people.flatMap((p) => [p.key_cricinfo, p.key_cricinfo_2, p.key_cricinfo_3]), 'Cricinfo')
  const byArchive = await askBy('P2698', people.flatMap((p) => [p.key_cricketarchive, p.key_cricketarchive_2]), 'CricketArchive')
  return { byCricinfo, byArchive }
}

/* ── Resolve ───────────────────────────────────────────────────────────── */

/** Country-for-sport outranks citizenship; a tie inside either is unusable. */
function settle(claims) {
  for (const via of ['sport', 'citizen']) {
    const codes = new Set(claims.filter((c) => c.via === via && c.code).map((c) => c.code))
    if (codes.size === 1) return [...codes][0]
    if (codes.size > 1) return null
  }
  return null
}

const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

console.log('Building the nationality table.\n')

const people = await register()
console.log(`  register: ${people.length} identifiers, ${people.filter((p) => p.key_cricinfo).length} with a Cricinfo id`)

const { byCricinfo, byArchive } = await askWikidata(people)
const raw = [...byCricinfo, ...byArchive]

/* Each row is one (person, name, country) combination; fold them into claims
 * the resolver understands, dropping countries that field no team. */
const claims = []
for (const r of raw) {
  const sport = NATION_OF_LABEL[r.sport]
  const citizen = NATION_OF_LABEL[r.citizen]
  if (sport) claims.push({ key: r.key, name: r.name, via: 'sport', code: sport })
  if (citizen) claims.push({ key: r.key, name: r.name, via: 'citizen', code: citizen })
  // Kept even with no usable country: the name alone is worth having.
  if (!sport && !citizen) claims.push({ key: r.key, name: r.name, via: 'none', code: null })
}
console.log(`  ${raw.length} rows → ${claims.length} claims`)

/* Group the claims by each join key we have. */
const byKey = new Map()
const byName = new Map()
for (const c of claims) {
  if (c.key) {
    if (!byKey.has(c.key)) byKey.set(c.key, [])
    byKey.get(c.key).push(c)
  }
  const n = norm(c.name)
  if (!n) continue
  if (!byName.has(n)) byName.set(n, [])
  byName.get(n).push(c)
}

/* A name is only usable if it belongs to one person on each side. Cricket is
 * full of shared names — three different Rashid Khans play in this archive —
 * and a name that could mean two people means neither. */
const registerNameCount = new Map()
for (const p of people) {
  for (const n of new Set([norm(p.name), norm(p.unique_name)])) {
    if (n) registerNameCount.set(n, (registerNameCount.get(n) ?? 0) + 1)
  }
}

/**
 * A name a person would recognise.
 *
 * Scorecards abbreviate — Cricsheet records "RG Sharma", and so does its own
 * register — which is correct for a scorecard and no use on a player card,
 * where the given name is the line above the surname. Wikidata labels are
 * written out, so the label that comes back on the Cricinfo join is kept.
 *
 * Only labels that are actually fuller than what we already have are used: a
 * label of "MS Dhoni" is the same abbreviation by another route, and a
 * disambiguating suffix — "Rohit Sharma (cricketer)" — is not part of anyone's
 * name.
 */
const looksAbbreviated = (name) => /^[A-Z]{1,4}\b/.test(name.split(' ')[0] ?? '')
const cleanLabel = (label) => label.replace(/\s*\([^)]*\)\s*$/, '').trim()

/**
 * Year of birth, so a card can say how old somebody was that season.
 *
 * Nearly every cricketer Wikidata knows about has one — 97.7% of the matched
 * sample — which is why this is the only biographical field taken from there.
 * Batting hand and bowling style are not on Wikidata in any usable quantity
 * (0% and 0.9% of the same sample), so they are not attempted rather than
 * shipped as a column that is empty for everybody.
 */
const born = {}
const names = {}
const nations = {}
const via = { identifier: 0, name: 0 }
for (const p of people) {
  const identifier = [p.key_cricinfo, p.key_cricinfo_2, p.key_cricinfo_3, p.key_cricketarchive, p.key_cricketarchive_2]
    .find((k) => k && byKey.has(k))
  if (identifier) {
    const claims = byKey.get(identifier)
    const label = cleanLabel(claims[0].name ?? '')
    if (label && !looksAbbreviated(label) && looksAbbreviated(p.name)) names[p.identifier] = label
    // Dates arrive as ISO timestamps; only the year is ever shown, and a
    // Wikidata date of unknown precision can carry a nonsense month and day.
    const date = claims.map((c) => c.born).find(Boolean)
    const year = date ? Number(String(date).slice(0, 4)) : NaN
    if (year >= 1850 && year <= new Date().getFullYear()) born[p.identifier] = year
    const code = settle(claims)
    if (code) { nations[p.identifier] = code; via.identifier++; continue }
  }
  for (const n of [norm(p.unique_name), norm(p.name)]) {
    if (!n || registerNameCount.get(n) !== 1) continue
    const hits = byName.get(n)
    if (!hits || new Set(hits.map((h) => h.name)).size !== 1) continue
    const code = settle(hits)
    if (code) { nations[p.identifier] = code; via.name++; break }
  }
}

await writeFile(OUT, JSON.stringify({ built: new Date().toISOString(), via, nations, names, born }))

const spread = {}
for (const c of Object.values(nations)) spread[c] = (spread[c] ?? 0) + 1
console.log(`  ${Object.keys(names).length} scorecard names expanded to full names`)
console.log(`\n  ${Object.keys(nations).length} players placed — ${via.identifier} by identifier, ${via.name} by unique name`)
console.log('  ' + Object.entries(spread).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join('  '))
console.log(`\n  written to .cricsheet/nations.json`)
