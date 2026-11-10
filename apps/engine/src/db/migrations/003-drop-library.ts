import type { Migration } from './index.ts'

/*
 * StageCue now reads the arrangement from DAW markers, so it no longer keeps
 * its own song library, arrangements, or setlists. Children are dropped first.
 */
export const dropLibrary: Migration = {
  version: 3,
  name: 'drop library tables',
  sql: `
    DROP TABLE IF EXISTS performance_events;
    DROP TABLE IF EXISTS daw_sessions;
    DROP TABLE IF EXISTS performance_sections;
    DROP TABLE IF EXISTS performances;
    DROP TABLE IF EXISTS setlists;
    DROP TABLE IF EXISTS arrangement_sections;
    DROP TABLE IF EXISTS arrangements;
    DROP TABLE IF EXISTS song_sections;
    DROP TABLE IF EXISTS songs;
  `,
}
