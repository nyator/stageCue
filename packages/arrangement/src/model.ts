import { z } from 'zod'

/*
 * Positions are in quarter notes from the start of the song, the unit Ableton
 * Live uses for song time and locators. Tempo is quarter notes per minute.
 */

export const timeSignatureSchema = z.object({
  numerator: z.int().min(1).max(32),
  denominator: z.literal([1, 2, 4, 8, 16, 32]),
})
export type TimeSignature = z.infer<typeof timeSignatureSchema>

/** A marker as the DAW reports it: Ableton calls these locators. */
export const markerSchema = z.object({
  name: z.string().max(200),
  beat: z.number().min(0).max(1_000_000),
})
export type Marker = z.infer<typeof markerSchema>

export const transportSchema = z.object({
  playing: z.boolean(),
  beat: z.number().min(-1_000).max(1_000_000),
  tempo: z.number().min(10).max(999),
  timeSignature: timeSignatureSchema,
})
export type Transport = z.infer<typeof transportSchema>

/** Separates the section name from the extra line: "Chorus | Full choir". */
export const DETAIL_SEPARATOR = '|'

/** A marker ready to show. A blank cue clears the display, for example between songs. */
export interface Cue {
  label: string
  detail: string | null
  beat: number
  blank: boolean
}

/** Marker names "-" or empty mean "show nothing from here". */
export function parseMarkerName(name: string): Pick<Cue, 'label' | 'detail' | 'blank'> {
  const separator = name.indexOf(DETAIL_SEPARATOR)
  const label = (separator === -1 ? name : name.slice(0, separator)).trim()
  const detail = separator === -1 ? '' : name.slice(separator + 1).trim()
  return {
    label,
    detail: detail || null,
    blank: label === '' || label === '-',
  }
}

/** Sorted by position. Markers at the same position keep the last one. */
export function toCues(markers: readonly Marker[]): Cue[] {
  const byBeat = new Map<number, Cue>()
  for (const marker of markers) {
    byBeat.set(marker.beat, { ...parseMarkerName(marker.name), beat: marker.beat })
  }
  return [...byBeat.values()].sort((a, b) => a.beat - b.beat)
}

/** Length of one beat of the time signature, in quarter notes: 1 in 4/4, 0.5 in 6/8. */
export function beatUnit(timeSignature: TimeSignature): number {
  return 4 / timeSignature.denominator
}

/** The playhead now, estimated from the last report. Stopped transports do not move. */
export function beatAt(transport: Transport, elapsedMs: number): number {
  if (!transport.playing) return transport.beat
  return transport.beat + (Math.max(0, elapsedMs) / 60_000) * transport.tempo
}

// ---------------------------------------------------------------------------
// Display settings
// ---------------------------------------------------------------------------

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex colour.')

/*
 * Every field has a default, so settings stored by an older version, or sent by
 * an older engine, fill in anything added since instead of failing validation.
 */
export const displaySettingsSchema = z.object({
  position: z.enum(['top', 'bottom']).default('top'),
  background: hexColor.default('#0b0f0d'),
  text: hexColor.default('#f2f5f3'),
  accent: hexColor.default('#5fd49a'),
  backgroundOpacity: z.number().min(0).max(1).default(0.85),
  scale: z.number().min(0.75).max(1.5).default(1),
  showDetail: z.boolean().default(true),
  showNext: z.boolean().default(true),
  showCountdown: z.boolean().default(true),
  showProgress: z.boolean().default(true),
})
export type DisplaySettings = z.output<typeof displaySettingsSchema>

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = displaySettingsSchema.parse({})
