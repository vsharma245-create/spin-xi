/**
 * Whether this build carries advertising, and where the slots are.
 *
 * Kept out of the component file so that a screen can ask the question without
 * importing a component — the privacy policy needs the answer and renders no
 * advert of its own.
 */

/** The AdSense publisher id. Absent in every build that does not sell space. */
export const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined

/** Whether this build carries advertising at all. */
export const adsEnabled = Boolean(AD_CLIENT)

/**
 * Named so that a placement is a decision made once, here, rather than an id
 * pasted into a screen. The ids come from the AdSense dashboard; a slot left
 * unset simply does not appear.
 *
 * Nothing is listed for the draft, the spin, the live match or a multiplayer
 * room, and that is the point: those are the game, and an advert in the middle
 * of one is a reason to stop playing.
 */
export const SLOT = {
  /** The result screen, under the season records. The longest anyone sits still. */
  result: import.meta.env.VITE_AD_SLOT_RESULT as string | undefined,
  /** The home page, below the fold. */
  home: import.meta.env.VITE_AD_SLOT_HOME as string | undefined,
  /** The ladder, which people scroll. */
  leaderboard: import.meta.env.VITE_AD_SLOT_LEADERBOARD as string | undefined,
}
