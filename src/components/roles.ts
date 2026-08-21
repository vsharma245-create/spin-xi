import type { Role } from '../game/types'

/** One place defines role colour, so every surface stays consistent. */
export const ROLE_STYLE: Record<
  Role,
  { text: string; bg: string; border: string; ring: string; hex: string }
> = {
  WK: {
    text: 'text-gold',
    bg: 'bg-gold/10',
    border: 'border-gold/30',
    ring: 'ring-gold/40',
    hex: '#C9902F',
  },
  BAT: {
    text: 'text-cream',
    bg: 'bg-cream/[0.07]',
    border: 'border-cream/25',
    ring: 'ring-cream/30',
    hex: '#F4F1E6',
  },
  AR: {
    text: 'text-pitch',
    bg: 'bg-pitch/10',
    border: 'border-pitch/30',
    ring: 'ring-pitch/40',
    hex: '#4FA96B',
  },
  PACE: {
    text: 'text-leather',
    bg: 'bg-leather/10',
    border: 'border-leather/35',
    ring: 'ring-leather/40',
    hex: '#C8453A',
  },
  SPIN: {
    // Dusk teal — flight and drift, and the one role that isn't grass, cherry,
    // whites or brass, so a spinner is spotted at a glance.
    text: 'text-[#4E9FB0]',
    bg: 'bg-[#4E9FB0]/10',
    border: 'border-[#4E9FB0]/30',
    ring: 'ring-[#4E9FB0]/40',
    hex: '#4E9FB0',
  },
}

/** Rating tiers drive the OVR badge treatment: brass, willow, whites, dusk. */
export function ovrTier(ovr: number) {
  if (ovr >= 94) return { text: 'text-gold', bg: 'bg-gold/[0.14]', border: 'border-gold/40' }
  if (ovr >= 88) return { text: 'text-willow', bg: 'bg-willow/[0.12]', border: 'border-willow/35' }
  if (ovr >= 82) return { text: 'text-cream', bg: 'bg-cream/[0.07]', border: 'border-cream/20' }
  return { text: 'text-moss', bg: 'bg-white/[0.04]', border: 'border-white/10' }
}
