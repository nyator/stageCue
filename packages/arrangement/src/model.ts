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

/** The DAW's loop region, while looping is switched on. */
export const loopSchema = z.object({
  start: z.number().min(0).max(1_000_000),
  end: z.number().min(0).max(1_000_000),
})
export type Loop = z.infer<typeof loopSchema>

export const transportSchema = z.object({
  playing: z.boolean(),
  beat: z.number().min(-1_000).max(1_000_000),
  tempo: z.number().min(10).max(999),
  timeSignature: timeSignatureSchema,
  /** Null or absent when looping is off. Older bridges do not send it. */
  loop: loopSchema.nullable().optional(),
})
export type Transport = z.infer<typeof transportSchema>

/**
 * The loop the playhead will wrap around, or null. A loop only applies while
 * the playhead is before its end: past the end, the DAW plays on normally.
 */
export function activeLoop(transport: Pick<Transport, 'beat' | 'loop'>): Loop | null {
  const loop = transport.loop
  if (!loop || loop.end - loop.start < 1e-6) return null
  return transport.beat < loop.end - 1e-6 ? loop : null
}

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

/** Backward corrections smaller than this, in quarter notes, are treated as jitter. */
export const JITTER_BEATS = 0.5

/**
 * The playhead to display, given the last one shown and a fresh estimate.
 * Each DAW report corrects the estimate a little, sometimes backwards; shown
 * as is, the countdown and progress bar would twitch. Small backward steps are
 * held instead, until the estimate catches up. Real jumps (a seek, a loop going
 * back) are larger than JITTER_BEATS and apply at once.
 */
export function smoothBeat(previous: number | null, estimate: number): number {
  if (previous === null || estimate >= previous) return estimate
  return previous - estimate < JITTER_BEATS ? previous : estimate
}

/**
 * The playhead now, estimated from the last report. Stopped transports do not
 * move. Inside a loop, the estimate wraps back to the loop start the way the DAW
 * does, instead of running on into the next section until the next report.
 */
export function beatAt(transport: Transport, elapsedMs: number): number {
  if (!transport.playing) return transport.beat
  const beat = transport.beat + (Math.max(0, elapsedMs) / 60_000) * transport.tempo
  const loop = activeLoop(transport)
  if (!loop || beat < loop.end) return beat
  return loop.start + ((beat - loop.end) % (loop.end - loop.start))
}

// ---------------------------------------------------------------------------
// Display settings
// ---------------------------------------------------------------------------

export const OUTPUT_SIZES = ['1080p', '4k'] as const
export type OutputSize = (typeof OUTPUT_SIZES)[number]
export const MAX_EARLY_MS = 500

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
  /**
   * How many bars before a change NEXT appears, so singers can get ready. 0 shows
   * it for the whole section. Was a fixed 4 until 19 November 2026: too late.
   */
  nextLeadBars: z.int().min(0).max(64).default(8),
  /**
   * How many bars before a change the count runs: 1 gives 4, 3, 2, 1 on each beat
   * of the last bar (4/4); 2 gives 4, 3, 2, 1 every 2 beats across the last 2
   * bars. Was always 1 until 20 November 2026: singers found it too late.
   */
  countBars: z.int().min(1).max(4).default(2),
  showCountdown: z.boolean().default(true),
  showProgress: z.boolean().default(true),
  /** The NDI picture size. Match ProPresenter's output; 4K costs about four times the work. */
  outputSize: z.enum(OUTPUT_SIZES).default('1080p'),
  /**
   * Milliseconds the output runs ahead of the playhead while playing, to make up
   * for delay after StageCue: ProPresenter's buffering, the projector or LED wall.
   */
  earlyMs: z.int().min(0).max(MAX_EARLY_MS).default(0),
})
export type DisplaySettings = z.output<typeof displaySettingsSchema>

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = displaySettingsSchema.parse({})
