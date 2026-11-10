import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  Performance,
  PerformanceSection,
  Setlist,
  SetlistSummary,
} from '@stagecue/arrangement'
import type { ParsedMethodParams } from '@stagecue/event-protocol'
import {
  EngineError,
  jsonArray,
  nowIso,
  quoted,
  text,
  textOrNull,
  transaction,
  type Row,
} from './support.ts'

type SetlistData = ParsedMethodParams<'setlists.create'>

function toSummary(row: Row): SetlistSummary {
  return {
    id: text(row.id),
    name: text(row.name),
    serviceDate: textOrNull(row.service_date),
    notes: textOrNull(row.notes),
    performanceCount: Number(row.performance_count ?? 0),
    updatedAt: text(row.updated_at),
  }
}

function toPerformanceSection(row: Row): PerformanceSection {
  return {
    id: text(row.id),
    songSectionId: textOrNull(row.song_section_id),
    position: Number(row.position),
    name: text(row.name),
    type: text(row.section_type) as PerformanceSection['type'],
    startBar: Number(row.start_bar),
    endBar: Number(row.end_bar),
    repeatCount: Number(row.repeat_count),
    vocalParts: jsonArray(row.vocal_parts),
    instructions: textOrNull(row.instructions),
    notes: textOrNull(row.notes),
  }
}

function requireSetlistRow(db: DatabaseSync, id: string): Row {
  const row = db.prepare('SELECT * FROM setlists WHERE id = ?').get(id)
  if (!row) {
    throw new EngineError('not_found', 'That setlist no longer exists.')
  }
  return row
}

function requirePerformanceRow(db: DatabaseSync, id: string): Row {
  const row = db.prepare('SELECT * FROM performances WHERE id = ?').get(id)
  if (!row) {
    throw new EngineError('not_found', 'That song is no longer in the setlist.')
  }
  return row
}

/** Newest service first; undated setlists last. */
export function listSetlists(db: DatabaseSync): SetlistSummary[] {
  return db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM performances WHERE setlist_id = s.id) AS performance_count
       FROM setlists s
       ORDER BY s.service_date IS NULL, s.service_date DESC, s.name COLLATE NOCASE`,
    )
    .all()
    .map(toSummary)
}

export function getSetlist(db: DatabaseSync, id: string): Setlist {
  const row = requireSetlistRow(db, id)

  const sectionsByPerformance = new Map<string, PerformanceSection[]>()
  const sectionRows = db
    .prepare(
      `SELECT ps.* FROM performance_sections ps
       JOIN performances p ON p.id = ps.performance_id
       WHERE p.setlist_id = ?
       ORDER BY ps.position`,
    )
    .all(id)
  for (const sectionRow of sectionRows) {
    const performanceId = text(sectionRow.performance_id)
    const list = sectionsByPerformance.get(performanceId) ?? []
    list.push(toPerformanceSection(sectionRow))
    sectionsByPerformance.set(performanceId, list)
  }

  const performances: Performance[] = db
    .prepare(
      `SELECT p.*, s.title AS song_title, COALESCE(a.song_key, s.default_key) AS song_key,
         COALESCE(a.tempo_bpm, s.default_tempo_bpm) AS tempo_bpm,
         s.time_signature_numerator, s.time_signature_denominator,
         a.name AS arrangement_name
       FROM performances p
       JOIN songs s ON s.id = p.song_id
       LEFT JOIN arrangements a ON a.id = p.arrangement_id
       WHERE p.setlist_id = ?
       ORDER BY p.position`,
    )
    .all(id)
    .map((performance) => ({
      id: text(performance.id),
      setlistId: textOrNull(performance.setlist_id),
      position: performance.position === null ? null : Number(performance.position),
      songId: text(performance.song_id),
      songTitle: text(performance.song_title),
      songKey: textOrNull(performance.song_key),
      tempoBpm: performance.tempo_bpm === null ? null : Number(performance.tempo_bpm),
      timeSignature: {
        numerator: Number(performance.time_signature_numerator),
        denominator: Number(
          performance.time_signature_denominator,
        ) as Performance['timeSignature']['denominator'],
      },
      arrangementId: textOrNull(performance.arrangement_id),
      arrangementName: textOrNull(performance.arrangement_name),
      status: text(performance.status) as Performance['status'],
      notes: textOrNull(performance.notes),
      sections: sectionsByPerformance.get(text(performance.id)) ?? [],
    }))

  return { ...toSummary({ ...row, performance_count: performances.length }), performances }
}

export function createSetlist(db: DatabaseSync, data: SetlistData): Setlist {
  const id = randomUUID()
  const now = nowIso()
  db.prepare(
    'INSERT INTO setlists (id, name, service_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, data.name, data.serviceDate, data.notes, now, now)
  return getSetlist(db, id)
}

export function updateSetlist(db: DatabaseSync, id: string, data: SetlistData): Setlist {
  requireSetlistRow(db, id)
  db.prepare(
    'UPDATE setlists SET name = ?, service_date = ?, notes = ?, updated_at = ? WHERE id = ?',
  ).run(data.name, data.serviceDate, data.notes, nowIso(), id)
  return getSetlist(db, id)
}

export function deleteSetlist(db: DatabaseSync, id: string): null {
  requireSetlistRow(db, id)
  db.prepare('DELETE FROM setlists WHERE id = ?').run(id)
  return null
}

function touchSetlist(db: DatabaseSync, id: string): void {
  db.prepare('UPDATE setlists SET updated_at = ? WHERE id = ?').run(nowIso(), id)
}

function requireArrangementOfSong(db: DatabaseSync, arrangementId: string, songId: string): void {
  const arrangement = db.prepare('SELECT song_id FROM arrangements WHERE id = ?').get(arrangementId)
  if (!arrangement) {
    throw new EngineError('not_found', 'That arrangement no longer exists.')
  }
  if (text(arrangement.song_id) !== songId) {
    throw new EngineError('invalid_params', 'That arrangement belongs to a different song.')
  }
}

/** Copies an arrangement into a performance, resolving inherited parts and instructions. */
function copySections(db: DatabaseSync, performanceId: string, arrangementId: string): void {
  db.prepare('DELETE FROM performance_sections WHERE performance_id = ?').run(performanceId)
  const rows = db
    .prepare(
      `SELECT e.song_section_id, e.position, s.name, s.section_type, e.start_bar, e.end_bar,
         e.repeat_count, COALESCE(e.vocal_parts, s.vocal_parts) AS vocal_parts,
         COALESCE(e.instructions, s.instructions) AS instructions, e.notes
       FROM arrangement_sections e
       JOIN song_sections s ON s.id = e.song_section_id
       WHERE e.arrangement_id = ?
       ORDER BY e.position`,
    )
    .all(arrangementId)

  const insert = db.prepare(
    `INSERT INTO performance_sections (id, performance_id, song_section_id, position, name,
       section_type, start_bar, end_bar, repeat_count, vocal_parts, instructions, notes,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = nowIso()
  for (const row of rows) {
    insert.run(
      randomUUID(),
      performanceId,
      text(row.song_section_id),
      Number(row.position),
      text(row.name),
      text(row.section_type),
      Number(row.start_bar),
      Number(row.end_bar),
      Number(row.repeat_count),
      text(row.vocal_parts),
      textOrNull(row.instructions),
      textOrNull(row.notes),
      now,
      now,
    )
  }
}

