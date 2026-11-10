import { describe, expect, it } from 'vitest'
import { cueFrame, stepCursor, type CueSection } from './cue.ts'
import { barsPerPass, durationSeconds, layoutEntries, totalBars } from './layout.ts'
import { arrangementInputSchema, songInputSchema } from './model.ts'

const section = (name: string, repeatCount = 1): CueSection => ({
  name,
  type: 'verse',
  vocalParts: ['full_choir'],
  instructions: null,
  repeatCount,
})

describe('layoutEntries', () => {
  it('places entries back to back, expanding repeats', () => {
    const placed = layoutEntries(5, [
      { barsPerPass: 4, repeatCount: 1 },
      { barsPerPass: 8, repeatCount: 2 },
      { barsPerPass: 4, repeatCount: 1 },
    ])
    expect(placed.map(({ startBar, endBar }) => [startBar, endBar])).toEqual([
      [5, 8],
      [9, 24],
      [25, 28],
    ])
    expect(barsPerPass(placed[1]!)).toBe(8)
    expect(totalBars(placed)).toBe(24)
  })

  it('handles an empty arrangement', () => {
    expect(layoutEntries(1, [])).toEqual([])
    expect(totalBars([])).toBe(0)
  })
})

describe('durationSeconds', () => {
  it('converts bars to seconds in 4/4 and 6/8', () => {
    expect(durationSeconds(8, 120, 4)).toBe(16)
    expect(durationSeconds(4, 60, 6, 8)).toBe(12)
  })
})

describe('cue navigation', () => {
  const sections = [section('Intro'), section('Chorus', 3), section('Ending')]

  it('describes the current and next section with repeat progress', () => {
    expect(cueFrame(sections, { index: 1, pass: 2 })).toMatchObject({
      current: { name: 'Chorus' },
      next: { name: 'Ending' },
      pass: 2,
      totalPasses: 3,
    })
    expect(cueFrame(sections, { index: 2, pass: 1 })?.next).toBeNull()
    expect(cueFrame(sections, { index: 9, pass: 1 })).toBeNull()
  })

  it('steps through every pass and stops at both ends', () => {
    const visited: string[] = []
    let cursor = { index: 0, pass: 1 }
    for (let step = 0; step < 7; step += 1) {
      const frame = cueFrame(sections, cursor)!
      visited.push(`${frame.current.name} ${frame.pass}/${frame.totalPasses}`)
      cursor = stepCursor(sections, cursor, 1)
    }
    expect(visited).toEqual([
      'Intro 1/1',
      'Chorus 1/3',
      'Chorus 2/3',
      'Chorus 3/3',
      'Ending 1/1',
      'Ending 1/1',
      'Ending 1/1',
    ])

    expect(stepCursor(sections, { index: 2, pass: 1 }, -1)).toEqual({ index: 1, pass: 3 })
    expect(stepCursor(sections, { index: 0, pass: 1 }, -1)).toEqual({ index: 0, pass: 1 })
  })
})

describe('input schemas', () => {
  it('trims text and turns empty optional fields into null', () => {
    const parsed = songInputSchema.parse({
      title: '  Amazing Grace ',
      artist: '',
      defaultKey: ' G ',
      tempoBpm: 72,
      timeSignature: { numerator: 3, denominator: 4 },
      notes: '   ',
    })
    expect(parsed).toMatchObject({
      title: 'Amazing Grace',
      artist: null,
      defaultKey: 'G',
      notes: null,
    })
  })

  it('rejects duplicate vocal parts and odd time signatures', () => {
    expect(
      arrangementInputSchema.safeParse({
        name: 'Sunday',
        tempoBpm: null,
        songKey: null,
        notes: null,
        startBar: 1,
        entries: [
          {
            songSectionId: crypto.randomUUID(),
            barsPerPass: 8,
            repeatCount: 1,
            vocalParts: ['alto', 'alto'],
            instructions: null,
            notes: null,
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      songInputSchema.safeParse({
        title: 'X',
        artist: null,
        defaultKey: null,
        tempoBpm: null,
        timeSignature: { numerator: 4, denominator: 3 },
        notes: null,
      }).success,
    ).toBe(false)
  })
})
