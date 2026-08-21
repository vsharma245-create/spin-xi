/**
 * A visual identity for every side in the archive.
 *
 * Cricket teams are recognised by their colours long before their names are
 * read — a wall of yellow is Chennai, a maroon cap is the West Indies. A list
 * of identical grey rows throws all of that away and makes one franchise
 * indistinguishable from the next.
 *
 * Sides with colours worth knowing are listed. The rest — county sides, the
 * forty-odd Bangladesh Premier League clubs that lasted a season each — are
 * given a colour derived from their name, which is arbitrary but *stable*:
 * the same club is the same colour every time it is drawn, which is the part
 * that actually helps you recognise it.
 */

export interface Identity {
  /** Worn colour: fills the crest. */
  primary: string
  /** Trim: the second colour on the shirt. */
  accent: string
  /** Two or three letters, as a cap badge would carry. */
  monogram: string
  /** Ink for the lettering — black or white, whichever can be read on `primary`. */
  ink: string
}

/**
 * Whether a colour is light enough to need dark lettering.
 *
 * Chennai play in yellow and Peshawar in gold; white letters on those are
 * invisible. The West Indies crest read as a single letter for exactly this
 * reason — "WI" split across maroon and gold, with the I lost on the gold.
 */
function isLight(colour: string): boolean {
  let r = 0
  let g = 0
  let b = 0
  const hex = colour.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const v = parseInt(hex[1], 16)
    r = (v >> 16) & 255
    g = (v >> 8) & 255
    b = v & 255
  } else {
    // hsl(H S% L%) — lightness alone is enough to make the call.
    const l = Number(colour.match(/(\d+(?:\.\d+)?)%\)$/)?.[1] ?? 50)
    return l > 62
  }
  // Perceived brightness: the eye weights green far above blue.
  return (r * 299 + g * 587 + b * 114) / 1000 > 145
}