function renumber(db: DatabaseSync, orderedIds: string[]): void {
  const update = db.prepare('UPDATE performances SET position = ?, updated_at = ? WHERE id = ?')
  const now = nowIso()
  orderedIds.forEach((id, position) => update.run(position, now, id))
}

function orderedPerformanceIds(db: DatabaseSync, setlistId: string): string[] {
  return db
    .prepare('SELECT id FROM performances WHERE setlist_id = ? ORDER BY position')
    .all(setlistId)
    .map((row) => text(row.id))
}

export function addPerformance(
  db: DatabaseSync,
  params: ParsedMethodParams<'performances.add'>,
): Setlist {
  return transaction(db, () => {
    requireSetlistRow(db, params.setlistId)
    requireArrangementOfSong(db, params.arrangementId, params.songId)

    const id = randomUUID()
    const now = nowIso()
    db.prepare(
      `INSERT INTO performances (id, setlist_id, position, song_id, arrangement_id, status, created_at, updated_at)
       VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM performances WHERE setlist_id = ?),
         ?, ?, 'planned', ?, ?)`,
    ).run(id, params.setlistId, params.setlistId, params.songId, params.arrangementId, now, now)
    copySections(db, id, params.arrangementId)
    touchSetlist(db, params.setlistId)
    return getSetlist(db, params.setlistId)
  })
}

export function removePerformance(db: DatabaseSync, id: string): Setlist {
  return transaction(db, () => {
    const setlistId = text(requirePerformanceRow(db, id).setlist_id)
    db.prepare('DELETE FROM performances WHERE id = ?').run(id)
    renumber(db, orderedPerformanceIds(db, setlistId))
    touchSetlist(db, setlistId)
    return getSetlist(db, setlistId)
  })
}

export function movePerformance(db: DatabaseSync, id: string, position: number): Setlist {
  return transaction(db, () => {
    const setlistId = text(requirePerformanceRow(db, id).setlist_id)
    const order = orderedPerformanceIds(db, setlistId).filter((other) => other !== id)
    order.splice(Math.min(position, order.length), 0, id)
    renumber(db, order)
    touchSetlist(db, setlistId)
    return getSetlist(db, setlistId)
  })
}

export function setPerformanceArrangement(
  db: DatabaseSync,
  id: string,
  arrangementId: string,
): Setlist {
  return transaction(db, () => {
    const performance = requirePerformanceRow(db, id)
    if (text(performance.status) !== 'planned') {
      const song = db.prepare('SELECT title FROM songs WHERE id = ?').get(text(performance.song_id))
      throw new EngineError(
        'conflict',
        `${quoted(text(song?.title))} has already been performed, so its arrangement is kept as played.`,
      )
    }
    requireArrangementOfSong(db, arrangementId, text(performance.song_id))

    db.prepare('UPDATE performances SET arrangement_id = ?, updated_at = ? WHERE id = ?').run(
      arrangementId,
      nowIso(),
      id,
    )
    copySections(db, id, arrangementId)
    const setlistId = text(performance.setlist_id)
    touchSetlist(db, setlistId)
    return getSetlist(db, setlistId)
  })
}
