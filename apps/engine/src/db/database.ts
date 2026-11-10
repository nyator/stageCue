import { DatabaseSync } from 'node:sqlite'
import { migrations as defaultMigrations, type Migration } from './migrations/index.ts'

export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename)

  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')

  if (filename !== ':memory:') {
    // WAL lets the UI read while the engine writes performance events.
    db.exec('PRAGMA journal_mode = WAL')
  }

  return db
}

/**
 * Applies pending migrations in version order. Each migration runs in its own
 * transaction, so a failure leaves the database at the last good version.
 * Returns the resulting schema version.
 */
export function migrate(
  db: DatabaseSync,
  migrations: readonly Migration[] = defaultMigrations,
): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const latestKnown = sorted.at(-1)?.version ?? 0
  const current = getSchemaVersion(db)

  if (current > latestKnown) {
    throw new Error(
      `Database schema version ${current} is newer than this build supports (${latestKnown}). Update StageCue.`,
    )
  }

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  )

  for (const migration of sorted) {
    if (migration.version <= current) {
      continue
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(migration.sql)
      insert.run(migration.version, migration.name, new Date().toISOString())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${migration.version} (${migration.name}) failed.`, {
        cause: error,
      })
    }
  }

  return getSchemaVersion(db)
}

export function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
  return typeof row?.version === 'number' ? row.version : 0
}
