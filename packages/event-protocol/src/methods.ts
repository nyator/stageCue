import { displaySettingsSchema } from '@stagecue/arrangement'
import { z } from 'zod'
import { clientRoleSchema } from './roles.ts'

interface MethodSpec {
  params: z.ZodType
  result: z.ZodType
  /** Changes stored data, so the engine broadcasts data.changed to every client. */
  mutates: boolean
}

const empty = z.strictObject({})

export const deviceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: clientRoleSchema,
  lastAddress: z.string().nullable(),
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
})
export type Device = z.infer<typeof deviceSchema>

/** Following the DAW, or a section the director picked by hand. */
export const cueModeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }),
  z.object({ mode: z.literal('manual'), index: z.int().nonnegative() }),
])

/**
 * Director controls. hold freezes the section on screen; next and previous
 * step from it; select jumps to a marker; auto follows the DAW again.
 */
export const overrideActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('auto') }),
  z.strictObject({ action: z.literal('hold') }),
  z.strictObject({ action: z.literal('next') }),
  z.strictObject({ action: z.literal('previous') }),
  z.strictObject({ action: z.literal('select'), index: z.int().nonnegative() }),
])
export type OverrideAction = z.infer<typeof overrideActionSchema>

/**
 * Every request a client can make. The engine validates params against these
 * schemas before running a handler; clients validate results before using them.
 */
export const methods = {
  'settings.getDisplay': { params: empty, result: displaySettingsSchema, mutates: false },
  'settings.saveDisplay': {
    params: z.strictObject(displaySettingsSchema.shape),
    result: displaySettingsSchema,
    mutates: true,
  },
  'devices.list': { params: empty, result: z.array(deviceSchema), mutates: false },
  /**
   * Takes the band off the output, or puts it back, whatever Ableton does. For
   * the media team: when only the click is playing, or the service goes off
   * script. The new state arrives as live.state.
   */
  'display.setHidden': {
    params: z.strictObject({ hidden: z.boolean() }),
    result: z.strictObject({ hidden: z.boolean() }),
    mutates: false,
  },
  /** Changes what the display shows. The new state arrives as live.state. */
  'cue.override': { params: overrideActionSchema, result: cueModeSchema, mutates: false },
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
