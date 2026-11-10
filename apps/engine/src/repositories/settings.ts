import type { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_DISPLAY_SETTINGS,
  displaySettingsSchema,
  type DisplaySettings,
} from '@stagecue/arrangement'
import { nowIso } from './support.ts'

const DISPLAY_KEY = 'display'

/** Stored values are merged over defaults, so settings added later get sensible values. */
export function getDisplaySettings(db: DatabaseSync): DisplaySettings {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(DISPLAY_KEY)
  if (!row) {
    return DEFAULT_DISPLAY_SETTINGS
  }

  const parsed = displaySettingsSchema.safeParse({
    ...DEFAULT_DISPLAY_SETTINGS,
    ...(JSON.parse(String(row.value)) as object),
  })
  return parsed.success ? parsed.data : DEFAULT_DISPLAY_SETTINGS
}

export function saveDisplaySettings(db: DatabaseSync, settings: DisplaySettings): DisplaySettings {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(DISPLAY_KEY, JSON.stringify(settings), nowIso())
  return getDisplaySettings(db)
}
