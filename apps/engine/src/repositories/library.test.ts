import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_DISPLAY_SETTINGS, barsPerPass } from '@stagecue/arrangement'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrate, openDatabase } from '../db/database.ts'
import { createLogger } from '../logger.ts'
import { createDispatcher } from '../rpc/dispatcher.ts'
import { loadSampleLibrary } from '../sample-library.ts'
import { createArrangement, saveArrangement } from './arrangements.ts'
import { getSetlist, listSetlists, movePerformance, setPerformanceArrangement } from './setlists.ts'
import { getDisplaySettings, saveDisplaySettings } from './settings.ts'
import { createSong, deleteSong, getSong, listSongs, saveSections } from './songs.ts'
import { EngineError } from './support.ts'

let db: DatabaseSync

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db)
  loadSampleLibrary(db)
})

afterEach(() => {
  db.close()
})

function songByTitle(title: string) {
  const summary = listSongs(db).find((song) => song.title === title)
  if (!summary) throw new Error(`No sample song ${title}`)
  return getSong(db, summary.id)
}

function setlistByName(name: string) {
  const summary = listSetlists(db).find((setlist) => setlist.name === name)
  if (!summary) throw new Error(`No sample setlist ${name}`)
  return getSetlist(db, summary.id)
}

function expectEngineError(fn: () => unknown, code: string, message?: RegExp): void {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError)
    expect((error as EngineError).code).toBe(code)
    if (message) expect((error as Error).message).toMatch(message)
    return
  }
  throw new Error('Expected an EngineError')
}

describe('sample library', () => {
  it('loads songs alphabetically and setlists newest first', () => {
    expect(listSongs(db).map((song) => song.title)).toEqual([
      'Amazing Grace',
      'Blessed Assurance',
      'Come, Thou Fount of Every Blessing',
      'Hark! The Herald Angels Sing',
      'Holy, Holy, Holy',
      'It Is Well with My Soul',
      'O Come, All Ye Faithful',
    ])
    expect(listSetlists(db).map((setlist) => setlist.serviceDate)).toEqual([
      '2026-12-20',
      '2026-11-22',
      '2026-11-15',
      '2026-10-04',
    ])
  })

  it('lays out arrangement bars from the start bar, expanding repeats', () => {
    const sunday = songByTitle('Amazing Grace').arrangements.find(
      (a) => a.name === 'Sunday morning',
    )!
    const tag = sunday.entries[6]!
    expect(sunday.entries[0]).toMatchObject({ startBar: 3, endBar: 6 })
    expect(tag).toMatchObject({ repeatCount: 2, startBar: 75, endBar: 90 })
    expect(barsPerPass(tag)).toBe(8)
  })
})

describe('performances', () => {
  it('copy arrangement sections with inherited parts and per-entry instructions', () => {
    const sunday = setlistByName('Sunday Morning Service')
    expect(sunday.performances.map((p) => p.songTitle)).toEqual([
      'Holy, Holy, Holy',
      'Blessed Assurance',
      'It Is Well with My Soul',
      'Amazing Grace',
    ])

    const itIsWell = sunday.performances[2]!
    const lastChorus = itIsWell.sections.at(-2)!
    expect(lastChorus).toMatchObject({
      name: 'Chorus',
      repeatCount: 2,
      vocalParts: ['full_choir'],
      instructions: 'Second time: key change up a step.',
    })
    expect(itIsWell.sections[2]).toMatchObject({
      name: 'Chorus',
      instructions: 'Full choir in four parts.',
    })
  })

  it('are not changed by later arrangement edits', () => {
    const song = songByTitle('Holy, Holy, Holy')
    const arrangement = song.arrangements[0]!
    saveArrangement(db, arrangement.id, {
      name: 'Shortened',
      tempoBpm: null,
      songKey: null,
      notes: null,
      startBar: 1,
      entries: [
        {
          songSectionId: song.sections[0]!.id,
          barsPerPass: 4,
          repeatCount: 1,
          vocalParts: null,
          instructions: null,
          notes: null,
        },
      ],
    })

    const performance = setlistByName('Sunday Morning Service').performances[0]!
    expect(performance.sections).toHaveLength(7)
    expect(performance.arrangementName).toBe('Shortened')
  })

  it('can switch arrangement while planned, but not once performed', () => {
    const evening = setlistByName('Evening Prayer')
    const grace = evening.performances[1]!
    const song = songByTitle('Amazing Grace')
    const sunday = song.arrangements.find((a) => a.name === 'Sunday morning')!

    const updated = setPerformanceArrangement(db, grace.id, sunday.id)
    expect(updated.performances[1]!.sections).toHaveLength(8)

    db.prepare("UPDATE performances SET status = 'completed' WHERE id = ?").run(grace.id)
    expectEngineError(
      () => setPerformanceArrangement(db, grace.id, sunday.id),
      'conflict',
      /already been performed/,
    )
  })

  it('reject an arrangement from a different song', () => {
    const performance = setlistByName('Evening Prayer').performances[0]!
    const other = songByTitle('Amazing Grace').arrangements[0]!
    expectEngineError(
      () => setPerformanceArrangement(db, performance.id, other.id),
      'invalid_params',
    )
  })

  it('reorder within a setlist', () => {
    const sunday = setlistByName('Sunday Morning Service')
    const moved = movePerformance(db, sunday.performances[3]!.id, 0)
    expect(moved.performances.map((p) => [p.songTitle, p.position])).toEqual([
      ['Amazing Grace', 0],
      ['Holy, Holy, Holy', 1],
      ['Blessed Assurance', 2],
      ['It Is Well with My Soul', 3],
    ])
  })
})

