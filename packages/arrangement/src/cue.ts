import { activeLoop, beatUnit, type Cue, type Loop, type TimeSignature } from './model.ts'

/** Following the DAW, or a section the director picked by hand. */
export type CueMode = { mode: 'auto' } | { mode: 'manual'; index: number }

export interface Countdown {
  /** Whole bars left before the next section, rounded up. */
  bars: number
  /** 4, 3, 2, 1 during the last bar (in 4/4); null before that. */
  finalBeats: number | null
}

export interface CueView {
  /** Index of the current cue, or -1 before the first one. */
  index: number
  /** What to show now. Null when there is nothing, or the cue is blank. */
  current: Cue | null
  next: Cue | null
  countdown: Countdown | null
  /** 0 at each beat, rising to 1 just before the next. Drives the pulse. */
  beatPhase: number
  /**
   * How far through the current section the playhead is: 0 at its marker, 1 at
   * the next marker. Null when there is no section with an end to measure, or
   * when the director has taken over.
   */
  progress: number | null
  manual: boolean
}

export interface Playhead {
  beat: number
  playing: boolean
  timeSignature: TimeSignature
  /** The DAW's loop region while looping is on. */
  loop?: Loop | null | undefined
}

// Positions within a millionth of a beat count as the same moment, so a marker
// exactly on the playhead is already current.
const EPSILON = 1e-6

/** The last cue at or before the playhead, or -1. */
export function cueIndexAt(cues: readonly Cue[], beat: number): number {
  let index = -1
  for (let i = 0; i < cues.length; i += 1) {
    if (cues[i]!.beat <= beat + EPSILON) index = i
    else break
  }
  return index
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * The section that comes after the current one, and the beat where it starts.
 * Normally that is the next marker. Inside a loop that ends before the next
 * marker, it is wherever the loop jumps back to:
 * - a loop starting on a marker (looping a whole chorus) shows that section
 *   again as next, with a countdown to the loop end, so the choir knows it repeats;
 * - a loop inside the current section (a vamp) shows no next and no countdown,
 *   since nothing changes until someone switches the loop off.
 */
function upcomingCue(
  cues: readonly Cue[],
  index: number,
  playhead: Playhead,
): { cue: Cue | undefined; at: number | null } {
  const following = cues[index + 1]
  const loop = activeLoop(playhead)
  if (!loop || (following && following.beat < loop.end - EPSILON)) {
    return { cue: following, at: following?.beat ?? null }
  }

  const target = cueIndexAt(cues, loop.start)
  const startsOnMarker = target >= 0 && Math.abs(cues[target]!.beat - loop.start) < EPSILON
  if (target < 0 || (target === index && !startsOnMarker)) return { cue: undefined, at: null }
  return { cue: cues[target], at: loop.end }
}

const visible = (cue: Cue | undefined): Cue | null => (cue && !cue.blank ? cue : null)

export function computeCueView(
  cues: readonly Cue[],
  playhead: Playhead | null,
  mode: CueMode,
): CueView {
  if (mode.mode === 'manual') {
    const index = Math.min(Math.max(mode.index, 0), cues.length - 1)
    return {
      index,
      current: visible(cues[index]),
      next: visible(cues[index + 1]),
      countdown: null,
      beatPhase: 0,
      progress: null,
      manual: true,
    }
  }

  if (!playhead) {
    return {
      index: -1,
      current: null,
      next: null,
      countdown: null,
      beatPhase: 0,
      progress: null,
      manual: false,
    }
  }

  const index = cueIndexAt(cues, playhead.beat)
  const { cue: upcoming, at: boundary } = upcomingCue(cues, index, playhead)
  const next = visible(upcoming)
  const unit = beatUnit(playhead.timeSignature)
  const beatsInto = playhead.beat / unit
  const beatPhase = playhead.playing ? beatsInto - Math.floor(beatsInto + EPSILON) : 0

  let countdown: Countdown | null = null
  if (playhead.playing && next && boundary !== null) {
    const remaining = (boundary - playhead.beat) / unit
    if (remaining > EPSILON) {
      const perBar = playhead.timeSignature.numerator
      countdown = {
        bars: Math.ceil(remaining / perBar - EPSILON),
        finalBeats: remaining <= perBar + EPSILON ? Math.ceil(remaining - EPSILON) : null,
      }
    }
  }

  // Measured to the next marker of any kind, so a section ending in "-" still
  // fills up; or to the loop end, when the loop turns back before that marker.
  const start = cues[index]
  const loop = activeLoop(playhead)
  let end = cues[index + 1]?.beat ?? null
  if (loop && (end === null || end > loop.end)) end = loop.end
  const progress =
    start && end !== null && !start.blank && end > start.beat
      ? clamp01((playhead.beat - start.beat) / (end - start.beat))
      : null

  return {
    index,
    current: visible(cues[index]),
    next,
    countdown,
    beatPhase: clamp01(beatPhase),
    progress,
    manual: false,
  }
}
