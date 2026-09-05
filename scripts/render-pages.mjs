/**
 * The written pages, rendered to standalone HTML at build time.
 *
 * Not React routes. A single-page application leaves an empty div behind for
 * anybody who is not running its scripts, and the three readers who matter most
 * for a page like this — somebody with scripts off, a search crawler, and a
 * human reviewing the site — are all in that position. These are real files at
 * real URLs with the whole article in the body, and on a static host a real
 * file is served ahead of the application's catch-all.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://www.spin-xi.com'

const esc = (s) => String(s).replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Content is authored with a little inline HTML, so tags are kept. */
const rich = (s) => String(s)

function block(b) {
  if ('h' in b) return `      <h2>${rich(b.h)}</h2>`
  if ('p' in b) return `      <p>${rich(b.p)}</p>`
  if ('quote' in b) return `      <blockquote>${rich(b.quote)}</blockquote>`
  if ('list' in b) return `      <ul>\n${b.list.map((i) => `        <li>${rich(i)}</li>`).join('\n')}\n      </ul>`
  if ('table' in b) {
    const head = b.table.head.some(Boolean)
      ? `        <thead><tr>${b.table.head.map((h) => `<th>${rich(h)}</th>`).join('')}</tr></thead>\n`
      : ''
    const rows = b.table.rows
      .map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join('')}</tr>`)
      .join('\n          ')
    return `      <div class="scroll"><table>\n${head}        <tbody>\n          ${rows}\n        </tbody>\n      </table></div>`
  }
  return ''
}

const STYLE = `
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;background:#0A0D13;color:#F4F1E6;
      font:16px/1.72 Archivo,system-ui,-apple-system,"Segoe UI",sans-serif;
      -webkit-font-smoothing:antialiased}
    a{color:#E3A54B}
    a:hover{color:#F2BC6B}
    .bar{border-bottom:1px solid rgba(255,255,255,.07);position:sticky;top:0;
      background:rgba(10,13,19,.92);backdrop-filter:blur(8px);z-index:2}
    .bar .in{max-width:46rem;margin:0 auto;padding:.85rem 1.25rem;display:flex;
      align-items:center;justify-content:space-between;gap:1rem}
    .logo{font-weight:900;letter-spacing:.02em;font-size:15px;color:#F4F1E6;text-decoration:none}
    .logo span{color:#E3A54B}
    .play{background:#4FA96B;color:#0A0D13;font-weight:800;font-size:12px;
      letter-spacing:.1em;text-transform:uppercase;padding:.5rem .9rem;
      border-radius:9px;text-decoration:none}
    main{max-width:46rem;margin:0 auto;padding:3rem 1.25rem 4rem}
    h1{font-size:2.1rem;line-height:1.12;letter-spacing:-.02em;margin:0 0 .6rem}
    .stand{color:#CBC5B4;font-size:1.08rem;line-height:1.6;margin:0 0 2.2rem}
    h2{font-size:1.22rem;line-height:1.3;margin:2.6rem 0 .7rem;letter-spacing:-.01em}
    p{margin:0 0 1.15rem;color:#DEDACD}
    ul{margin:0 0 1.3rem;padding-left:1.15rem}
    li{margin:0 0 .6rem;color:#DEDACD}
    strong{color:#F4F1E6}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;
      background:rgba(255,255,255,.06);padding:.1em .38em;border-radius:5px}
    blockquote{margin:0 0 1.3rem;padding:.9rem 1.1rem;border-left:2px solid #E3A54B;
      background:rgba(227,165,75,.06);border-radius:0 10px 10px 0;color:#DEDACD}
    .scroll{overflow-x:auto;margin:0 0 1.4rem}
    table{border-collapse:collapse;width:100%;font-size:.94rem}
    th,td{text-align:left;padding:.55rem .8rem;border-bottom:1px solid rgba(255,255,255,.07)}
    th{color:#7C8794;font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;font-weight:800}
    td:not(:first-child){color:#F4F1E6}
    .more{margin-top:3.5rem;padding-top:1.6rem;border-top:1px solid rgba(255,255,255,.07)}
    .more h2{margin-top:0}
    footer{border-top:1px solid rgba(255,255,255,.07);margin-top:3.5rem;padding-top:1.6rem;
      font-size:.8rem;color:rgba(124,135,148,.85);line-height:1.65}
    footer a{color:rgba(124,135,148,.95)}
    @media(max-width:640px){main{padding:2.2rem 1.15rem 3rem}h1{font-size:1.7rem}}
`

function render(page, all) {
  const others = all.filter((p) => p.slug !== page.slug)
  const url = `${SITE}/${page.slug}`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0A0D13" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>${esc(page.title)} — SPIN XI</title>
    <meta name="description" content="${esc(page.blurb)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="SPIN XI" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.blurb)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/og.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;700;800;900&display=swap" rel="stylesheet" />
    <style>${STYLE}</style>
  </head>
  <body>
    <nav class="bar"><div class="in">
      <a class="logo" href="/">SPIN <span>XI</span></a>
      <a class="play" href="/play">Play</a>
    </div></nav>
    <main>
      <h1>${esc(page.title)}</h1>
      <p class="stand">${rich(page.standfirst)}</p>
${page.body.map(block).join('\n')}

      <div class="more">
        <h2>More on how this is built</h2>
        <ul>
${others.map((o) => `          <li><a href="/${o.slug}">${esc(o.title)}</a> — ${esc(o.blurb)}</li>`).join('\n')}
        </ul>
      </div>

      <footer>
        <p>SPIN XI is an independent fan-made cricket draft and tournament simulator.
        It is not affiliated with, endorsed by or associated with any cricket board,
        league, franchise, player association or ratings provider. Player names, team
        names, ratings and season data are used for descriptive and editorial purposes
        only. No official logos, crests or player images are used.</p>
        <p><a href="/">Home</a> · <a href="/play">Play</a> ·
           <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
      </footer>
    </main>
  </body>
</html>
`
}

/* ── Read the authored pages out of the TypeScript source ─────────────────── */
const src = await readFile(join(ROOT, 'src/content/pages.ts'), 'utf8')
const body = src.slice(src.indexOf('export const PAGES'))
const json = body.slice(body.indexOf('['), body.lastIndexOf(']') + 1)
// The source is data, not code: object keys and single quotes are all it uses.
const PAGES = (await import('node:vm')).runInNewContext(`(${json})`)

const out = join(ROOT, 'dist')
await mkdir(out, { recursive: true })
for (const page of PAGES) {
  await writeFile(join(out, `${page.slug}.html`), render(page, PAGES))
}

/* The sitemap has to know about them or nobody will. */
const urls = [
  { loc: `${SITE}/`, freq: 'weekly', pri: '1.0' },
  { loc: `${SITE}/play`, freq: 'weekly', pri: '0.9' },
  { loc: `${SITE}/daily`, freq: 'daily', pri: '0.9' },
  ...PAGES.map((p) => ({ loc: `${SITE}/${p.slug}`, freq: 'monthly', pri: '0.8' })),
  { loc: `${SITE}/leaderboard`, freq: 'daily', pri: '0.7' },
  { loc: `${SITE}/multiplayer`, freq: 'monthly', pri: '0.5' },
  { loc: `${SITE}/privacy`, freq: 'monthly', pri: '0.3' },
  { loc: `${SITE}/terms`, freq: 'monthly', pri: '0.3' },
]
await writeFile(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`,
)

const words = PAGES.reduce(
  (a, p) => a + JSON.stringify(p.body).split(/\s+/).length, 0)
console.log(`  ${PAGES.length} pages written · about ${words.toLocaleString()} words · sitemap updated`)
