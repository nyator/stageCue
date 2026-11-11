import { describe, expect, it } from 'vitest'
import { computeCueView, cueIndexAt, type Playhead } from './cue.ts'
import {
  beatAt,
  DEFAULT_DISPLAY_SETTINGS,
  displaySettingsSchema,
  parseMarkerName,
  toCues,
  type TimeSignature,
  type Transport,
} from './model.ts'

const fourFour = { numerator: 4, denominator: 4 } as const
const sixEight = { numerator: 6, denominator: 8 } as const

const cues = toCues([
  { name: 'Verse 1', beat: 16 },
  { name: 'Intro', beat: 0 },
  { name: 'Chorus | Full choir', beat: 48 },
  { name: '-', beat: 80 },
])

const at = (beat: number, playing = true, timeSignature: TimeSignature = fourFour): Playhead => ({
  beat,
  playing,
  timeSignature,
})

describe('parseMarkerName', () => {
  it('splits the label from the extra line', () => {
    expect(parseMarkerName('  Chorus | Full choir ')).toEqual({
      label: 'Chorus',
      detail: 'Full choir',
      blank: false,
    })
    expect(parseMarkerName('Bridge')).toEqual({ label: 'Bridge', detail: null, blank: false })
    expect(parseMarkerName('Tag | ')).toMatchObject({ detail: null })
    expect(parseMarkerName('Vamp | Men | then women')).toMatchObject({ detail: 'Men | then women' })
  })

  it('treats "-" and empty names as blank', () => {
    expect(parseMarkerName('-').blank).toBe(true)
    expect(parseMarkerName('   ').blank).toBe(true)
    expect(parseMarkerName('| only detail').blank).toBe(true)
  })
})

describe('toCues', () => {
  it('sorts by position and keeps the last marker at a shared position', () => {
    const sorted = toCues([
      { name: 'B', beat: 8 },
      { name: 'A', beat: 0 },
      { name: 'B2', beat: 8 },
    ])
    expect(sorted.map((cue) => cue.label)).toEqual(['A', 'B2'])
  })
})

describe('beatAt', () => {
  const transport: Transport = { playing: true, beat: 10, tempo: 120, timeSignature: fourFour }

  it('advances with tempo while playing, and not when stopped', () => {
    expect(beatAt(transport, 500)).toBe(11)
    expect(beatAt({ ...transport, playing: false }, 500)).toBe(10)
    expect(beatAt(transport, -100)).toBe(10)
  })
})

describe('computeCueView in auto mode', () => {
  it('shows nothing before the first marker or without a playhead', () => {
    expect(
      computeCueView(toCues([{ name: 'Verse', beat: 4 }]), at(2), { mode: 'auto' }).current,
    ).toBeNull()
    expect(computeCueView(cues, null, { mode: 'auto' }).index).toBe(-1)
  })

  it('finds the current and next section, with a marker on the playhead counting as current', () => {
    const view = computeCueView(cues, at(16), { mode: 'auto' })
    expect(view.current?.label).toBe('Verse 1')
    expect(view.next).toMatchObject({ label: 'Chorus', detail: 'Full choir' })
  })

  it('counts bars, then beats in the final bar', () => {
    expect(computeCueView(cues, at(16), { mode: 'auto' }).countdown).toEqual({
      bars: 8,
      finalBeats: null,
    })
    expect(computeCueView(cues, at(43.5), { mode: 'auto' }).countdown).toEqual({
      bars: 2,
      finalBeats: null,
    })
    expect(computeCueView(cues, at(44), { mode: 'auto' }).countdown).toEqual({
      bars: 1,
      finalBeats: 4,
    })
    expect(computeCueView(cues, at(46.2), { mode: 'auto' }).countdown).toEqual({
      bars: 1,
      finalBeats: 2,
    })
    expect(computeCueView(cues, at(47.9), { mode: 'auto' }).countdown?.finalBeats).toBe(1)
  })

  it('counts in eighth-note beats in 6/8', () => {
    // 6/8: a bar is 3 quarter notes and six eighth-note beats.
    expect(computeCueView(cues, at(44, true, sixEight), { mode: 'auto' }).countdown).toEqual({
      bars: 2,
      finalBeats: null,
    })
    expect(computeCueView(cues, at(46, true, sixEight), { mode: 'auto' }).countdown).toEqual({
      bars: 1,
      finalBeats: 4,
    })
    expect(
      computeCueView(cues, at(45.5, true, sixEight), { mode: 'auto' }).countdown?.finalBeats,
    ).toBe(5)
  })

  it('has no countdown when stopped, or towards a blank marker', () => {
    expect(computeCueView(cues, at(44, false), { mode: 'auto' }).countdown).toBeNull()
    const view = computeCueView(cues, at(70), { mode: 'auto' })
    expect(view.next).toBeNull()
    expect(view.countdown).toBeNull()
  })

  it('clears the display at a blank marker', () => {
    const view = computeCueView(cues, at(90), { mode: 'auto' })
    expect(view.index).toBe(3)
    expect(view.current).toBeNull()
  })

  it('reports the phase within the beat for the pulse', () => {
    expect(computeCueView(cues, at(20.25), { mode: 'auto' }).beatPhase).toBeCloseTo(0.25)
    expect(computeCueView(cues, at(21), { mode: 'auto' }).beatPhase).toBe(0)
    expect(computeCueView(cues, at(21.25, false), { mode: 'auto' }).beatPhase).toBe(0)
  })
})

