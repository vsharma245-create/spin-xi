import { motion } from 'framer-motion'
import type { Slot } from '../game/types'
import { ROLE_STYLE } from './roles'

/** Stylised fielding positions, in the order they get filled. */
const SPOTS: [number, number][] = [
  [150, 94], // bowler's end
  [200, 114],
  [100, 114],
  [234, 156],
  [66, 156],
  [236, 204],
  [64, 204],
  [206, 252],
  [94, 252],
  [150, 306], // deep fielder
  [150, 264], // keeper — must stay last (see KEEPER_INDEX)
]

const KEEPER_INDEX = SPOTS.length - 1

/**
 * A stylised ground, not a tactical diagram. The keeper goes behind the stumps
 * and everyone else fans out around them.
 */
export function Field({ slots, captainId }: { slots: Slot[]; captainId?: string | null }) {
  const filled = slots.filter((s) => s.player)
  const wkIndex = filled.findIndex((s) => s.role === 'WK')

  // Keeper claims the stumps spot; the rest take the fanned-out positions.
  const order: number[] = []
  let cursor = 0
  filled.forEach((_, i) => {
    if (i === wkIndex) order.push(KEEPER_INDEX)
    else order.push(cursor++)
  })

  return (
    <div className="pitch-panel pitch-stripes relative overflow-hidden p-2">
      <svg viewBox="0 0 300 340" className="w-full">
        {/* boundary */}
        <ellipse cx="150" cy="190" rx="142" ry="146" fill="#0C1712" stroke="#35D07F" strokeOpacity="0.18" />
        <ellipse cx="150" cy="190" rx="122" ry="126" fill="none" stroke="#35D07F" strokeOpacity="0.1" strokeDasharray="3 5" />
        {/* 30-yard circle */}
        <ellipse cx="150" cy="190" rx="82" ry="86" fill="none" stroke="#35D07F" strokeOpacity="0.14" />
        {/* pitch */}
        <rect x="138" y="132" width="24" height="112" rx="2" fill="#1A2119" stroke="#F2EEE3" strokeOpacity="0.14" />
        <line x1="138" y1="146" x2="162" y2="146" stroke="#F2EEE3" strokeOpacity="0.2" />
        <line x1="138" y1="230" x2="162" y2="230" stroke="#F2EEE3" strokeOpacity="0.2" />

        {filled.map((slot, i) => {
          const [x, y] = SPOTS[order[i]]
          const p = slot.player!
          const r = ROLE_STYLE[slot.role]
          const isCaptain = captainId === p.id
          return (
            <motion.g
              key={p.id}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.055, type: 'spring', stiffness: 320, damping: 22 }}
            >
              <circle cx={x} cy={y} r="13.5" fill="#0A0D0B" stroke={r.hex} strokeOpacity={isCaptain ? 0.95 : 0.55} strokeWidth={isCaptain ? 1.8 : 1.1} />
              <text
                x={x}
                y={y + 3.6}
                textAnchor="middle"
                className="font-display"
                fontSize="10.5"
                fontWeight="900"
                fill={r.hex}
              >
                {p.ovr}
              </text>
              <text
                x={x}
                y={y + 24}
                textAnchor="middle"
                className="font-sans"
                fontSize="7.2"
                fontWeight="700"
                letterSpacing="0.06em"
                fill="#C9C4B6"
              >
                {p.surname.length > 11 ? `${p.surname.slice(0, 10)}…` : p.surname}
              </text>
              {isCaptain && (
                <text x={x + 13} y={y - 10} textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#E5A83C">
                  C
                </text>
              )}
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}
