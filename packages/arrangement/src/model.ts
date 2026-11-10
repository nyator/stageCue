import { z } from 'zod'

export const SECTION_TYPES = [
  'intro',
  'verse',
  'pre_chorus',
  'chorus',
  'bridge',
  'instrumental',
  'vamp',
  'tag',
  'interlude',
  'ending',
  'other',
] as const
export const sectionTypeSchema = z.enum(SECTION_TYPES)
export type SectionType = z.infer<typeof sectionTypeSchema>

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
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
  other: 'Other',
}

export const VOCAL_PARTS = [
  'lead',
  'soprano',
  'alto',
  'tenor',
  'bass',
  'full_choir',
  'instrumental',
] as const
export const vocalPartSchema = z.enum(VOCAL_PARTS)
export type VocalPart = z.infer<typeof vocalPartSchema>

export const VOCAL_PART_LABELS: Record<VocalPart, string> = {
  lead: 'Lead',
  soprano: 'Soprano',
  alto: 'Alto',
  tenor: 'Tenor',
  bass: 'Bass',
  full_choir: 'Full choir',
  instrumental: 'Instrumental',
}

export const PERFORMANCE_STATUSES = ['planned', 'live', 'completed', 'cancelled'] as const
export const performanceStatusSchema = z.enum(PERFORMANCE_STATUSES)
export type PerformanceStatus = z.infer<typeof performanceStatusSchema>

// Shared field rules. Text inputs are trimmed; optional text turns '' into null.
const id = z.uuid()
const timestamp = z.iso.datetime()
const requiredText = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value))

const musicalKey = optionalText(12)
const tempoBpm = z.number().min(20).max(400).nullable()
const bars = z.int().min(1).max(9_999)
const lengthBars = z.int().min(1).max(999)
const repeatCount = z.int().min(1).max(99)
const position = z.int().nonnegative()

export const vocalPartsSchema = z
  .array(vocalPartSchema)
  .refine((parts) => new Set(parts).size === parts.length, 'Vocal parts must not repeat.')

export const timeSignatureSchema = z.object({
  numerator: z.int().min(1).max(32),
  denominator: z.literal([1, 2, 4, 8, 16, 32]),
})
export type TimeSignature = z.infer<typeof timeSignatureSchema>

// ---------------------------------------------------------------------------
// Stored entities, as the engine returns them
// ---------------------------------------------------------------------------

export const songSectionSchema = z.object({
  id,
  songId: id,
  name: z.string(),
  type: sectionTypeSchema,
  lengthBars,
  vocalParts: vocalPartsSchema,
  instructions: z.string().nullable(),
  notes: z.string().nullable(),
  position,
})
export type SongSection = z.infer<typeof songSectionSchema>

/** One placement of a song section in an arrangement. Null overrides inherit from the section. */
export const arrangementEntrySchema = z.object({
  id,
  songSectionId: id,
  position,
  startBar: bars,
  endBar: bars,
  repeatCount,
  vocalParts: vocalPartsSchema.nullable(),
  instructions: z.string().nullable(),
  notes: z.string().nullable(),
})
export type ArrangementEntry = z.infer<typeof arrangementEntrySchema>

export const arrangementSchema = z.object({
  id,
  songId: id,
  name: z.string(),
  tempoBpm,
  songKey: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  entries: z.array(arrangementEntrySchema),
})
export type Arrangement = z.infer<typeof arrangementSchema>

export const songSchema = z.object({
  id,
  title: z.string(),
  artist: z.string().nullable(),
  defaultKey: z.string().nullable(),
  tempoBpm,
  timeSignature: timeSignatureSchema,
  notes: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})
export type Song = z.infer<typeof songSchema>

export const songSummarySchema = songSchema.extend({
  sectionCount: z.int().nonnegative(),
  arrangementCount: z.int().nonnegative(),
})
export type SongSummary = z.infer<typeof songSummarySchema>

export const songDetailSchema = songSchema.extend({
  sections: z.array(songSectionSchema),
  arrangements: z.array(arrangementSchema),
})
export type SongDetail = z.infer<typeof songDetailSchema>

