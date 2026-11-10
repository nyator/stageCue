import type { DatabaseSync } from 'node:sqlite'
import type { ClientRole, Device } from '@stagecue/event-protocol'
import { text, textOrNull } from './support.ts'

export interface DeviceSighting {
  id: string
  name: string
  role: ClientRole
  address: string | null
  seenAt: Date
}

/** Records that a device connected, creating it on first sight. */
export function recordDeviceSeen(db: DatabaseSync, sighting: DeviceSighting): void {
  const seenAt = sighting.seenAt.toISOString()

  db.prepare(
    `INSERT INTO devices (id, name, role, last_address, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       role = excluded.role,
       last_address = excluded.last_address,
       last_seen_at = excluded.last_seen_at`,
  ).run(sighting.id, sighting.name, sighting.role, sighting.address, seenAt, seenAt)
}

export function listDevices(db: DatabaseSync): Device[] {
  return db
    .prepare('SELECT * FROM devices ORDER BY last_seen_at DESC')
    .all()
    .map((row) => ({
      id: text(row.id),
      name: text(row.name),
      role: text(row.role) as Device['role'],
      lastAddress: textOrNull(row.last_address),
      firstSeenAt: text(row.first_seen_at),
      lastSeenAt: text(row.last_seen_at),
    }))
}
