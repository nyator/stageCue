import type { CueView } from '@stagecue/arrangement'
import { describe, expect, it } from 'vitest'
import { changeIsNear, countIn } from './timing.ts'

const cue = (label: string) => ({ label, detail: null, beat: 0, blank: false })

type Bars = { bars: number; finalBeats: number | null } | null

const view = (short: Bars, next: CueView['next'] = cue('Bridge')): CueView => ({
  index: 0,
  current: cue('Chorus'),
  next,
  // Enough for these tests: whole bars of 4/4, or the final beats.
  countdown: short && {
    ...short,
    beats: short.finalBeats ?? short.bars * 4,
    beatsPerBar: 4,
  },
  beatPhase: 0,
  progress: 0.5,
  manual: false,
})

describe('changeIsNear', () => {
  it('stays quiet early in a section', () => {
    expect(changeIsNear(view({ bars: 9, finalBeats: null }), 8)).toBe(false)
  })

  it('shows NEXT from the chosen number of bars before the change', () => {
    expect(changeIsNear(view({ bars: 8, finalBeats: null }), 8)).toBe(true)
    expect(changeIsNear(view({ bars: 5, finalBeats: null }), 4)).toBe(false)
    expect(changeIsNear(view({ bars: 16, finalBeats: null }), 16)).toBe(true)
    expect(changeIsNear(view({ bars: 1, finalBeats: 3 }), 4)).toBe(true)
  })

  it('shows NEXT for the whole section when the lead is 0', () => {
    expect(changeIsNear(view({ bars: 40, finalBeats: null }), 0)).toBe(true)
  })

  it('stays quiet while Ableton is stopped (no countdown)', () => {
    expect(changeIsNear(view(null), 0)).toBe(false)
  })

  it('stays quiet in the last section, with nothing next', () => {
    expect(changeIsNear(view({ bars: 2, finalBeats: null }, null), 8)).toBe(false)
  })
})

const counting = (beats: number, beatsPerBar = 4, beatPhase = 0): CueView => ({
  ...view({ bars: Math.ceil(beats / beatsPerBar), finalBeats: null }),
  countdown: { bars: Math.ceil(beats / beatsPerBar), finalBeats: null, beats, beatsPerBar },
  beatPhase,
})

/** The number shown at each of the given beats left. */
const numbers = (from: number, countBars: number, beatsPerBar = 4) =>
  Array.from(
    { length: from },
    (_, i) => countIn(counting(from - i, beatsPerBar), countBars)?.number ?? null,
  )

describe('countIn', () => {
  it('last bar: 4, 3, 2, 1 on each beat', () => {
    expect(numbers(5, 1)).toEqual([null, 4, 3, 2, 1])
  })

  it('last 2 bars: 4, 3, 2, 1, each held for 2 beats', () => {
    // Beats left: 9 8 7 6 5 4 3 2 1
    expect(numbers(9, 2)).toEqual([null, 4, 4, 3, 3, 2, 2, 1, 1])
  })

  it('pulses once per number: at its first beat, fading over its 2 beats', () => {
    expect(countIn(counting(8, 4, 0), 2)?.phase).toBe(0)
    expect(countIn(counting(8, 4, 0.5), 2)?.phase).toBe(0.25)
    expect(countIn(counting(7, 4, 0), 2)?.phase).toBe(0.5)
    expect(countIn(counting(6, 4, 0), 2)?.phase).toBe(0)
  })

  it('counts the beats of the bar in other time signatures: 3, 2, 1 in 3/4', () => {
    expect(numbers(7, 2, 3)).toEqual([null, 3, 3, 2, 2, 1, 1])
    expect(numbers(4, 1, 3)).toEqual([null, 3, 2, 1])
  })

  it('counts nothing while Ableton is stopped', () => {
    expect(countIn(view(null), 2)).toBeNull()
  })
})
