import { describe, expect, it } from 'vitest'
import { BRIDGE_TIMEOUT_MS, LiveSession } from './live-session.ts'

const fourFour = { numerator: 4, denominator: 4 } as const
const markers = [
  { name: 'Intro', beat: 0 },
  { name: 'Verse 1', beat: 16 },
  { name: 'Chorus | Full choir', beat: 48 },
]

function session() {
  let now = 1_000
  const live = new LiveSession(() => now)
  return {
    live,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('LiveSession', () => {
  it('starts empty and following the DAW', () => {
    expect(session().live.snapshot()).toEqual({
      daw: { connected: false, name: null, project: null },
      markers: [],
      transport: null,
      mode: { mode: 'auto' },
      hidden: false,
    })
  })

  it('hides and shows the band, telling listeners only when it changes', () => {
    const { live } = session()
    let changes = 0
    live.onChange(() => {
      changes += 1
    })
    expect(live.setHidden(true)).toEqual({ hidden: true })
    expect(live.setHidden(true)).toEqual({ hidden: true })
    expect(live.snapshot().hidden).toBe(true)
    live.setHidden(false)
    expect(live.snapshot().hidden).toBe(false)
    expect(changes).toBe(2)
  })

  it('moves the playhead forward with the tempo between reports', () => {
    const { live, advance } = session()
    live.setTransport('c1', 'Ableton', {
      playing: true,
      beat: 10,
      tempo: 120,
      timeSignature: fourFour,
    })
    advance(1_500)
    expect(live.snapshot().transport?.beat).toBe(13)
    expect(live.snapshot().daw).toMatchObject({ connected: true, name: 'Ableton' })
  })

  it('freezes at the last estimated position when the bridge disconnects', () => {
    const { live, advance } = session()
    live.setMarkers('c1', 'Ableton', 'Sunday set', markers)
    live.setTransport('c1', 'Ableton', {
      playing: true,
      beat: 10,
      tempo: 60,
      timeSignature: fourFour,
    })
    advance(2_000)
    live.bridgeDisconnected('c1')
    advance(5_000)

    const state = live.snapshot()
    expect(state.daw.connected).toBe(false)
    expect(state.transport).toMatchObject({ playing: false, beat: 12 })
    expect(state.markers).toHaveLength(3)
  })

  it('follows one bridge and ignores a second one that is also sending', () => {
    const { live, advance } = session()
    const play = (beat: number) => ({ playing: true, beat, tempo: 120, timeSignature: fourFour })
    live.setTransport('c1', 'Ableton', play(10))
    advance(100)
    expect(live.setTransport('c2', 'Simulator', play(40))).toEqual({
      accepted: false,
      following: 'Ableton',
    })
    expect(live.setMarkers('c2', 'Simulator', null, [])).toMatchObject({ accepted: false })
    live.setTransport('c1', 'Ableton', play(10.2))
    expect(live.snapshot()).toMatchObject({
      daw: { name: 'Ableton' },
      transport: { beat: 10.2 },
    })
  })

  it('switches to another bridge when the followed one goes silent', () => {
    const { live, advance } = session()
    live.setMarkers('c1', 'Ableton', null, markers)
    advance(BRIDGE_TIMEOUT_MS + 1)
    expect(live.setMarkers('c2', 'Ableton laptop 2', null, [])).toEqual({ accepted: true })
    expect(live.snapshot().daw).toMatchObject({ connected: true, name: 'Ableton laptop 2' })
  })

  it('switches at once when the followed bridge disconnects, and ignores other disconnects', () => {
    const { live } = session()
    live.setMarkers('c1', 'Ableton', null, markers)
    live.setMarkers('c2', 'Ableton laptop 2', null, [])
    live.bridgeDisconnected('c2')
    expect(live.snapshot().daw).toMatchObject({ connected: true, name: 'Ableton' })
    live.bridgeDisconnected('c1')
    expect(live.setMarkers('c2', 'Ableton laptop 2', null, [])).toEqual({ accepted: true })
    expect(live.snapshot().daw).toMatchObject({ name: 'Ableton laptop 2' })
  })

  it('holds, steps, selects, and returns to auto', () => {
    const { live } = session()
    live.setMarkers('c1', 'Ableton', null, markers)
    live.setTransport('c1', 'Ableton', {
      playing: true,
      beat: 20,
      tempo: 90,
      timeSignature: fourFour,
    })

    expect(live.override({ action: 'hold' })).toEqual({ mode: 'manual', index: 1 })
    expect(live.override({ action: 'next' })).toEqual({ mode: 'manual', index: 2 })
    expect(live.override({ action: 'next' })).toEqual({ mode: 'manual', index: 2 })
    expect(live.override({ action: 'previous' })).toEqual({ mode: 'manual', index: 1 })
    expect(live.override({ action: 'select', index: 9 })).toEqual({ mode: 'manual', index: 2 })
    expect(live.override({ action: 'auto' })).toEqual({ mode: 'auto' })
  })

  it('steps from the section on screen even before the first report', () => {
    const { live } = session()
    live.setMarkers('c1', 'Ableton', null, markers)
    expect(live.override({ action: 'next' })).toEqual({ mode: 'manual', index: 1 })
  })

  it('refuses manual control when there are no markers', () => {
    const { live } = session()
    expect(() => live.override({ action: 'hold' })).toThrow(/no markers/)
    expect(live.override({ action: 'auto' })).toEqual({ mode: 'auto' })
  })

  it('notifies listeners on every change', () => {
    const { live } = session()
    let calls = 0
    live.onChange(() => (calls += 1))
    live.setMarkers('c1', 'Ableton', null, markers)
    live.setTransport('c1', 'Ableton', {
      playing: false,
      beat: 0,
      tempo: 90,
      timeSignature: fourFour,
    })
    live.override({ action: 'hold' })
    live.bridgeDisconnected('c1')
    expect(calls).toBe(4)
  })
})
