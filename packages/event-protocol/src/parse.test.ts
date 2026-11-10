import { describe, expect, it } from 'vitest'
import { parseClientMessage, parseServerMessage } from './parse.ts'
import { PROTOCOL_VERSION } from './messages.ts'

const clientId = '0b8d6f3e-7c1a-4c5e-9f7b-2a1d3c4e5f60'

function hello(overrides: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
  return JSON.stringify({
    v: PROTOCOL_VERSION,
    type: 'hello',
    seq: 1,
    sentAt: 1_700_000_000_000,
    payload: { clientId, role: 'desktop', name: 'Booth', ...payload },
    ...overrides,
  })
}

describe('parseClientMessage', () => {
  it('accepts a valid hello', () => {
    const result = parseClientMessage(hello())
    expect(result).toEqual({
      ok: true,
      message: expect.objectContaining({ type: 'hello', seq: 1 }),
    })
  })

  it('trims the client name', () => {
    const result = parseClientMessage(hello({}, { name: '  Booth  ' }))
    expect(result.ok && result.message.type === 'hello' && result.message.payload.name).toBe(
      'Booth',
    )
  })

  it('rejects text that is not JSON', () => {
    expect(parseClientMessage('{nope')).toMatchObject({ ok: false, code: 'invalid_json' })
  })

  it('reports a protocol version mismatch specifically', () => {
    expect(parseClientMessage(hello({ v: 99 }))).toMatchObject({
      ok: false,
      code: 'unsupported_version',
    })
  })

  it.each([
    ['an unknown message type', hello({ type: 'launch_missiles' })],
    ['a negative sequence number', hello({ seq: -1 })],
    ['a fractional sequence number', hello({ seq: 1.5 })],
    ['a missing timestamp', hello({ sentAt: undefined })],
    ['an unknown top-level field', hello({ extra: true })],
    ['an unknown payload field', hello({}, { admin: true })],
    ['an invalid client id', hello({}, { clientId: 'not-a-uuid' })],
    ['an unknown role', hello({}, { role: 'superuser' })],
    ['an empty name', hello({}, { name: '   ' })],
    ['an overlong name', hello({}, { name: 'x'.repeat(81) })],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
  ])('rejects %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toMatchObject({ ok: false, code: 'invalid_message' })
  })
})

describe('request messages', () => {
  const request = (method: string) =>
    JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'request',
      seq: 2,
      sentAt: 1_700_000_000_000,
      payload: { requestId: 'r1', method, params: { anything: true } },
    })

  it('accepts known methods and leaves params for the method schema', () => {
    expect(parseClientMessage(request('devices.list'))).toMatchObject({
      ok: true,
      message: { payload: { method: 'devices.list', params: { anything: true } } },
    })
  })

  it('rejects unknown methods', () => {
    expect(parseClientMessage(request('songs.dropTable'))).toMatchObject({
      ok: false,
      code: 'invalid_message',
    })
  })
})

describe('DAW messages', () => {
  const envelope = (type: string, payload: unknown) =>
    JSON.stringify({ v: PROTOCOL_VERSION, type, seq: 3, sentAt: 1_700_000_000_000, payload })

  it('accepts markers and transport', () => {
    expect(
      parseClientMessage(
        envelope('daw.markers', { project: 'Sunday', markers: [{ name: 'Chorus', beat: 16 }] }),
      ).ok,
    ).toBe(true)
    expect(
      parseClientMessage(
        envelope('daw.transport', {
          playing: true,
          beat: 12.5,
          tempo: 72,
          timeSignature: { numerator: 3, denominator: 4 },
        }),
      ).ok,
    ).toBe(true)
  })

  it.each([
    [
      'a negative marker position',
      'daw.markers',
      { project: null, markers: [{ name: 'X', beat: -1 }] },
    ],
    [
      'an unknown marker field',
      'daw.markers',
      { project: null, markers: [{ name: 'X', beat: 1, colour: 2 }] },
    ],
    [
      'an impossible tempo',
      'daw.transport',
      { playing: true, beat: 0, tempo: 0, timeSignature: { numerator: 4, denominator: 4 } },
    ],
    [
      'an odd time signature',
      'daw.transport',
      { playing: true, beat: 0, tempo: 90, timeSignature: { numerator: 4, denominator: 3 } },
    ],
  ])('rejects %s', (_label, type, payload) => {
    expect(parseClientMessage(envelope(type, payload))).toMatchObject({
      ok: false,
      code: 'invalid_message',
    })
  })
})

describe('parseServerMessage', () => {
  it('ignores unknown fields from a newer engine', () => {
    const raw = JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'error',
      seq: 4,
      sentAt: 1_700_000_000_000,
      payload: { code: 'stale_message', message: 'old', refSeq: 2, hint: 'new field' },
    })
    const result = parseServerMessage(raw)
    expect(result.ok).toBe(true)
    expect(result.ok && result.message.payload).not.toHaveProperty('hint')
  })
})
