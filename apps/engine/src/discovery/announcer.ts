import { createSocket, type Socket } from 'node:dgram'
import { hostname, networkInterfaces } from 'node:os'
import {
  ANNOUNCE_INTERVAL_MS,
  broadcastAddress,
  DISCOVERY_PORT,
  PROTOCOL_VERSION,
  type Announcement,
} from '@stagecue/event-protocol'
import type { Logger } from '../logger.ts'

export interface AnnouncerOptions {
  /** The address the engine listens on. 127.0.0.1 keeps announcements on this computer. */
  host: string
  port: number
  instanceId: string
  logger: Logger
  /** Where to send; defaults to every local network plus loopback. For tests. */
  targets?: () => string[]
  discoveryPort?: number
  intervalMs?: number
}

export interface Announcer {
  close(): Promise<void>
}

/** Where announcements go: loopback, plus each local IPv4 network's broadcast address. */
export function announcementTargets(host: string): string[] {
  if (host !== '0.0.0.0' && host !== '::') return ['127.0.0.1']
  const targets = new Set(['127.0.0.1'])
  for (const info of Object.values(networkInterfaces()).flat()) {
    if (!info || info.family !== 'IPv4' || info.internal) continue
    const broadcast = broadcastAddress(info.address, info.netmask)
    if (broadcast) targets.add(broadcast)
  }
  return [...targets]
}

/**
 * Tells Ableton devices on the local network where StageCue is (docs/protocol.md,
 * "Finding StageCue"). Interfaces are read again on every send, so a Wi-Fi network
 * that comes and goes is picked up without a restart. Failures are logged once and
 * never stop the engine: a typed address still works without announcements.
 */
export function startAnnouncer(options: AnnouncerOptions): Announcer {
  const announcement: Announcement = {
    app: 'stagecue',
    v: PROTOCOL_VERSION,
    port: options.port,
    id: options.instanceId,
    name: hostname()
      .replace(/\.local$/, '')
      .slice(0, 80),
  }
  const payload = Buffer.from(JSON.stringify(announcement))
  const targets = options.targets ?? (() => announcementTargets(options.host))
  const port = options.discoveryPort ?? DISCOVERY_PORT
  const failed = new Set<string>()

  const socket: Socket = createSocket('udp4')
  let ready = false
  socket.on('error', (error) =>
    options.logger.warn('Announcements stopped', { error: error.message }),
  )
  socket.bind(0, () => {
    socket.setBroadcast(true)
    ready = true
    send()
  })

  function send(): void {
    if (!ready) return
    for (const target of targets()) {
      socket.send(payload, port, target, (error) => {
        if (error && !failed.has(target)) {
          failed.add(target)
          options.logger.debug('Could not announce on a network', { target, error: error.message })
        } else if (!error) {
          failed.delete(target)
        }
      })
    }
  }

  const timer = setInterval(send, options.intervalMs ?? ANNOUNCE_INTERVAL_MS)
  timer.unref()
  options.logger.info('Announcing StageCue on the local network', { udpPort: port })

  return {
    close: () =>
      new Promise((resolve) => {
        clearInterval(timer)
        ready = false
        socket.close(() => resolve())
      }),
  }
}
