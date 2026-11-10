import type { SetlistSummary } from '@stagecue/arrangement'
import { todayIso } from './format'

/** The nearest service today or later, or null. */
export function nextService(
  setlists: readonly SetlistSummary[],
  today = todayIso(),
): SetlistSummary | null {
  return (
    setlists
      .filter((s) => s.serviceDate !== null && s.serviceDate >= today)
      .sort((a, b) => (a.serviceDate ?? '').localeCompare(b.serviceDate ?? ''))[0] ?? null
  )
}

/** The next service, falling back to the newest setlist. */
export function pickDefaultSetlist(
  setlists: readonly SetlistSummary[],
  today = todayIso(),
): SetlistSummary | null {
  return nextService(setlists, today) ?? setlists[0] ?? null
}
