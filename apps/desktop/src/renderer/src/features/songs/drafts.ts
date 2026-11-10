import {
  barsPerPass,
  layoutEntries,
  type Arrangement,
  type ArrangementInput,
  type SectionInput,
  type SongSection,
  type VocalPart,
} from '@stagecue/arrangement'

/*
 * Editing state for sections and arrangements. Pure functions only, so the
 * rules are testable without React and components stay thin.
 */

let keyCounter = 0
const newKey = () => `draft-${++keyCounter}`

function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface SectionDraft {
  key: string
  id: string | null
  name: string
  type: SongSection['type']
  lengthBars: number | null
  vocalParts: VocalPart[]
  instructions: string
  notes: string
}

export function sectionDrafts(sections: readonly SongSection[]): SectionDraft[] {
  return sections.map((section) => ({
    key: section.id,
    id: section.id,
    name: section.name,
    type: section.type,
    lengthBars: section.lengthBars,
    vocalParts: section.vocalParts,
    instructions: section.instructions ?? '',
    notes: section.notes ?? '',
  }))
}

/** Suggests the next name for a type, such as "Verse 3" after two verses. */
export function nextSectionName(
  drafts: readonly SectionDraft[],
  type: SongSection['type'],
): string {
  const base: Record<SongSection['type'], string> = {
    intro: 'Intro',
    verse: 'Verse',
    pre_chorus: 'Pre-chorus',
    chorus: 'Chorus',
    bridge: 'Bridge',
    instrumental: 'Instrumental',
    vamp: 'Vamp',
    tag: 'Tag',
    interlude: 'Interlude',
    ending: 'Ending',
    other: 'Section',
  }
  if (type !== 'verse') return base[type]
  return `Verse ${drafts.filter((draft) => draft.type === 'verse').length + 1}`
}

export function addSection(
  drafts: readonly SectionDraft[],
  type: SongSection['type'],
): SectionDraft[] {
  const defaults: Partial<Record<SongSection['type'], number>> = {
    intro: 4,
    ending: 4,
    vamp: 4,
    tag: 4,
  }
  return [
    ...drafts,
    {
      key: newKey(),
      id: null,
      name: nextSectionName(drafts, type),
      type,
      lengthBars: defaults[type] ?? 8,
      vocalParts: type === 'intro' || type === 'instrumental' ? ['instrumental'] : ['full_choir'],
      instructions: '',
      notes: '',
    },
  ]
}

export function updateSection(
  drafts: readonly SectionDraft[],
  key: string,
  patch: Partial<SectionDraft>,
): SectionDraft[] {
  return drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft))
}

export function removeSection(drafts: readonly SectionDraft[], key: string): SectionDraft[] {
  return drafts.filter((draft) => draft.key !== key)
}

export function moveSection(
  drafts: readonly SectionDraft[],
  key: string,
  delta: -1 | 1,
): SectionDraft[] {
  const index = drafts.findIndex((draft) => draft.key === key)
  return move(drafts, index, index + delta)
}

export type SectionErrors = Record<string, string>

/** Returns problems keyed by draft key; empty when the drafts can be saved. */
export function validateSections(drafts: readonly SectionDraft[]): SectionErrors {
  const errors: SectionErrors = {}
  for (const draft of drafts) {
    if (!draft.name.trim()) errors[draft.key] = 'Give this section a name.'
    else if (!draft.lengthBars || draft.lengthBars < 1 || draft.lengthBars > 999)
      errors[draft.key] = 'Length must be between 1 and 999 bars.'
  }
  return errors
}

export function sectionsToInput(drafts: readonly SectionDraft[]): SectionInput[] {
  return drafts.map((draft) => ({
    id: draft.id,
    name: draft.name,
    type: draft.type,
    lengthBars: draft.lengthBars ?? 1,
    vocalParts: draft.vocalParts,
    instructions: draft.instructions,
    notes: draft.notes,
  }))
}

// ---------------------------------------------------------------------------
// Arrangements
// ---------------------------------------------------------------------------

