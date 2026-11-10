import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { layoutEntries, type Arrangement } from '@stagecue/arrangement'
import type { ParsedMethodParams } from '@stagecue/event-protocol'
import { requireSongRow, toArrangement, toEntry, touchSong } from './songs.ts'
import { EngineError, nowIso, text, transaction, type Row } from './support.ts'

type ArrangementData = ParsedMethodParams<'arrangements.save'>['arrangement']

function requireArrangementRow(db: DatabaseSync, id: string): Row {
  const row = db.prepare('SELECT * FROM arrangements WHERE id = ?').get(id)
  if (!row) {
    throw new EngineError('not_found', 'That arrangement no longer exists.')
  }
  return row
}

export function getArrangement(db: DatabaseSync, id: string): Arrangement {
  const row = requireArrangementRow(db, id)
  const entries = db
    .prepare('SELECT * FROM arrangement_sections WHERE arrangement_id = ? ORDER BY position')
    .all(id)
    .map(toEntry)
  return toArrangement(row, entries)
}

interface PlacedEntry {
  songSectionId: string
  startBar: number
  endBar: number
  repeatCount: number
  vocalParts: string[] | null
  instructions: string | null
  notes: string | null
}

function writeEntries(db: DatabaseSync, arrangementId: string, entries: PlacedEntry[]): void {
  db.prepare('DELETE FROM arrangement_sections WHERE arrangement_id = ?').run(arrangementId)
  const insert = db.prepare(
    `INSERT INTO arrangement_sections (id, arrangement_id, song_section_id, position, start_bar,
       end_bar, repeat_count, vocal_parts, instructions, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = nowIso()
  entries.forEach((entry, position) => {
    insert.run(
      randomUUID(),
      arrangementId,
      entry.songSectionId,
      position,
      entry.startBar,
      entry.endBar,
      entry.repeatCount,
      entry.vocalParts === null ? null : JSON.stringify(entry.vocalParts),
      entry.instructions,
      entry.notes,
      now,
      now,
    )
  })
}

export function createArrangement(
  db: DatabaseSync,
  params: ParsedMethodParams<'arrangements.create'>,
): Arrangement {
  return transaction(db, () => {
    requireSongRow(db, params.songId)

    const source = params.copyFromId ? getArrangement(db, params.copyFromId) : null
    if (source && source.songId !== params.songId) {
      throw new EngineError('invalid_params', 'You can only copy an arrangement of the same song.')
    }

    let entries: PlacedEntry[]
    if (source) {
      entries = source.entries
    } else {
      // Start with every section once, in song order.
      const sections = db
        .prepare('SELECT id, length_bars FROM song_sections WHERE song_id = ? ORDER BY position')
        .all(params.songId)
        .map((row) => ({
          songSectionId: text(row.id),
          barsPerPass: Number(row.length_bars),
          repeatCount: 1,
          vocalParts: null,
          instructions: null,
          notes: null,
        }))
      entries = layoutEntries(1, sections)
    }

    const id = randomUUID()
    const now = nowIso()
    db.prepare(
      `INSERT INTO arrangements (id, song_id, name, tempo_bpm, song_key, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      id,
      params.songId,
      params.name,
      source?.tempoBpm ?? null,
      source?.songKey ?? null,
      now,
      now,
    )
    writeEntries(db, id, entries)
    touchSong(db, params.songId)
    return getArrangement(db, id)
  })
}

export function saveArrangement(db: DatabaseSync, id: string, data: ArrangementData): Arrangement {
  return transaction(db, () => {
    const row = requireArrangementRow(db, id)
    const songId = text(row.song_id)

    const validSections = new Set(
      db
        .prepare('SELECT id FROM song_sections WHERE song_id = ?')
        .all(songId)
        .map((section) => text(section.id)),
    )
    if (data.entries.some((entry) => !validSections.has(entry.songSectionId))) {
      throw new EngineError(
        'invalid_params',
        'The arrangement refers to a section that is not part of this song.',
      )
    }

    db.prepare(
      'UPDATE arrangements SET name = ?, tempo_bpm = ?, song_key = ?, notes = ?, updated_at = ? WHERE id = ?',
    ).run(data.name, data.tempoBpm, data.songKey, data.notes, nowIso(), id)
    writeEntries(db, id, layoutEntries(data.startBar, data.entries))
    touchSong(db, songId)
    return getArrangement(db, id)
  })
}

export function deleteArrangement(db: DatabaseSync, id: string): null {
  return transaction(db, () => {
    const row = requireArrangementRow(db, id)
    db.prepare('DELETE FROM arrangements WHERE id = ?').run(id)
    touchSong(db, text(row.song_id))
    return null
  })
}
