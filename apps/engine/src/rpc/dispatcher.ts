import type { DatabaseSync } from 'node:sqlite'
import {
  methods,
  type MethodName,
  type MethodResult,
  type ParsedMethodParams,
  type RequestErrorCode,
} from '@stagecue/event-protocol'
import { z } from 'zod'
import type { LiveSession } from '../live/live-session.ts'
import type { Logger } from '../logger.ts'
import { listDevices } from '../repositories/devices.ts'
import { getDisplaySettings, saveDisplaySettings } from '../repositories/settings.ts'
import { EngineError } from '../repositories/support.ts'

type Handlers = {
  [M in MethodName]: (params: ParsedMethodParams<M>) => MethodResult<M>
}

function createHandlers(db: DatabaseSync, live: LiveSession): Handlers {
  return {
    'settings.getDisplay': () => getDisplaySettings(db),
    'settings.saveDisplay': (settings) => saveDisplaySettings(db, settings),
    'devices.list': () => listDevices(db),
    'cue.override': (action) => live.override(action),
  }
}

export type RequestOutcome =
  | { ok: true; result: unknown; mutated: boolean }
  | { ok: false; code: RequestErrorCode; message: string }

export type Dispatcher = (method: MethodName, params: unknown) => RequestOutcome

export function createDispatcher(db: DatabaseSync, live: LiveSession, logger: Logger): Dispatcher {
  const handlers = createHandlers(db, live)

  return (method, rawParams) => {
    const spec = methods[method]
    const parsed = spec.params.safeParse(rawParams)
    if (!parsed.success) {
      return { ok: false, code: 'invalid_params', message: z.prettifyError(parsed.error) }
    }

    try {
      const handler = handlers[method] as (params: unknown) => unknown
      return { ok: true, result: handler(parsed.data), mutated: spec.mutates }
    } catch (error) {
      if (error instanceof EngineError) {
        return { ok: false, code: error.code, message: error.message }
      }
      logger.error('Request failed', { method, error })
      return {
        ok: false,
        code: 'internal_error',
        message: 'The engine could not complete that request. Check the engine log for details.',
      }
    }
  }
}
