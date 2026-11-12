import { describe, expect, it } from 'vitest'
import { broadcastAddress, isLocalAddress, parseAnnouncement } from './discovery.ts'

describe('isLocalAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.20.10.2', // iPhone hotspot
    '172.31.255.254',
    '192.168.1.20',
    '169.254.3.4',
  ])('accepts %s', (address) => expect(isLocalAddress(address)).toBe(true))

  it.each([
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '100.64.0.1',
    '192.169.0.1',
    '::1',
    'fe80::1',
    '::ffff:192.168.1.20',
    '192.168.1',
    '192.168.1.256',
    '192.168.01.x',
    '',
  ])('refuses %s', (address) => expect(isLocalAddress(address)).toBe(false))
})

describe('broadcastAddress', () => {
  it('fills the host bits', () => {
    expect(broadcastAddress('192.168.1.20', '255.255.255.0')).toBe('192.168.1.255')
    expect(broadcastAddress('172.20.10.2', '255.255.255.240')).toBe('172.20.10.15')
    expect(broadcastAddress('10.1.2.3', '255.0.0.0')).toBe('10.255.255.255')
  })

  it('returns null for bad input', () => {
    expect(broadcastAddress('192.168.1', '255.255.255.0')).toBeNull()
    expect(broadcastAddress('192.168.1.20', 'nope')).toBeNull()
  })
})

describe('parseAnnouncement', () => {
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
  const valid = { app: 'stagecue', v: 1, port: 7417, id: 'abc', name: 'Media Mac' }

  it('reads a valid announcement', () => {
    expect(parseAnnouncement(encode(valid))).toEqual(valid)
  })

  it('ignores other apps, other versions, bad ports, junk, and oversized datagrams', () => {
    expect(parseAnnouncement(encode({ ...valid, app: 'other' }))).toBeNull()
    expect(parseAnnouncement(encode({ ...valid, v: 2 }))).toBeNull()
    expect(parseAnnouncement(encode({ ...valid, port: 0 }))).toBeNull()
    expect(parseAnnouncement(new TextEncoder().encode('not json'))).toBeNull()
    expect(parseAnnouncement(encode({ ...valid, name: 'x'.repeat(600) }))).toBeNull()
  })
})
