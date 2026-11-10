import type { ArrangementEntry, SectionType, SongSection, VocalPart } from './model.ts'

/** Everything the choir display needs to know about one section. */
export interface CueSection {
  name: string
  type: SectionType
  vocalParts: VocalPart[]
  instructions: string | null
  repeatCount: number
}

/** A position in an arrangement. pass is 1-based. */
export interface CueCursor {
  index: number
  pass: number
}

export interface CueFrame {
  current: CueSection
  next: CueSection | null
  pass: number
  totalPasses: number
}

/** Applies an arrangement entry's overrides on top of its song section. */
export function resolveEntry(entry: ArrangementEntry, section: SongSection): CueSection {
  return {
    name: section.name,
    type: section.type,
    vocalParts: entry.vocalParts ?? section.vocalParts,
    instructions: entry.instructions ?? section.instructions,
    repeatCount: entry.repeatCount,
  }
}

export function cueFrame(sections: readonly CueSection[], cursor: CueCursor): CueFrame | null {
  const current = sections[cursor.index]
  if (!current) {
    return null
  }

  return {
    current,
    next: sections[cursor.index + 1] ?? null,
    pass: Math.min(Math.max(cursor.pass, 1), current.repeatCount),
    totalPasses: current.repeatCount,
  }
}

/** Moves one pass forward or back, crossing into neighbouring sections at the ends. */
export function stepCursor(
  sections: readonly CueSection[],
  cursor: CueCursor,
  direction: 1 | -1,
): CueCursor {
  const current = sections[cursor.index]
  if (!current) {
    return { index: 0, pass: 1 }
  }

  if (direction === 1) {
    if (cursor.pass < current.repeatCount) {
      return { index: cursor.index, pass: cursor.pass + 1 }
    }
    return cursor.index + 1 < sections.length ? { index: cursor.index + 1, pass: 1 } : cursor
  }

  if (cursor.pass > 1) {
    return { index: cursor.index, pass: cursor.pass - 1 }
  }
  const previous = sections[cursor.index - 1]
  return previous ? { index: cursor.index - 1, pass: previous.repeatCount } : cursor
}
