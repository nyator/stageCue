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

/**
 * The number to show while the beats are counted out before a change, and how
 * far through that number we are (0 as it appears, rising to 1), for its pulse.
 * Null before the count starts.
 *
 * The count spreads over `countBars` bars (Style → Count the beats), each number
 * lasting `countBars` beats: in 4/4, the last bar is 4, 3, 2, 1 on every beat;
 * the last 2 bars are 4, 3, 2, 1 every 2 beats. In 3/4 it counts 3, 2, 1.
 */
export function countIn(
  view: CueView,
  countBars: number,
): { number: number; phase: number } | null {
  const countdown = view.countdown
  if (!countdown || countdown.beats > countBars * countdown.beatsPerBar) return null
  const step = Math.max(1, countBars)
  const number = Math.ceil(countdown.beats / step)
  // Beats already spent on this number: 0 on its first beat, step - 1 on its last.
  const spent = number * step - countdown.beats
  return { number, phase: Math.min(1, (spent + view.beatPhase) / step) }
}