/** A section as copied into a performance: fully resolved, no inheritance. */
export const performanceSectionSchema = z.object({
  id,
  songSectionId: id.nullable(),
  position,
  name: z.string(),
  type: sectionTypeSchema,
  startBar: bars,
  endBar: bars,
  repeatCount,
  vocalParts: vocalPartsSchema,
  instructions: z.string().nullable(),
  notes: z.string().nullable(),
})
export type PerformanceSection = z.infer<typeof performanceSectionSchema>

export const performanceSchema = z.object({
  id,
  setlistId: id.nullable(),
  position: position.nullable(),
  songId: id,
  songTitle: z.string(),
  songKey: z.string().nullable(),
  /** Arrangement tempo if set, otherwise the song default. */
  tempoBpm,
  timeSignature: timeSignatureSchema,
  arrangementId: id.nullable(),
  arrangementName: z.string().nullable(),
  status: performanceStatusSchema,
  notes: z.string().nullable(),
  sections: z.array(performanceSectionSchema),
})
export type Performance = z.infer<typeof performanceSchema>

export const setlistSummarySchema = z.object({
  id,
  name: z.string(),
  serviceDate: z.iso.date().nullable(),
  notes: z.string().nullable(),
  performanceCount: z.int().nonnegative(),
  updatedAt: timestamp,
})
export type SetlistSummary = z.infer<typeof setlistSummarySchema>

export const setlistSchema = setlistSummarySchema.extend({
  performances: z.array(performanceSchema),
})
export type Setlist = z.infer<typeof setlistSchema>

// ---------------------------------------------------------------------------
// Inputs, as clients send them
// ---------------------------------------------------------------------------

export const songInputSchema = z.strictObject({
  title: requiredText(120),
  artist: optionalText(120),
  defaultKey: musicalKey,
  tempoBpm,
  timeSignature: timeSignatureSchema,
  notes: optionalText(2_000),
})
export type SongInput = z.input<typeof songInputSchema>

export const sectionInputSchema = z.strictObject({
  /** Null for a new section. */
  id: id.nullable(),
  name: requiredText(60),
  type: sectionTypeSchema,
  lengthBars,
  vocalParts: vocalPartsSchema,
  instructions: optionalText(280),
  notes: optionalText(1_000),
})
export type SectionInput = z.input<typeof sectionInputSchema>

export const arrangementEntryInputSchema = z.strictObject({
  songSectionId: id,
  barsPerPass: lengthBars,
  repeatCount,
  vocalParts: vocalPartsSchema.nullable(),
  instructions: optionalText(280),
  notes: optionalText(1_000),
})
export type ArrangementEntryInput = z.input<typeof arrangementEntryInputSchema>

export const arrangementInputSchema = z.strictObject({
  name: requiredText(60),
  tempoBpm,
  songKey: musicalKey,
  notes: optionalText(2_000),
  /** DAW bar where the first entry starts. Later entries follow without gaps. */
  startBar: bars,
  entries: z.array(arrangementEntryInputSchema).max(200),
})
export type ArrangementInput = z.input<typeof arrangementInputSchema>

export const setlistInputSchema = z.strictObject({
  name: requiredText(80),
  serviceDate: z.iso.date().nullable(),
  notes: optionalText(2_000),
})
export type SetlistInput = z.input<typeof setlistInputSchema>

// ---------------------------------------------------------------------------
// Display settings
// ---------------------------------------------------------------------------

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex colour.')

export const displaySettingsSchema = z.object({
  position: z.enum(['top', 'bottom']),
  background: hexColor,
  text: hexColor,
  accent: hexColor,
  backgroundOpacity: z.number().min(0).max(1),
  scale: z.number().min(0.75).max(1.5),
  showNext: z.boolean(),
  showVocalParts: z.boolean(),
  showRepeat: z.boolean(),
  showInstructions: z.boolean(),
})
export type DisplaySettings = z.infer<typeof displaySettingsSchema>

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  position: 'top',
  background: '#0b0f0d',
  text: '#f2f5f3',
  accent: '#5fd49a',
  backgroundOpacity: 0.85,
  scale: 1,
  showNext: true,
  showVocalParts: true,
  showRepeat: true,
  showInstructions: true,
}
