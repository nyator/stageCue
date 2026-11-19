import type { CueView } from '@stagecue/arrangement'

/**
 * NEXT appears a chosen number of bars before a change (Style → Next section,
 * `nextLeadBars`). Until then the choir sees only the section they are in:
 * singers asked for less going on, but also enough warning to get ready.
 *
 * True when NEXT should show: within `leadBars` bars of the next section (0 means
 * the whole section). Never while Ableton is stopped (no countdown), and never
 * in the last section, with nothing next.
 */
export function changeIsNear(view: CueView, leadBars: number): boolean {
  const countdown = view.countdown
  if (!countdown || !view.next) return false
  if (leadBars <= 0) return true
  return countdown.finalBeats !== null || countdown.bars <= leadBars
}
