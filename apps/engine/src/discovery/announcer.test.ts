import { createSocket } from 'node:dgram'
import type { AddressInfo } from 'node:net'
import { parseAnnouncement, type Announcement } from '@stagecue/event-protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { createLogger } from '../logger.ts'
import { announcementTargets, startAnnouncer, type Announcer } from './announcer.ts'

describe('startAnnouncer', () => {
  let announcer: Announcer | undefined
  const listener = createSocket('udp4')

  afterEach(async () => {
    await announcer?.close()
    announcer = undefined
  })

  it('sends announcements that the device can read', async () => {
    await new Promise<void>((resolve) => listener.bind(0, '127.0.0.1', resolve))
    const { port } = listener.address() as AddressInfo
    const received = new Promise<{ announcement: Announcement | null; from: string }>((resolve) => {
      listener.once('message', (data, rinfo) =>
        resolve({ announcement: parseAnnouncement(data), from: rinfo.address }),
      )
    })

    announcer = startAnnouncer({
      host: '0.0.0.0',
      port: 7417,
      instanceId: 'test-instance',
      logger: createLogger('error'),
      targets: () => ['127.0.0.1'],
      discoveryPort: port,
      intervalMs: 50,
    })

    const { announcement, from } = await received
    expect(from).toBe('127.0.0.1')
    expect(announcement).toMatchObject({ app: 'stagecue', v: 1, port: 7417, id: 'test-instance' })
    listener.close()
  })
})

describe('announcementTargets', () => {
  it('stays on this computer when the engine listens on loopback only', () => {
    expect(announcementTargets('127.0.0.1')).toEqual(['127.0.0.1'])
  })

  it('always includes loopback when listening everywhere', () => {
    expect(announcementTargets('0.0.0.0')).toContain('127.0.0.1')
  })
})
