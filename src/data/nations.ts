/** Country codes used across the dataset. `home` marks the T20 League's home nation. */
export const NATIONS: Record<string, { flag: string; label: string }> = {
  IN: { flag: '🇮🇳', label: 'India' },
  AU: { flag: '🇦🇺', label: 'Australia' },
  EN: { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', label: 'England' },
  ZA: { flag: '🇿🇦', label: 'South Africa' },
  NZ: { flag: '🇳🇿', label: 'New Zealand' },
  PK: { flag: '🇵🇰', label: 'Pakistan' },
  LK: { flag: '🇱🇰', label: 'Sri Lanka' },
  WI: { flag: '🏝️', label: 'West Indies' },
  AF: { flag: '🇦🇫', label: 'Afghanistan' },
  BD: { flag: '🇧🇩', label: 'Bangladesh' },
  IE: { flag: '🇮🇪', label: 'Ireland' },
  ZW: { flag: '🇿🇼', label: 'Zimbabwe' },
  NL: { flag: '🇳🇱', label: 'Netherlands' },
  US: { flag: '🇺🇸', label: 'United States' },
  NA: { flag: '🇳🇦', label: 'Namibia' },
  AE: { flag: '🇦🇪', label: 'UAE' },
  SC: { flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', label: 'Scotland' },
  NP: { flag: '🇳🇵', label: 'Nepal' },
  OM: { flag: '🇴🇲', label: 'Oman' },
  CA: { flag: '🇨🇦', label: 'Canada' },
  KE: { flag: '🇰🇪', label: 'Kenya' },
  HK: { flag: '🇭🇰', label: 'Hong Kong' },
  PG: { flag: '🇵🇬', label: 'Papua New Guinea' },
  BM: { flag: '🇧🇲', label: 'Bermuda' },
}

/** The T20 League is an Indian competition, so non-Indians count as overseas. */
export const HOME_NATION = 'IN'
export const OVERSEAS_LIMIT = 4

export const flagOf = (code: string) => NATIONS[code]?.flag ?? '•'
export const nationLabel = (code: string) => NATIONS[code]?.label ?? code
