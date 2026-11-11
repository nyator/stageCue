import { beatUnit, type TimeSignature } from '@stagecue/arrangement'

const EPSILON = 1e-6

export interface BarPosition {
  /** 1-based bar, as Ableton shows it. */
  bar: number
  /** 0-based beat within the bar, in the time signature's own beats. */
  beatInBar: number
  /** 0 on the beat, rising towards 1 just before the next. */
  phase: number
}

/** Where a playhead in quarter notes falls in bars and beats, for any time signature. */
export function barPosition(quarterNotes: number, timeSignature: TimeSignature): BarPosition {
  const unit = beatUnit(timeSignature)
  const beats = quarterNotes / unit
  const whole = Math.floor(beats + EPSILON)
  const bar = Math.floor(whole / timeSignature.numerator) + 1
  const beatInBar =
    ((whole % timeSignature.numerator) + timeSignature.numerator) % timeSignature.numerator
  return { bar, beatInBar, phase: Math.max(0, beats - whole) }
}

/** 1-based bar number of a position in quarter notes. */
export function barOf(quarterNotes: number, timeSignature: TimeSignature): number {
  return barPosition(quarterNotes, timeSignature).bar
}
