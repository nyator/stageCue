import { describe, expect, it } from 'vitest'
import { ArrivalClock, MAX_LATENESS_MS } from './arrival.ts'

/** A sender whose clock is `offset` ms off, sending every 50 ms; `delays` is each trip, in order. */
function run(delays: number[], offset = 3_700, clock = new ArrivalClock()) {
  return delays.map((delay, i) => {
    const sentAt = i * 50 + offset
    return clock.lateness(sentAt, i * 50 + delay)
  })
}

describe('ArrivalClock', () => {
  it('sees steady messages as on time, whatever the clock difference', () => {
    expect(run([5, 5, 5, 5])).toEqual([0, 0, 0, 0])
    expect(run([5, 5, 5], -86_400_000)).toEqual([0, 0, 0])
  })

  it('measures jitter against the quickest trip', () => {
    expect(run([5, 25, 5, 85])).toEqual([0, 20, 0, 80])
  })

  it('measures a burst after a stall: the oldest waited longest', () => {
    // Four messages held by the link and delivered together at 1 000 ms.
    const delays = [5, 5, 1_000 - 100, 1_000 - 150, 1_000 - 200, 1_000 - 250, 5]
    expect(run(delays)).toEqual([0, 0, 895, 845, 795, 745, 0])
  })

  it('never reports more than MAX_LATENESS_MS', () => {
    expect(run([5, 10_000])[1]).toBe(MAX_LATENESS_MS)
  })

  it('starts again when the sender’s clock is set back', () => {
    const clock = new ArrivalClock()
    // 5 s of normal traffic, then the sender's clock jumps back 2 s for good.
    const before = Array.from({ length: 100 }, () => 5)
    run(before, 0, clock)
    const after = Array.from({ length: 80 }, (_, i) => {
      const t = (100 + i) * 50
      return clock.lateness(t - 2_000, t + 5)
    })
    // At first every message looks 2 s late; within a few seconds it is on time again.
    expect(after[0]).toBe(2_000)
    expect(after.at(-1)).toBe(0)
  })

  it('ignores a missing timestamp', () => {
    expect(new ArrivalClock().lateness(Number.NaN, 1_000)).toBe(0)
  })
})
