import type { Arrangement, SongSection } from '@stagecue/arrangement'
import { describe, expect, it } from 'vitest'
import {
  addSection,
  arrangementDraft,
  arrangementToInput,
  duplicateEntry,
  insertEntry,
  isArrangementDirty,
  moveEntry,
  placeEntries,
  removeEntry,
  updateEntry,
  validateSections,
} from './drafts'

const now = '2026-11-10T12:00:00.000Z'
const songId = crypto.randomUUID()

function section(name: string, lengthBars: number): SongSection {
  return {
    id: crypto.randomUUID(),
    songId,
    name,
    type: 'verse',
    lengthBars,
    vocalParts: ['full_choir'],
    instructions: null,
    notes: null,
    position: 0,
  }
}

const verse = section('Verse 1', 16)
const chorus = section('Chorus', 8)

const saved: Arrangement = {
  id: crypto.randomUUID(),
  songId,
  name: 'Sunday',
  tempoBpm: null,
  songKey: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
  entries: [
    {
      id: crypto.randomUUID(),
      songSectionId: verse.id,
      position: 0,
      startBar: 5,
      endBar: 20,
      repeatCount: 1,
      vocalParts: null,
      instructions: null,
      notes: null,
    },
    {
      id: crypto.randomUUID(),
      songSectionId: chorus.id,
      position: 1,
      startBar: 21,
      endBar: 36,
      repeatCount: 2,
      vocalParts: null,
      instructions: null,
      notes: null,
    },
  ],
}

describe('arrangement drafts', () => {
  it('round-trips a saved arrangement without becoming dirty', () => {
    const draft = arrangementDraft(saved)
    expect(draft.startBar).toBe(5)
    expect(draft.entries.map((entry) => entry.barsPerPass)).toEqual([16, 8])
    expect(isArrangementDirty(draft, saved)).toBe(false)
  })

  it('treats whitespace-only edits as clean', () => {
    const draft = updateEntry(arrangementDraft(saved), saved.entries[0]!.id, { instructions: '  ' })
    expect(isArrangementDirty({ ...draft, name: ' Sunday ' }, saved)).toBe(false)
  })

  it('inserts after the selected entry and re-lays out bars', () => {
    const { draft, key } = insertEntry(arrangementDraft(saved), verse, saved.entries[0]!.id)
    expect(draft.entries.map((entry) => entry.key).indexOf(key)).toBe(1)
    expect(placeEntries(draft).map((entry) => [entry.startBar, entry.endBar])).toEqual([
      [5, 20],
      [21, 36],
      [37, 52],
    ])
    expect(isArrangementDirty(draft, saved)).toBe(true)
  })

  it('moves, duplicates, and removes entries', () => {
    const [first, second] = saved.entries.map((entry) => entry.id) as [string, string]
    let draft = moveEntry(arrangementDraft(saved), second, -1)
    expect(draft.entries.map((entry) => entry.key)).toEqual([second, first])
    expect(moveEntry(draft, second, -1).entries.map((entry) => entry.key)).toEqual([second, first])

    draft = duplicateEntry(draft, second)
    expect(draft.entries).toHaveLength(3)
    expect(draft.entries[1]).toMatchObject({ songSectionId: chorus.id, repeatCount: 2 })

    draft = removeEntry(draft, first)
    expect(arrangementToInput(draft).entries).toHaveLength(2)
  })
})

describe('section drafts', () => {
  it('numbers new verses and flags invalid rows', () => {
    let drafts = addSection([], 'verse')
    drafts = addSection(drafts, 'verse')
    drafts = addSection(drafts, 'chorus')
    expect(drafts.map((draft) => draft.name)).toEqual(['Verse 1', 'Verse 2', 'Chorus'])

    const broken = [{ ...drafts[0]!, name: ' ' }, { ...drafts[1]!, lengthBars: null }, drafts[2]!]
    expect(Object.values(validateSections(broken))).toEqual([
      'Give this section a name.',
      'Length must be between 1 and 999 bars.',
    ])
  })
})
