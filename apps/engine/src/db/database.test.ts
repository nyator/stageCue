import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_DISPLAY_SETTINGS } from '@stagecue/arrangement'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listDevices, recordDeviceSeen } from '../repositories/devices.ts'
import { getDisplaySettings, saveDisplaySettings } from '../repositories/settings.ts'
import { getSchemaVersion, migrate, openDatabase } from './database.ts'
import { migrations } from './migrations/index.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

function tableNames(): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name))
}

describe('migrate', () => {
  it('ends with only the tables StageCue still uses', () => {
    expect(migrate(db)).toBe(migrations.at(-1)?.version)
    expect(tableNames()).toEqual(['devices', 'schema_migrations', 'settings'])
  })

  it('is a no-op when already up to date', () => {
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n).toBe(
      migrations.length,
    )
  })

  it('upgrades a database that still has the library tables, keeping devices', () => {
    migrate(db, migrations.slice(0, 2))
    recordDeviceSeen(db, {
      id: crypto.randomUUID(),
      name: 'Booth',
      role: 'desktop',
      address: null,
      seenAt: new Date(),
    })
    expect(tableNames()).toContain('songs')

    migrate(db)
    expect(tableNames()).not.toContain('songs')
    expect(listDevices(db)).toHaveLength(1)
  })

  it('refuses a database created by a newer build', () => {
    migrate(db)
    db.prepare("INSERT INTO schema_migrations VALUES (999, 'future', ?)").run(
      new Date().toISOString(),
    )
    expect(() => migrate(db)).toThrow(/newer than this build supports/)
  })

  it('rolls back a failed migration and keeps the last good version', () => {
    const broken = [
      { version: 1, name: 'ok', sql: 'CREATE TABLE a (id INTEGER)' },
      { version: 2, name: 'broken', sql: 'CREATE TABLE b (id INTEGER); NOT VALID SQL' },
    ]
    expect(() => migrate(db, broken)).toThrow(/Migration 2 \(broken\) failed/)
    expect(getSchemaVersion(db)).toBe(1)
    expect(tableNames()).not.toContain('b')
  })
})

describe('devices', () => {
  it('are created and then updated without changing first_seen_at', () => {
    migrate(db)
    const id = crypto.randomUUID()
    const first = new Date('2026-11-10T10:00:00.000Z')
    const second = new Date('2026-11-10T11:00:00.000Z')

    recordDeviceSeen(db, {
      id,
      name: 'Booth',
      role: 'desktop',
      address: '127.0.0.1',
      seenAt: first,
    })
    recordDeviceSeen(db, { id, name: 'FOH', role: 'desktop', address: '10.0.0.5', seenAt: second })

    expect(listDevices(db)).toEqual([
      {
        id,
        name: 'FOH',
        role: 'desktop',
        lastAddress: '10.0.0.5',
        firstSeenAt: first.toISOString(),
        lastSeenAt: second.toISOString(),
      },
    ])
  })
})

describe('display settings', () => {
  beforeEach(() => {
    migrate(db)
  })

  it('default until saved, then round-trip', () => {
    expect(getDisplaySettings(db)).toEqual(DEFAULT_DISPLAY_SETTINGS)
    const custom = { ...DEFAULT_DISPLAY_SETTINGS, position: 'bottom' as const, accent: '#ffcc00' }
    expect(saveDisplaySettings(db, custom)).toEqual(custom)
    expect(getDisplaySettings(db)).toEqual(custom)
  })

  it('fill in settings an older version did not store, and drop retired ones', () => {
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('display', ?, ?)").run(
      JSON.stringify({ accent: '#123456', showVocalParts: false }),
      new Date().toISOString(),
    )
    expect(getDisplaySettings(db)).toEqual({ ...DEFAULT_DISPLAY_SETTINGS, accent: '#123456' })
  })
})
