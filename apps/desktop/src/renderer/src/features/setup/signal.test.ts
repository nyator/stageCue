import { describe, expect, it } from 'vitest'
import { browserDisplays, describeSignalPath, type SignalInput } from './signal'

const id = () => crypto.randomUUID()

const base: SignalInput = {
  engine: {
    phase: 'connected',
    addresses: ['192.168.1.20'],
    port: 7417,
    clients: [
      { clientId: id(), role: 'desktop', name: 'Media PC' },
      { clientId: id(), role: 'display', name: 'Media PC output' },
      { clientId: id(), role: 'display', name: 'HDMI TV (attached)' },
      { clientId: id(), role: 'display', name: 'Choir TV' },
      { clientId: id(), role: 'daw_bridge', name: 'Ableton' },
    ],
  },
  daw: { connected: true, name: 'StageCue device', project: 'Sunday set' },
  locators: 6,
  transport: { playing: true, tempo: 96 },
  output: { state: 'sending', sourceName: 'StageCue', message: '', receivers: 1 },
  screens: [
    { id: 1, label: 'Built-in', width: 1920, height: 1200, primary: true, showing: false },
    { id: 2, label: 'HDMI TV', width: 3840, height: 2160, primary: false, showing: true },
  ],
}

describe('browserDisplays', () => {
  it('leaves out the NDI output page and attached screens', () => {
    expect(
      browserDisplays(base.engine.phase === 'connected' ? base.engine.clients : []).map(
        (c) => c.name,
      ),
    ).toEqual(['Choir TV'])
  })
})

describe('describeSignalPath', () => {
  it('lights every live link and reports ready', () => {
    const path = describeSignalPath(base)
    expect(path.nodes.ableton).toEqual({
      lamp: 'live',
      status: 'Playing',
      detail: 'Sunday set · 96 BPM',
      foot: '6 locators in the set',
    })
    expect(path.nodes.engine).toMatchObject({
      lamp: 'ready',
      detail: '192.168.1.20:7417',
      foot: '5 connections now',
    })
    expect(path.nodes.propresenter).toMatchObject({
      lamp: 'live',
      status: 'On air',
      detail: '1 receiver',
    })
    expect(path.nodes.screens).toMatchObject({ lamp: 'live', detail: '1 of 2 screens' })
    expect(path.nodes.browsers).toMatchObject({ lamp: 'live', detail: 'Choir TV' })
    expect(path.verdict).toEqual({
      tone: 'ok',
      text: 'Ready. Ableton is playing, and the cue is on 3 outputs.',
    })
    expect(path.needsAttention).toBeNull()
  })

  it('points at the engine first when it is down', () => {
    const path = describeSignalPath({ ...base, engine: { phase: 'offline' } })
    expect(path.verdict.tone).toBe('bad')
    expect(path.needsAttention).toBe('engine')
    expect(path.nodes.ableton.lamp).toBe('off')
    expect(path.nodes.browsers.lamp).toBe('off')
  })

  it('points at Ableton when the device is not connected', () => {
    const path = describeSignalPath({
      ...base,
      daw: { connected: false, name: null, project: null },
    })
    expect(path.nodes.ableton).toEqual({
      lamp: 'waiting',
      status: 'Not connected',
      detail: 'Waiting for the device',
    })
    expect(path.verdict).toEqual({ tone: 'warn', text: 'Waiting for Ableton' })
    expect(path.needsAttention).toBe('ableton')
  })

  it('warns when Ableton is connected but no output shows the cue', () => {
    const path = describeSignalPath({
      ...base,
      engine: { phase: 'connected', addresses: [], port: 7417, clients: [] },
      output: { state: 'unavailable', sourceName: 'StageCue', message: '', receivers: 0 },
      screens: [{ ...base.screens[0]! }],
      transport: { playing: false, tempo: 96 },
    })
    expect(path.nodes.ableton).toMatchObject({ lamp: 'ready', status: 'Stopped' })
    expect(path.nodes.engine.detail).toBe('This computer only')
    expect(path.nodes.propresenter).toMatchObject({ lamp: 'off', status: 'Not set up' })
    expect(path.nodes.screens).toMatchObject({
      lamp: 'off',
      detail: 'Only this screen is connected',
    })
    expect(path.verdict.text).toBe('Ableton is connected, but nothing is showing the cue yet')
  })

  it('shows NDI as ready without a receiver', () => {
    const path = describeSignalPath({
      ...base,
      output: { state: 'sending', sourceName: 'StageCue', message: '', receivers: 0 },
    })
    expect(path.nodes.propresenter).toMatchObject({ lamp: 'ready', detail: 'No receiver yet' })
  })
})
