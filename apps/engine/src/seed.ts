import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.ts'
import { migrate, openDatabase } from './db/database.ts'
import { loadSampleLibrary } from './sample-library.ts'

/*
 * Adds the sample library to an empty database. It refuses to touch a library
 * that already has songs, so it can never mix sample data into real data.
 */
const config = loadConfig(process.env)
mkdirSync(config.dataDir, { recursive: true })
const databasePath = path.join(config.dataDir, 'stagecue.db')
const db = openDatabase(databasePath)

try {
  migrate(db)
  const existing = Number(db.prepare('SELECT COUNT(*) AS n FROM songs').get()?.n ?? 0)
  if (existing > 0) {
    console.log(`${databasePath} already has ${existing} songs. Sample data was not added.`)
  } else {
    const added = loadSampleLibrary(db)
    console.log(`Added ${added.songs} songs and ${added.setlists} setlists to ${databasePath}.`)
  }
} finally {
  db.close()
}