describe('progress through the section', () => {
  it('fills from the marker to the next one', () => {
    expect(computeCueView(cues, at(16), { mode: 'auto' }).progress).toBe(0)
    expect(computeCueView(cues, at(24), { mode: 'auto' }).progress).toBe(0.25)
    expect(computeCueView(cues, at(47.99), { mode: 'auto' }).progress).toBeCloseTo(1, 3)
    expect(computeCueView(cues, at(48), { mode: 'auto' }).progress).toBe(0)
  })

  it('still fills towards a blank marker that ends the song', () => {
    expect(computeCueView(cues, at(64), { mode: 'auto' }).progress).toBe(0.5)
  })

  it('is absent after the last marker, before the first, and in manual mode', () => {
    expect(computeCueView(cues, at(90), { mode: 'auto' }).progress).toBeNull()
    expect(
      computeCueView(toCues([{ name: 'Verse', beat: 4 }]), at(2), { mode: 'auto' }).progress,
    ).toBeNull()
    expect(computeCueView(cues, at(24), { mode: 'manual', index: 1 }).progress).toBeNull()
  })
})

describe('following the DAW tempo', () => {
  // Pulse peaks (phase 0) must land on the DAW's beats, at whatever tempo it reports.
  const peaksWithin = (tempo: number, ms: number) => {
    const transport: Transport = { playing: true, beat: 16, tempo, timeSignature: fourFour }
    let peaks = 0
    let previous = 1
    for (let t = 0; t <= ms; t += 5) {
      const { beatPhase } = computeCueView(
        cues,
        { ...transport, beat: beatAt(transport, t) },
        { mode: 'auto' },
      )
      if (beatPhase < previous) peaks += 1
      previous = beatPhase
    }
    return peaks
  }

  it('pulses once per beat at the reported tempo', () => {
    expect(peaksWithin(60, 10_000)).toBe(11) // beats at 0 s, 1 s, … 10 s
    expect(peaksWithin(120, 10_000)).toBe(21)
    expect(peaksWithin(72, 5_000)).toBe(7) // 6 beats in 5 s, plus the one at 0
  })

  it('counts down at the new speed after a tempo change', () => {
    const slow: Transport = { playing: true, beat: 44, tempo: 60, timeSignature: fourFour }
    const fast: Transport = { ...slow, tempo: 120 }
    // One second after the last bar starts: beat 3 at 60 BPM, but beat 2 at 120 BPM.
    const at = (t: Transport) =>
      computeCueView(cues, { ...t, beat: beatAt(t, 1_000) }, { mode: 'auto' }).countdown?.finalBeats
    expect(at(slow)).toBe(3)
    expect(at(fast)).toBe(2)
  })
})

