import type { CueView } from '@stagecue/arrangement'

/**
 * How many bars before a change NEXT appears. Until then the choir sees only
 * the section they are in, which is what singers asked for: less going on.
 */
export const NEXT_LEAD_BARS = 4

/** True while Ableton plays the last NEXT_LEAD_BARS bars before the next section. */
export function changeIsNear(view: CueView): boolean {
  const countdown = view.countdown
  if (!countdown || !view.next) return false
  return countdown.finalBeats !== null || countdown.bars <= NEXT_LEAD_BARS
}