export interface EntryDraft {
  key: string
  songSectionId: string
  barsPerPass: number
  repeatCount: number
  /** Null follows the song section. */
  vocalParts: VocalPart[] | null
  instructions: string | null
  notes: string
}

export interface ArrangementDraft {
  name: string
  startBar: number
  tempoBpm: number | null
  songKey: string
  notes: string
  entries: EntryDraft[]
}

export function arrangementDraft(arrangement: Arrangement): ArrangementDraft {
  return {
    name: arrangement.name,
    startBar: arrangement.entries[0]?.startBar ?? 1,
    tempoBpm: arrangement.tempoBpm,
    songKey: arrangement.songKey ?? '',
    notes: arrangement.notes ?? '',
    entries: arrangement.entries.map((entry) => ({
      key: entry.id,
      songSectionId: entry.songSectionId,
      barsPerPass: barsPerPass(entry),
      repeatCount: entry.repeatCount,
      vocalParts: entry.vocalParts,
      instructions: entry.instructions,
      notes: entry.notes ?? '',
    })),
  }
}

export function arrangementToInput(draft: ArrangementDraft): ArrangementInput {
  return {
    name: draft.name,
    startBar: draft.startBar,
    tempoBpm: draft.tempoBpm,
    songKey: draft.songKey,
    notes: draft.notes,
    entries: draft.entries.map((entry) => ({
      songSectionId: entry.songSectionId,
      barsPerPass: entry.barsPerPass,
      repeatCount: entry.repeatCount,
      vocalParts: entry.vocalParts,
      instructions: entry.instructions,
      notes: entry.notes,
    })),
  }
}

/** True when saving would change what the engine has stored. */
export function isArrangementDirty(draft: ArrangementDraft, saved: Arrangement): boolean {
  const normalise = (input: ArrangementInput) =>
    JSON.stringify({
      ...input,
      name: input.name.trim(),
      songKey: input.songKey?.trim() || null,
      notes: input.notes?.trim() || null,
      entries: input.entries.map((entry) => ({
        ...entry,
        instructions: entry.instructions?.trim() || null,
        notes: entry.notes?.trim() || null,
      })),
    })
  return (
    normalise(arrangementToInput(draft)) !== normalise(arrangementToInput(arrangementDraft(saved)))
  )
}

/** Inserts a section after the given entry, or at the end. Returns the draft and the new key. */
export function insertEntry(
  draft: ArrangementDraft,
  section: SongSection,
  afterKey: string | null,
): { draft: ArrangementDraft; key: string } {
  const entry: EntryDraft = {
    key: newKey(),
    songSectionId: section.id,
    barsPerPass: section.lengthBars,
    repeatCount: 1,
    vocalParts: null,
    instructions: null,
    notes: '',
  }
  const index = afterKey ? draft.entries.findIndex((e) => e.key === afterKey) : -1
  const entries = [...draft.entries]
  entries.splice(index === -1 ? entries.length : index + 1, 0, entry)
  return { draft: { ...draft, entries }, key: entry.key }
}

export function updateEntry(
  draft: ArrangementDraft,
  key: string,
  patch: Partial<Omit<EntryDraft, 'key'>>,
): ArrangementDraft {
  return {
    ...draft,
    entries: draft.entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
  }
}

export function removeEntry(draft: ArrangementDraft, key: string): ArrangementDraft {
  return { ...draft, entries: draft.entries.filter((entry) => entry.key !== key) }
}

export function moveEntry(draft: ArrangementDraft, key: string, delta: -1 | 1): ArrangementDraft {
  const index = draft.entries.findIndex((entry) => entry.key === key)
  return { ...draft, entries: move(draft.entries, index, index + delta) }
}

export function duplicateEntry(draft: ArrangementDraft, key: string): ArrangementDraft {
  const index = draft.entries.findIndex((entry) => entry.key === key)
  const source = draft.entries[index]
  if (!source) return draft
  const entries = [...draft.entries]
  entries.splice(index + 1, 0, { ...source, key: newKey() })
  return { ...draft, entries }
}

/** Entries with their bar positions, as the engine will store them. */
export function placeEntries(draft: ArrangementDraft) {
  return layoutEntries(draft.startBar, draft.entries)
}