describe('computeCueView in manual mode', () => {
  it('shows the chosen section and the one after it, without a countdown', () => {
    const view = computeCueView(cues, at(2), { mode: 'manual', index: 2 })
    expect(view).toMatchObject({
      manual: true,
      index: 2,
      current: { label: 'Chorus' },
      next: null,
      countdown: null,
    })
  })

  it('clamps an index that is out of range', () => {
    expect(computeCueView(cues, null, { mode: 'manual', index: 99 }).index).toBe(3)
    expect(computeCueView(cues, null, { mode: 'manual', index: -5 }).current?.label).toBe('Intro')
  })
})

describe('cueIndexAt', () => {
  it('returns -1 for an empty list', () => {
    expect(cueIndexAt([], 10)).toBe(-1)
  })
})

describe('display settings', () => {
  it('fill in fields that an older version did not have', () => {
    const fromOlderEngine = { ...DEFAULT_DISPLAY_SETTINGS, accent: '#123456' } as Record<
      string,
      unknown
    >
    delete fromOlderEngine.showProgress
    expect(displaySettingsSchema.parse(fromOlderEngine)).toEqual({
      ...DEFAULT_DISPLAY_SETTINGS,
      accent: '#123456',
      showProgress: true,
    })
  })
})

describe('looping', () => {
  // Intro 0, Verse 1 16, Chorus 48, "-" 80. A loop around the whole chorus:
  const chorusLoop = { start: 48, end: 80 }
  const inLoop = (beat: number, loop: { start: number; end: number } | null = chorusLoop) => ({
    ...at(beat),
    loop,
  })

  it('wraps the estimated playhead at the loop end instead of running into the next section', () => {
    const transport: Transport = {
      playing: true,
      beat: 79,
      tempo: 120,
      timeSignature: fourFour,
      loop: chorusLoop,
    }
    // 1 s at 120 BPM is 2 beats: 79 → 81 wraps to 49.
    expect(beatAt(transport, 1_000)).toBe(49)
    expect(beatAt({ ...transport, loop: null }, 1_000)).toBe(81)
    // Already past the loop end: the DAW plays on, so does the estimate.
    expect(beatAt({ ...transport, beat: 90 }, 1_000)).toBe(92)
  })

  it('shows the looped section again as next, counting down to the loop end', () => {
    const view = computeCueView(cues, inLoop(72), { mode: 'auto' })
    expect(view.current?.label).toBe('Chorus')
    expect(view.next?.label).toBe('Chorus')
    expect(view.countdown).toEqual({ bars: 2, finalBeats: null })
    expect(view.progress).toBe(0.75)
  })

  it('counts down to the loop end when the loop jumps back to an earlier section', () => {
    // Loop from the verse to halfway through the chorus.
    const view = computeCueView(cues, inLoop(60, { start: 16, end: 64 }), { mode: 'auto' })
    expect(view.current?.label).toBe('Chorus')
    expect(view.next?.label).toBe('Verse 1')
    expect(view.countdown).toEqual({ bars: 1, finalBeats: 4 })
  })

  it('shows no next section for a vamp looping inside one section', () => {
    const view = computeCueView(cues, inLoop(58, { start: 56, end: 64 }), { mode: 'auto' })
    expect(view.current?.label).toBe('Chorus')
    expect(view.next).toBeNull()
    expect(view.countdown).toBeNull()
  })

  it('ignores a loop that ends after the next marker, or that the playhead is past', () => {
    expect(
      computeCueView(cues, inLoop(20, { start: 0, end: 64 }), { mode: 'auto' }).next?.label,
    ).toBe('Chorus')
    expect(
      computeCueView(cues, inLoop(20, { start: 0, end: 8 }), { mode: 'auto' }).next?.label,
    ).toBe('Chorus')
  })
})