describe('songs and sections', () => {
  it('refuse to delete a song that is in a setlist', () => {
    const song = songByTitle('Amazing Grace')
    expectEngineError(() => deleteSong(db, song.id), 'conflict', /in 2 setlists/)
  })

  it('delete a song along with its sections and arrangements', () => {
    const song = createSong(db, {
      title: 'Test Song',
      artist: null,
      defaultKey: null,
      tempoBpm: null,
      timeSignature: { numerator: 4, denominator: 4 },
      notes: null,
    })
    saveSections(db, song.id, [
      {
        id: null,
        name: 'Chorus',
        type: 'chorus',
        lengthBars: 8,
        vocalParts: [],
        instructions: null,
        notes: null,
      },
    ])
    createArrangement(db, { songId: song.id, name: 'Default', copyFromId: null })

    expect(deleteSong(db, song.id)).toBeNull()
    const orphans = db.prepare(
      'SELECT COUNT(*) AS n FROM arrangement_sections WHERE arrangement_id NOT IN (SELECT id FROM arrangements)',
    )
    expect(orphans.get()?.n).toBe(0)
    expectEngineError(() => getSong(db, song.id), 'not_found')
  })

  it('refuse to delete a section an arrangement uses, naming the arrangement', () => {
    const song = songByTitle('Holy, Holy, Holy')
    const withoutIntro = song.sections.slice(1).map((section) => ({ ...section }))
    expectEngineError(
      () => saveSections(db, song.id, withoutIntro),
      'conflict',
      /“Intro” is used in the “Sunday morning” arrangement/,
    )
    expect(getSong(db, song.id).sections).toHaveLength(7)
  })

  it('reorder, rename, and add sections in one save', () => {
    const song = songByTitle('Blessed Assurance')
    const [intro, ...rest] = song.sections
    const saved = saveSections(db, song.id, [
      ...rest,
      { ...intro!, name: 'Opening' },
      {
        id: null,
        name: 'Tag',
        type: 'tag',
        lengthBars: 4,
        vocalParts: ['full_choir'],
        instructions: null,
        notes: null,
      },
    ])
    expect(saved.sections.map((section) => section.name)).toEqual([
      'Verse 1',
      'Verse 2',
      'Verse 3',
      'Chorus',
      'Ending',
      'Opening',
      'Tag',
    ])
  })

  it('new arrangements start with every section in song order', () => {
    const song = songByTitle('Hark! The Herald Angels Sing')
    const created = createArrangement(db, { songId: song.id, name: 'Plain', copyFromId: null })
    expect(created.entries.map((entry) => [entry.startBar, entry.endBar])).toEqual([
      [1, 4],
      [5, 20],
      [21, 36],
      [37, 52],
      [53, 56],
    ])
  })
})

describe('display settings', () => {
  it('default until saved, then round-trip', () => {
    expect(getDisplaySettings(db)).toEqual(DEFAULT_DISPLAY_SETTINGS)
    const custom = { ...DEFAULT_DISPLAY_SETTINGS, position: 'bottom' as const, accent: '#ffcc00' }
    expect(saveDisplaySettings(db, custom)).toEqual(custom)
    expect(getDisplaySettings(db)).toEqual(custom)
  })
})

describe('dispatcher', () => {
  const dispatch = () => createDispatcher(db, createLogger('silent'))

  it('validates params before running a handler', () => {
    expect(dispatch()('songs.get', { id: 'nope' })).toMatchObject({
      ok: false,
      code: 'invalid_params',
    })
    expect(dispatch()('songs.list', { unexpected: 1 })).toMatchObject({
      ok: false,
      code: 'invalid_params',
    })
  })

  it('passes expected errors through and flags mutations', () => {
    expect(dispatch()('songs.get', { id: crypto.randomUUID() })).toMatchObject({
      ok: false,
      code: 'not_found',
    })
    expect(dispatch()('songs.list', {})).toMatchObject({ ok: true, mutated: false })
    expect(
      dispatch()('setlists.create', { name: 'Midweek', serviceDate: null, notes: null }),
    ).toMatchObject({ ok: true, mutated: true })
  })

  it('hides unexpected errors behind internal_error', () => {
    db.exec('DROP TABLE performance_events')
    db.exec('DROP TABLE daw_sessions')
    db.exec('DROP TABLE performance_sections')
    db.exec('DROP TABLE performances')
    expect(dispatch()('setlists.list', {})).toMatchObject({ ok: false, code: 'internal_error' })
  })
})
