import type { CueView } from '@stagecue/arrangement'
import { describe, expect, it } from 'vitest'
import { changeIsNear, NEXT_LEAD_BARS } from './timing.ts'

const cue = (label: string) => ({ label, detail: null, beat: 0, blank: false })

const view = (countdown: CueView['countdown'], next: CueView['next'] = cue('Bridge')): CueView => ({
  index: 0,
  current: cue('Chorus'),
  next,
  countdown,
  beatPhase: 0,
  progress: 0.5,
  manual: false,
})

describe('changeIsNear', () => {
  it('stays quiet early in a section', () => {
    expect(changeIsNear(view({ bars: NEXT_LEAD_BARS + 1, finalBeats: null }))).toBe(false)
  })

  it('shows NEXT in the last bars before the change', () => {
    expect(changeIsNear(view({ bars: NEXT_LEAD_BARS, finalBeats: null }))).toBe(true)
    expect(changeIsNear(view({ bars: 1, finalBeats: 3 }))).toBe(true)
  })

  it('stays quiet while Ableton is stopped (no countdown)', () => {
    expect(changeIsNear(view(null))).toBe(false)
  })

  it('stays quiet in the last section, with nothing next', () => {
    expect(changeIsNear(view({ bars: 2, finalBeats: null }, null))).toBe(false)
  })
})
