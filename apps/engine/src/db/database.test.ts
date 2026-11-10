import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSchemaVersion, migrate, openDatabase } from './database.ts'
import { recordDeviceSeen } from '../repositories/devices.ts'
import { migrations } from './migrations/index.ts'

const now = '2026-11-10T12:00:00.000Z'
let db: DatabaseSync

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

function tableNames(): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => String(row.name))
}

function seedSong(id: string): void {
  db.prepare('INSERT INTO songs (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    id,
    `Song ${id}`,
    now,
    now,
  )
}

function seedSection(id: string, songId: string): void {
  db.prepare(
    `INSERT INTO song_sections (id, song_id, name, section_type, length_bars, position, created_at, updated_at)
     VALUES (?, ?, 'Chorus', 'chorus', 8, 0, ?, ?)`,
  ).run(id, songId, now, now)
}

function seedArrangement(id: string, songId: string): void {
  db.prepare(
    'INSERT INTO arrangements (id, song_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, songId, 'Sunday', now, now)
}

function insertArrangementSection(
  arrangementId: string,
  sectionId: string,
  bars: { start: number; end: number; repeat: number },
): void {
  db.prepare(
    `INSERT INTO arrangement_sections
       (id, arrangement_id, song_section_id, position, start_bar, end_bar, repeat_count, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), arrangementId, sectionId, bars.start, bars.end, bars.repeat, now, now)
}

describe('migrate', () => {
  it('creates the full schema on an empty database', () => {
    expect(migrate(db)).toBe(migrations.at(-1)?.version)
    expect(tableNames()).toEqual(
      expect.arrayContaining([
        'songs',
        'song_sections',
        'arrangements',
        'arrangement_sections',
        'setlists',
        'performances',
        'performance_sections',
        'devices',
        'daw_sessions',
        'performance_events',
        'schema_migrations',
      ]),
    )
  })

  it('is a no-op when already up to date', () => {
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n).toBe(
      migrations.length,
    )
  })

  it('refuses a database created by a newer build', () => {
    migrate(db)
    db.prepare("INSERT INTO schema_migrations VALUES (999, 'future', ?)").run(now)
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

describe('initial schema constraints', () => {
  beforeEach(() => {
    migrate(db)
    seedSong('song-a')
    seedSong('song-b')
    seedSection('section-a', 'song-a')
    seedSection('section-b', 'song-b')
    seedArrangement('arrangement-a', 'song-a')
  })

  it('enforces foreign keys', () => {
    expect(() => seedSection('orphan', 'missing-song')).toThrow(/FOREIGN KEY/)
  })

  it('allows the same song to have several arrangements', () => {
    seedArrangement('arrangement-a2', 'song-a')
    const count = db.prepare("SELECT COUNT(*) AS n FROM arrangements WHERE song_id = 'song-a'")
    expect(count.get()?.n).toBe(2)
  })

  it('rejects an arrangement section taken from a different song', () => {
    expect(() =>
      insertArrangementSection('arrangement-a', 'section-b', { start: 1, end: 8, repeat: 1 }),
    ).toThrow(/must belong to the arrangement's song/)
  })

  it('requires repeated passes to have equal length', () => {
    expect(() =>
      insertArrangementSection('arrangement-a', 'section-a', { start: 1, end: 16, repeat: 2 }),
    ).not.toThrow()
    expect(() =>
      insertArrangementSection('arrangement-a', 'section-a', { start: 17, end: 31, repeat: 2 }),
    ).toThrow(/CHECK/)
  })

  it('rejects unknown section types', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO song_sections (id, song_id, name, section_type, length_bars, position, created_at, updated_at)
           VALUES ('x', 'song-a', 'Solo', 'guitar_solo', 8, 1, ?, ?)`,
        )
        .run(now, now),
    ).toThrow(/CHECK/)
  })

  it('cascades song deletion to sections and arrangements', () => {
    db.prepare("DELETE FROM songs WHERE id = 'song-a'").run()
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM song_sections WHERE song_id = 'song-a'").get()?.n,
    ).toBe(0)
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM arrangements WHERE song_id = 'song-a'").get()?.n,
    ).toBe(0)
  })
})

describe('recordDeviceSeen', () => {
  it('creates a device and then updates it without changing first_seen_at', () => {
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

    expect(db.prepare('SELECT * FROM devices WHERE id = ?').get(id)).toMatchObject({
      name: 'FOH',
      last_address: '10.0.0.5',
      first_seen_at: first.toISOString(),
      last_seen_at: second.toISOString(),
    })
  })
})
