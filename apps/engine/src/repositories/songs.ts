import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  Arrangement,
  ArrangementEntry,
  Song,
  SongDetail,
  SongSection,
  SongSummary,
  TimeSignature,
} from '@stagecue/arrangement'
import type { ParsedMethodParams } from '@stagecue/event-protocol'
import {
  EngineError,
  jsonArray,
  jsonArrayOrNull,
  nowIso,
  numberOrNull,
  quoted,
  text,
  textOrNull,
  transaction,
  type Row,
} from './support.ts'

type SongData = ParsedMethodParams<'songs.create'>
type SectionData = ParsedMethodParams<'sections.save'>['sections'][number]

function toSong(row: Row): Song {
  return {
    id: text(row.id),
    title: text(row.title),
    artist: textOrNull(row.artist),
    defaultKey: textOrNull(row.default_key),
    tempoBpm: numberOrNull(row.default_tempo_bpm),
    timeSignature: {
      numerator: Number(row.time_signature_numerator),
      denominator: Number(row.time_signature_denominator) as TimeSignature['denominator'],
    },
    notes: textOrNull(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }
}

export function toSection(row: Row): SongSection {
  return {
    id: text(row.id),
    songId: text(row.song_id),
    name: text(row.name),
    type: text(row.section_type) as SongSection['type'],
    lengthBars: Number(row.length_bars),
    vocalParts: jsonArray(row.vocal_parts),
    instructions: textOrNull(row.instructions),
    notes: textOrNull(row.notes),
    position: Number(row.position),
  }
}

export function toEntry(row: Row): ArrangementEntry {
  return {
    id: text(row.id),
    songSectionId: text(row.song_section_id),
    position: Number(row.position),
    startBar: Number(row.start_bar),
    endBar: Number(row.end_bar),
    repeatCount: Number(row.repeat_count),
    vocalParts: jsonArrayOrNull(row.vocal_parts),
    instructions: textOrNull(row.instructions),
    notes: textOrNull(row.notes),
  }
}

export function toArrangement(row: Row, entries: ArrangementEntry[]): Arrangement {
  return {
    id: text(row.id),
    songId: text(row.song_id),
    name: text(row.name),
    tempoBpm: numberOrNull(row.tempo_bpm),
    songKey: textOrNull(row.song_key),
    notes: textOrNull(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    entries,
  }
}

export function requireSongRow(db: DatabaseSync, id: string): Row {
  const row = db.prepare('SELECT * FROM songs WHERE id = ?').get(id)
  if (!row) {
    throw new EngineError('not_found', 'That song no longer exists.')
  }
  return row
}

export function touchSong(db: DatabaseSync, id: string): void {
  db.prepare('UPDATE songs SET updated_at = ? WHERE id = ?').run(nowIso(), id)
}

export function listSongs(db: DatabaseSync): SongSummary[] {
  return db
    .prepare(
      `SELECT s.*,
         (SELECT COUNT(*) FROM song_sections WHERE song_id = s.id) AS section_count,
         (SELECT COUNT(*) FROM arrangements WHERE song_id = s.id) AS arrangement_count
       FROM songs s
       ORDER BY s.title COLLATE NOCASE`,
    )
    .all()
    .map((row) => ({
      ...toSong(row),
      sectionCount: Number(row.section_count),
      arrangementCount: Number(row.arrangement_count),
    }))
}

export function getSong(db: DatabaseSync, id: string): SongDetail {
  const song = toSong(requireSongRow(db, id))

  const sections = db
    .prepare('SELECT * FROM song_sections WHERE song_id = ? ORDER BY position')
    .all(id)
    .map(toSection)

  const entriesByArrangement = new Map<string, ArrangementEntry[]>()
  const entryRows = db
    .prepare(
      `SELECT e.* FROM arrangement_sections e
       JOIN arrangements a ON a.id = e.arrangement_id
       WHERE a.song_id = ?
       ORDER BY e.position`,
    )
    .all(id)
  for (const row of entryRows) {
    const arrangementId = text(row.arrangement_id)
    const list = entriesByArrangement.get(arrangementId) ?? []
    list.push(toEntry(row))
    entriesByArrangement.set(arrangementId, list)
  }

  const arrangements = db
    .prepare('SELECT * FROM arrangements WHERE song_id = ? ORDER BY created_at, name')
    .all(id)
    .map((row) => toArrangement(row, entriesByArrangement.get(text(row.id)) ?? []))

  return { ...song, sections, arrangements }
}

export function createSong(db: DatabaseSync, data: SongData): SongDetail {
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    `INSERT INTO songs (id, title, artist, default_key, default_tempo_bpm,
       time_signature_numerator, time_signature_denominator, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    data.title,
    data.artist,
    data.defaultKey,
    data.tempoBpm,
    data.timeSignature.numerator,
    data.timeSignature.denominator,
    data.notes,
    now,
    now,
  )
  return getSong(db, id)
}

export function updateSong(db: DatabaseSync, id: string, data: SongData): SongDetail {
  requireSongRow(db, id)
  db.prepare(
    `UPDATE songs SET title = ?, artist = ?, default_key = ?, default_tempo_bpm = ?,
       time_signature_numerator = ?, time_signature_denominator = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    data.title,
    data.artist,
    data.defaultKey,
    data.tempoBpm,
    data.timeSignature.numerator,
    data.timeSignature.denominator,
    data.notes,
    nowIso(),
    id,
  )
  return getSong(db, id)
}

export function deleteSong(db: DatabaseSync, id: string): null {
  const song = requireSongRow(db, id)
  const used = db.prepare('SELECT COUNT(*) AS n FROM performances WHERE song_id = ?').get(id)
  const count = Number(used?.n ?? 0)
  if (count > 0) {
    throw new EngineError(
      'conflict',
      `${quoted(text(song.title))} is in ${count === 1 ? 'a setlist' : `${count} setlists`}. Remove it from ${count === 1 ? 'that setlist' : 'those setlists'} first.`,
    )
  }
  db.prepare('DELETE FROM songs WHERE id = ?').run(id)
  return null
}

/** Replaces the song's sections with the given ordered list. */
export function saveSections(
  db: DatabaseSync,
  songId: string,
  sections: SectionData[],
): SongDetail {
  return transaction(db, () => {
    requireSongRow(db, songId)
    const existing = new Map(
      db
        .prepare('SELECT id, name FROM song_sections WHERE song_id = ?')
        .all(songId)
        .map((row) => [text(row.id), text(row.name)]),
    )

    const keptIds = new Set<string>()
    for (const section of sections) {
      if (section.id === null) continue
      if (!existing.has(section.id)) {
        throw new EngineError('invalid_params', 'A section does not belong to this song.')
      }
      keptIds.add(section.id)
    }

    const usage = db.prepare(
      `SELECT a.name FROM arrangement_sections e
       JOIN arrangements a ON a.id = e.arrangement_id
       WHERE e.song_section_id = ? LIMIT 1`,
    )
    for (const [id, name] of existing) {
      if (keptIds.has(id)) continue
      const used = usage.get(id)
      if (used) {
        throw new EngineError(
          'conflict',
          `${quoted(name)} is used in the ${quoted(text(used.name))} arrangement. Remove it there before deleting it.`,
        )
      }
      db.prepare('DELETE FROM song_sections WHERE id = ?').run(id)
    }

    const now = nowIso()
    const update = db.prepare(
      `UPDATE song_sections SET name = ?, section_type = ?, length_bars = ?, vocal_parts = ?,
         instructions = ?, notes = ?, position = ?, updated_at = ?
       WHERE id = ?`,
    )
    const insert = db.prepare(
      `INSERT INTO song_sections (id, song_id, name, section_type, length_bars, vocal_parts,
         instructions, notes, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    sections.forEach((section, position) => {
      const vocalParts = JSON.stringify(section.vocalParts)
      if (section.id) {
        update.run(
          section.name,
          section.type,
          section.lengthBars,
          vocalParts,
          section.instructions,
          section.notes,
          position,
          now,
          section.id,
        )
      } else {
        insert.run(
          randomUUID(),
          songId,
          section.name,
          section.type,
          section.lengthBars,
          vocalParts,
          section.instructions,
          section.notes,
          position,
          now,
          now,
        )
      }
    })

    touchSong(db, songId)
    return getSong(db, songId)
  })
}