/* Colours are the sides' own, as worn. */
const KNOWN: Record<string, [string, string]> = {
  /* ── Indian T20 League ── */
  MUMBAI: ['#0A4BA0', '#D1AB3E'],
  CHENNAI: ['#F2C300', '#0081E9'],
  CHALLENGERS: ['#C9152B', '#D8D2C4'],
  KOLKATA: ['#4A2A73', '#C9902F'],
  HYDERABAD: ['#F26522', '#1B1B1B'],
  CAPITALS: ['#17479E', '#EF3B41'],
  PUNJAB: ['#C81E28', '#C8CDD2'],
  RAJASTHAN: ['#D61A7E', '#2B4EA2'],
  TITANS: ['#1B2A45', '#B9A05F'],
  LUCKNOW: ['#0C7CBE', '#F2A900'],
  DECCAN: ['#1B2A4A', '#B7BCC2'],
  KOCHI: ['#E8701A', '#57318C'],
  WARRIORS: ['#1E5AA8', '#8FC9E8'],
  LIONS: ['#DD5121', '#1F3F94'],
  SUPERGIANT: ['#D6207E', '#1E2F60'],

  /* ── National sides ── */
  INDIA: ['#1A62C4', '#FF9933'],
  AUSTRALIA: ['#F2C300', '#0B6B3A'],
  ENGLAND: ['#22376F', '#D9DEE6'],
  PAKISTAN: ['#0C6B3D', '#E8E8E8'],
  'SOUTH AFRICA': ['#0B7A4B', '#F2B300'],
  'NEW ZEALAND': ['#23262B', '#C4C8CC'],
  'WEST INDIES': ['#7B1230', '#E2B33C'],
  'SRI LANKA': ['#1B49A5', '#F2A200'],
  BANGLADESH: ['#0B6A4F', '#E23A46'],
  ZIMBABWE: ['#C62026', '#1B7A43'],
  IRELAND: ['#189B62', '#F2843E'],
  NETHERLANDS: ['#F26B1D', '#20365E'],
  SCOTLAND: ['#1462AE', '#D9DEE6'],
  'UNITED ARAB EMIRATES': ['#0E7A4A', '#C8102E'],
  NEPAL: ['#C8203C', '#123A82'],
  OMAN: ['#C8102E', '#0B7A3D'],
  CANADA: ['#D42B34', '#E8E8E8'],
  KENYA: ['#0B7A34', '#C21F26'],
  NAMIBIA: ['#12428C', '#0B9550'],
  'UNITED STATES OF AMERICA': ['#3C4A87', '#B22234'],
  'PAPUA NEW GUINEA': ['#C8112B', '#E2C044'],
  'HONG KONG': ['#D62B1F', '#E8E8E8'],
  BERMUDA: ['#C8203C', '#1B3A73'],

  /* ── Big Bash ── */
  'BBL-ADELAIDESTRIKERS': ['#0B62B0', '#E8E8E8'],
  'BBL-BRISBANEHEAT': ['#14A3AD', '#E8447F'],
  'BBL-HOBARTHURRICANES': ['#4E2E86', '#3FB3C8'],
  'BBL-MELBOURNERENEGADES': ['#DC1E36', '#1B1B1B'],
  'BBL-MELBOURNESTARS': ['#0FA050', '#1B2A45'],
  'BBL-PERTHSCORCHERS': ['#F2812B', '#1B2A45'],
  'BBL-SYDNEYSIXERS': ['#E0218A', '#1B1B1B'],
  'BBL-SYDNEYTHUNDER': ['#9BC72B', '#1B2A45'],

  /* ── Pakistan Super League ── */
  'PSL-ISLAMABADUNITED': ['#D62B34', '#1B2A45'],
  'PSL-KARACHIKINGS': ['#12A5DE', '#C9902F'],
  'PSL-LAHOREQALANDARS': ['#0F9C51', '#1B2A45'],
  'PSL-MULTANSULTANS': ['#1BA0DC', '#C9902F'],
  'PSL-PESHAWARZALMI': ['#E8C81E', '#1B1B1B'],
  'PSL-QUETTAGLADIATORS': ['#4E2E86', '#C9902F'],

  /* ── SA20 ── */
  'SAT-MICAPETOWN': ['#0A4BA0', '#D1AB3E'],
  'SAT-PAARLROYALS': ['#D61A7E', '#2B4EA2'],
  'SAT-PRETORIACAPITALS': ['#17479E', '#EF3B41'],
  'SAT-DURBANSSUPERGIANTS': ['#0C7CBE', '#F2A900'],
  'SAT-JOBURGSUPERKINGS': ['#F2C300', '#0081E9'],
  'SAT-SUNRISERSEASTERNCAPE': ['#F26522', '#1B1B1B'],

  /* ── Caribbean Premier League ── */
  'CPL-TRINBAGOKNIGHTRIDERS': ['#4A2A73', '#C9902F'],
  'CPL-GUYANAAMAZONWARRIORS': ['#0B7A4B', '#E2B33C'],
  'CPL-BARBADOSROYALS': ['#D61A7E', '#1B2A45'],
  'CPL-BARBADOSTRIDENTS': ['#1462AE', '#E2B33C'],
  'CPL-JAMAICATALLAWAHS': ['#0FA050', '#E8C81E'],
  'CPL-STLUCIAKINGS': ['#12A5DE', '#E8C81E'],
  'CPL-STKITTSANDNEVISPATRIOTS': ['#C8203C', '#1B2A45'],

  /* ── Major League Cricket ── */
  'MLC-LOSANGELESKNIGHTRIDERS': ['#4A2A73', '#C9902F'],
  'MLC-MINEWYORK': ['#0A4BA0', '#D1AB3E'],
  'MLC-TEXASSUPERKINGS': ['#F2C300', '#0081E9'],
  'MLC-WASHINGTONFREEDOM': ['#C8203C', '#1B2A45'],
  'MLC-SEATTLEORCAS': ['#12525E', '#3FB3C8'],
  'MLC-SANFRANCISCOUNICORNS': ['#E0218A', '#F2C300'],

  /* ── The Hundred ── */
  'HND-BIRMINGHAMPHOENIX': ['#D62B34', '#F2C300'],
  'HND-LONDONSPIRIT': ['#C8B273', '#1B2A45'],
  'HND-MANCHESTERORIGINALS': ['#E0218A', '#1B1B1B'],
  'HND-NORTHERNSUPERCHARGERS': ['#00A3AD', '#1B2A45'],
  'HND-OVALINVINCIBLES': ['#12525E', '#3FB3C8'],
  'HND-SOUTHERNBRAVE': ['#E8447F', '#1B2A45'],
  'HND-TRENTROCKETS': ['#E8C81E', '#1B2A45'],
  'HND-WELSHFIRE': ['#C8203C', '#F2812B'],
}

/**
 * A stable colour for a side nobody has painted yet.
 *
 * Hue comes from the name, so it never changes; saturation and lightness are
 * fixed near the values the drawn crests use, so an unlisted club still looks
 * like it belongs beside them rather than like a placeholder.
 */
function derived(key: string): [string, string] {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  const hue = Math.abs(h) % 360
  return [`hsl(${hue} 52% 42%)`, `hsl(${(hue + 42) % 360} 46% 62%)`]
}

/** Cap-badge lettering: initials for a multi-word side, otherwise a stem. */
function monogramOf(name: string): string {
  const words = name
    .replace(/^[A-Z]{3}-/, '')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] ?? name).slice(0, 3).toUpperCase()
}

const cache = new Map<string, Identity>()

export function identityOf(teamKey: string, teamName = teamKey): Identity {
  const hit = cache.get(teamKey)
  if (hit) return hit
  const [primary, accent] = KNOWN[teamKey] ?? derived(teamKey)
  const id: Identity = {
    primary,
    accent,
    monogram: monogramOf(teamName || teamKey),
    ink: isLight(primary) ? '#12161F' : '#FFFFFF',
  }
  cache.set(teamKey, id)
  return id
}
