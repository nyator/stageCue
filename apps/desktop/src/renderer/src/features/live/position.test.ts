import { describe, expect, it } from 'vitest'
import type { TimeSignature } from '@stagecue/arrangement'
import { barOf, barPosition } from './position'

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 }
const SIX_EIGHT: TimeSignature = { numerator: 6, denominator: 8 }

describe('barPosition', () => {
  it('starts at bar 1, beat 0', () => {
    expect(barPosition(0, FOUR_FOUR)).toEqual({ bar: 1, beatInBar: 0, phase: 0 })
  })

  it('counts quarter notes into bars and beats in 4/4', () => {
    const position = barPosition(21.25, FOUR_FOUR)
    expect(position.bar).toBe(6)
    expect(position.beatInBar).toBe(1)
    expect(position.phase).toBeCloseTo(0.25)
  })

  it('counts eighth-note beats in 6/8', () => {
    // A 6/8 bar is three quarter notes; 4.5 quarters is bar 2, eighth 3.
    expect(barPosition(4.5, SIX_EIGHT)).toEqual({ bar: 2, beatInBar: 3, phase: 0 })
  })

  it('treats a hair before the beat as the beat', () => {
    expect(barPosition(3.9999999, FOUR_FOUR)).toMatchObject({ bar: 2, beatInBar: 0 })
  })

  it('keeps the beat in range before the song start', () => {
    expect(barPosition(-1, FOUR_FOUR)).toMatchObject({ bar: 0, beatInBar: 3 })
  })
})

describe('barOf', () => {
  it('matches Ableton bar numbers', () => {
    expect(barOf(16, FOUR_FOUR)).toBe(5)
  })
})
