import type { CueView } from '@stagecue/arrangement'
import { describe, expect, it } from 'vitest'
import { changeIsNear } from './timing.ts'

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
