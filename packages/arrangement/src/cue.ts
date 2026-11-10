import { beatUnit, type Cue, type TimeSignature } from './model.ts'

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
  const next = visible(cues[index + 1])
  const unit = beatUnit(playhead.timeSignature)
  const beatsInto = playhead.beat / unit
  const beatPhase = playhead.playing ? beatsInto - Math.floor(beatsInto + EPSILON) : 0

  let countdown: Countdown | null = null
  if (playhead.playing && next) {
    const remaining = (next.beat - playhead.beat) / unit
    if (remaining > EPSILON) {
      const perBar = playhead.timeSignature.numerator
      countdown = {
        bars: Math.ceil(remaining / perBar - EPSILON),
        finalBeats: remaining <= perBar + EPSILON ? Math.ceil(remaining - EPSILON) : null,
      }
    }
  }

  // Measured to the next marker of any kind, so a section ending in "-" still fills up.
  const start = cues[index]
  const end = cues[index + 1]
  const progress =
    start && end && !start.blank && end.beat > start.beat
      ? clamp01((playhead.beat - start.beat) / (end.beat - start.beat))
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
