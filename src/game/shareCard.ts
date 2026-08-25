/**
 * A season, drawn as an image you can post.
 *
 * Sharing was a block of text with no link in it, which is the worst of both
 * worlds: nothing to look at in a group chat, and no way back to the game for
 * anyone who saw it. A picture of the result is the thing people actually
 * post, and it carries the address of the draw that produced it.
 *
 * Drawn on a canvas rather than rendered from the DOM, because the card wants
 * a layout of its own — sixteen by nine, readable at thumbnail size, and the
 * same whatever screen it was played on.
 */
import { PITCH } from './types'
import type { TournamentResult } from './types'

const W = 1200
const H = 630

const INK = '#0A0D13'
const PANEL = '#11151E'
const CREAM = '#F4EFE4'
const MOSS = '#6E7A73'
const PITCH_GREEN = '#35D07F'
const GOLD = '#D8A657'
const LEATHER = '#C1553F'

const font = (size: number, weight = 800) =>
  `${weight} ${size}px Archivo, "Helvetica Neue", Arial, sans-serif`

/** Cuts a string to fit, with an ellipsis, so nothing ever overruns its box. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1)
  return `${cut}…`
}

export async function drawShareCard(r: TournamentResult): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // The brand face has to be loaded before anything is measured, or the card
  // is laid out in a fallback and drawn in another.
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
  } catch {
    /* older browser — the fallback stack is fine */
  }

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  // A quiet arc of the ball, so the card is not a plain rectangle.
  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.strokeStyle = PITCH_GREEN
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.arc(W - 120, H + 60, 220 + i * 70, Math.PI, Math.PI * 1.5)
    ctx.stroke()
  }
  ctx.restore()

  /* ── Wordmark ── */
  ctx.fillStyle = CREAM
  ctx.font = font(34, 900)
  ctx.fillText('SPIN', 64, 88)
  const spinW = ctx.measureText('SPIN ').width
  ctx.fillStyle = GOLD
  ctx.fillRect(64 + spinW, 60, 62, 36)
  ctx.fillStyle = INK
  ctx.font = font(26, 900)
  ctx.fillText('XI', 64 + spinW + 14, 87)

  ctx.fillStyle = MOSS
  ctx.font = font(18, 700)
  ctx.fillText(r.teamName.toUpperCase(), 64, 132)

  /* ── Headline ── */
  const won = r.outcome === 'CHAMPIONS'
  ctx.fillStyle = won ? PITCH_GREEN : r.outcome === 'RUNNERS-UP' ? GOLD : CREAM
  ctx.font = font(76, 900)
  ctx.fillText(fit(ctx, headline(r), 700), 64, 226)

  /* ── The numbers that matter ── */
  const stats: [string, string, string][] = [
    ['record', recordOf(r), CREAM],
    ['points', String(r.points), PITCH_GREEN],
    ['ovr', String(r.ratings.ovr), CREAM],
    ['finished', `${r.standing}${ordinal(r.standing)}`, CREAM],
  ]
  stats.forEach(([label, value, colour], i) => {
    const x = 64 + i * 190
    ctx.fillStyle = PANEL
    roundRect(ctx, x, 268, 168, 104, 16)
    ctx.fill()
    ctx.fillStyle = MOSS
    ctx.font = font(15, 700)
    ctx.fillText(label.toUpperCase(), x + 20, 300)
    ctx.fillStyle = colour
    ctx.font = font(42, 900)
    ctx.fillText(fit(ctx, value, 132), x + 20, 350)
  })

  /* ── Every match, as a run of blocks ── */
  const results = [...r.matches, ...r.knockouts]
  const cell = Math.min(30, Math.floor(760 / Math.max(results.length, 1)) - 4)
  results.forEach((m, i) => {
    ctx.fillStyle =
      m.outcome === 'W' ? PITCH_GREEN : m.outcome === 'D' ? GOLD : LEATHER
    roundRect(ctx, 64 + i * (cell + 4), 404, cell, cell, 5)
    ctx.fill()
  })

  /* ── The XI itself, which is what the argument is about ── */
  ctx.fillStyle = MOSS
  ctx.font = font(15, 700)
  ctx.fillText('THE ELEVEN', 64, 486)
  const names = r.slots.map((s) => s.player?.surname ?? '').filter(Boolean)
  ctx.font = font(21, 800)
  ctx.fillStyle = CREAM
  const half = Math.ceil(names.length / 2)
  names.slice(0, half).forEach((n, i) => {
    ctx.fillText(fit(ctx, n, 180), 64 + i * 190, 520)
  })
  names.slice(half).forEach((n, i) => {
    ctx.fillText(fit(ctx, n, 180), 64 + i * 190, 552)
  })

  /* ── The invitation ── */
  ctx.fillStyle = PITCH_GREEN
  ctx.font = font(20, 800)
  ctx.fillText('spin-xi.com', 64, 600)
  ctx.fillStyle = MOSS
  ctx.font = font(18, 600)
  const tail = r.drawSeed ? '· same draw, your turn' : `· ${PITCH[r.matches[0]?.pitch ?? 'NEUTRAL'].label}`
  ctx.fillText(tail, 64 + ctx.measureText('spin-xi.com ').width + 8, 600)

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.92))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const ordinal = (n: number) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')

function headline(r: TournamentResult) {
  if (r.perfect) return 'PERFECT SEASON'
  if (r.outcome === 'CHAMPIONS') return 'CHAMPIONS'
  if (r.outcome === 'RUNNERS-UP') return 'RUNNERS-UP'
  return r.qualified ? 'KNOCKED OUT' : 'MISSED OUT'
}

function recordOf(r: TournamentResult) {
  return r.draws ? `${r.wins}-${r.losses}-${r.draws}` : `${r.wins}–${r.losses}`
}
