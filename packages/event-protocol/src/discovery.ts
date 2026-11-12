import { z } from 'zod'
import { PROTOCOL_VERSION } from './messages.ts'

/*
 * Finding StageCue on the local network without typing an address.
 *
 * The engine sends a small JSON datagram to UDP port DISCOVERY_PORT every
 * ANNOUNCE_INTERVAL_MS, on every local network (directed broadcast) and on this
 * computer (loopback). The Ableton device listens and connects to the address the
 * datagram came from, never to an address written inside it, and only when that
 * address is local (isLocalAddress).
 *
 * The device (integrations/ableton/device/stagecue-bridge.js) is plain CommonJS
 * and repeats these rules by hand: keep both in step (see docs/protocol.md).
 */

export const DISCOVERY_PORT = 7418
export const ANNOUNCE_INTERVAL_MS = 1_000

export const announcementSchema = z.object({
  app: z.literal('stagecue'),
  v: z.literal(PROTOCOL_VERSION),
  /** The engine's WebSocket port on the address the datagram came from. */
  port: z.int().min(1).max(65_535),
  /** Changes every time the engine starts. */
  id: z.string().min(1).max(64),
  /** The computer's name, shown on the device. */
  name: z.string().max(80),
})
export type Announcement = z.infer<typeof announcementSchema>

/** Datagrams larger than this are ignored without parsing. */
export const MAX_ANNOUNCEMENT_BYTES = 512

/**
 * True for IPv4 addresses that can only be on this computer or this local network:
 * loopback, the private ranges, and link-local. Everything else is refused, so an
 * announcement can never send the device to an address outside the building.
 */
export function isLocalAddress(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN))
  if (octets.some((n) => !(n >= 0 && n <= 255))) return false
  const [a, b] = octets as [number, number, number, number]
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

/** The directed broadcast address of an IPv4 network, e.g. 192.168.1.20/24 → 192.168.1.255. */
export function broadcastAddress(address: string, netmask: string): string | null {
  const ip = toNumber(address)
  const mask = toNumber(netmask)
  if (ip === null || mask === null) return null
  const broadcast = (ip | ~mask) >>> 0
  return [24, 16, 8, 0].map((shift) => (broadcast >>> shift) & 255).join('.')
}

function toNumber(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null
    value = value * 256 + Number(part)
  }
  return value
}

/** Parses a datagram; null for anything that is not a StageCue announcement this version understands. */
export function parseAnnouncement(data: Uint8Array): Announcement | null {
  if (data.byteLength > MAX_ANNOUNCEMENT_BYTES) return null
  try {
    const result = announcementSchema.safeParse(JSON.parse(new TextDecoder().decode(data)))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
