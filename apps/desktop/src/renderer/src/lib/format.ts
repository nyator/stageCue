import {
  durationSeconds,
  SECTION_TYPE_LABELS,
  VOCAL_PART_LABELS,
  type SectionType,
  type TimeSignature,
  type VocalPart,
} from '@stagecue/arrangement'

/** Today as YYYY-MM-DD in local time, to compare with service dates. */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

const serviceDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatServiceDate(iso: string | null): string {
  return iso ? serviceDateFormat.format(parseIsoDate(iso)) : 'No date'
}

export function relativeDay(iso: string, today = todayIso()): string {
  const days = Math.round(
    (parseIsoDate(iso).getTime() - parseIsoDate(today).getTime()) / 86_400_000,
  )
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return days > 0 ? `In ${days} days` : `${-days} days ago`
}

const shortDateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/** A compact date for tight spaces, such as 15 Nov. */
export function formatShortDate(iso: string | null): string {
  return iso ? shortDateFormat.format(parseIsoDate(iso)) : 'No date'
}

const timestampFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatTimestamp(iso: string): string {
  return timestampFormat.format(new Date(iso))
}

export function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

/** Estimated length, or null when the tempo is unknown. */
export function estimateDuration(
  bars: number,
  tempoBpm: number | null,
  timeSignature: TimeSignature,
): string | null {
  if (!tempoBpm || bars === 0) {
    return null
  }
  return formatDuration(
    durationSeconds(bars, tempoBpm, timeSignature.numerator, timeSignature.denominator),
  )
}

export function formatMeter(timeSignature: TimeSignature): string {
  return `${timeSignature.numerator}/${timeSignature.denominator}`
}

export function formatBarRange(startBar: number, endBar: number): string {
  return startBar === endBar ? `Bar ${startBar}` : `Bars ${startBar}–${endBar}`
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function sectionTypeLabel(type: SectionType): string {
  return SECTION_TYPE_LABELS[type]
}

export function vocalPartsLabel(parts: readonly VocalPart[]): string {
  return parts.length === 0
    ? 'No parts set'
    : parts.map((part) => VOCAL_PART_LABELS[part]).join(', ')
}
