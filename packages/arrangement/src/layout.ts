export interface BarSpan {
  startBar: number
  endBar: number
  repeatCount: number
}

/** Length of one pass. The database guarantees the span divides evenly. */
export function barsPerPass(span: BarSpan): number {
  return (span.endBar - span.startBar + 1) / span.repeatCount
}

export function totalBars(spans: readonly BarSpan[]): number {
  return spans.reduce((sum, span) => sum + (span.endBar - span.startBar + 1), 0)
}

/**
 * Places entries back to back from startBar. Each entry occupies
 * barsPerPass × repeatCount bars.
 */
export function layoutEntries<T extends { barsPerPass: number; repeatCount: number }>(
  startBar: number,
  entries: readonly T[],
): (T & { startBar: number; endBar: number })[] {
  let cursor = startBar
  return entries.map((entry) => {
    const span = entry.barsPerPass * entry.repeatCount
    const placed = { ...entry, startBar: cursor, endBar: cursor + span - 1 }
    cursor += span
    return placed
  })
}

/** Approximate playing time, for planning only. Assumes a constant tempo. */
export function durationSeconds(
  bars: number,
  tempoBpm: number,
  beatsPerBar: number,
  beatUnit = 4,
): number {
  const quarterNotesPerBar = beatsPerBar * (4 / beatUnit)
  return (bars * quarterNotesPerBar * 60) / tempoBpm
}
