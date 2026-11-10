import {
  arrangementInputSchema,
  arrangementSchema,
  displaySettingsSchema,
  sectionInputSchema,
  setlistInputSchema,
  setlistSchema,
  setlistSummarySchema,
  songDetailSchema,
  songInputSchema,
  songSummarySchema,
} from '@stagecue/arrangement'
import { z } from 'zod'
import { clientRoleSchema } from './roles.ts'

interface MethodSpec {
  params: z.ZodType
  result: z.ZodType
  /** Mutations make the engine broadcast library.changed to every client. */
  mutates: boolean
}

const id = z.uuid()
const empty = z.strictObject({})
const byId = z.strictObject({ id })
const nothing = z.null()

export const deviceSchema = z.object({
  id,
  name: z.string(),
  role: clientRoleSchema,
  lastAddress: z.string().nullable(),
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
})
export type Device = z.infer<typeof deviceSchema>

/**
 * Every request a client can make. The engine validates params against these
 * schemas before running a handler; clients validate results before using them.
 */
export const methods = {
  'songs.list': { params: empty, result: z.array(songSummarySchema), mutates: false },
  'songs.get': { params: byId, result: songDetailSchema, mutates: false },
  'songs.create': { params: songInputSchema, result: songDetailSchema, mutates: true },
  'songs.update': {
    params: z.strictObject({ id, song: songInputSchema }),
    result: songDetailSchema,
    mutates: true,
  },
  'songs.delete': { params: byId, result: nothing, mutates: true },

  /** Replaces the song's sections with this ordered list. Omitted sections are deleted. */
  'sections.save': {
    params: z.strictObject({ songId: id, sections: z.array(sectionInputSchema).max(100) }),
    result: songDetailSchema,
    mutates: true,
  },

  'arrangements.create': {
    params: z.strictObject({
      songId: id,
      name: z.string().trim().min(1).max(60),
      /** Copy entries from this arrangement, or start with every section in song order. */
      copyFromId: id.nullable(),
    }),
    result: arrangementSchema,
    mutates: true,
  },
  'arrangements.save': {
    params: z.strictObject({ id, arrangement: arrangementInputSchema }),
    result: arrangementSchema,
    mutates: true,
  },
  'arrangements.delete': { params: byId, result: nothing, mutates: true },

  'setlists.list': { params: empty, result: z.array(setlistSummarySchema), mutates: false },
  'setlists.get': { params: byId, result: setlistSchema, mutates: false },
  'setlists.create': { params: setlistInputSchema, result: setlistSchema, mutates: true },
  'setlists.update': {
    params: z.strictObject({ id, setlist: setlistInputSchema }),
    result: setlistSchema,
    mutates: true,
  },
  'setlists.delete': { params: byId, result: nothing, mutates: true },

  /** Adds a song to the end of a setlist, copying the arrangement's sections. */
  'performances.add': {
    params: z.strictObject({ setlistId: id, songId: id, arrangementId: id }),
    result: setlistSchema,
    mutates: true,
  },
  'performances.remove': { params: byId, result: setlistSchema, mutates: true },
  'performances.move': {
    params: z.strictObject({ id, position: z.int().nonnegative() }),
    result: setlistSchema,
    mutates: true,
  },
  /** Re-copies sections from an arrangement. Only allowed while the performance is planned. */
  'performances.setArrangement': {
    params: z.strictObject({ id, arrangementId: id }),
    result: setlistSchema,
    mutates: true,
  },

  'settings.getDisplay': { params: empty, result: displaySettingsSchema, mutates: false },
  'settings.saveDisplay': {
    params: z.strictObject(displaySettingsSchema.shape),
    result: displaySettingsSchema,
    mutates: true,
  },

  'devices.list': { params: empty, result: z.array(deviceSchema), mutates: false },
} as const satisfies Record<string, MethodSpec>

export type MethodName = keyof typeof methods
export const METHOD_NAMES = Object.keys(methods) as [MethodName, ...MethodName[]]

/** What a client sends. */
export type MethodParams<M extends MethodName> = z.input<(typeof methods)[M]['params']>
/** What the engine handler receives after validation and normalisation. */
export type ParsedMethodParams<M extends MethodName> = z.output<(typeof methods)[M]['params']>
export type MethodResult<M extends MethodName> = z.output<(typeof methods)[M]['result']>

export const requestErrorCodeSchema = z.enum([
  'handshake_required',
  'invalid_params',
  'not_found',
  'conflict',
  'internal_error',
])
export type RequestErrorCode = z.infer<typeof requestErrorCodeSchema>
