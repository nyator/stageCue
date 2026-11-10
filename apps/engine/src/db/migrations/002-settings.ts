import type { Migration } from './index.ts'

export const settingsTable: Migration = {
  version: 2,
  name: 'settings',
  sql: `
    -- Engine-wide preferences shared by every connected client, such as display colours.
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL CHECK (json_valid(value)),
      updated_at TEXT NOT NULL
    );
  `,
}
