import type { DatabaseSync } from 'node:sqlite'
import {
  methods,
  type MethodName,
  type MethodResult,
  type ParsedMethodParams,
  type RequestErrorCode,
} from '@stagecue/event-protocol'
import { z } from 'zod'
import type { Logger } from '../logger.ts'
import {
  createArrangement,
  deleteArrangement,
  saveArrangement,
} from '../repositories/arrangements.ts'
import { listDevices } from '../repositories/devices.ts'
import {
  addPerformance,
  createSetlist,
  deleteSetlist,
  getSetlist,
  listSetlists,
  movePerformance,
  removePerformance,
  setPerformanceArrangement,
  updateSetlist,
} from '../repositories/setlists.ts'
import { getDisplaySettings, saveDisplaySettings } from '../repositories/settings.ts'
import {
  createSong,
  deleteSong,
  getSong,
  listSongs,
  saveSections,
  updateSong,
} from '../repositories/songs.ts'
import { EngineError } from '../repositories/support.ts'

type Handlers = {
  [M in MethodName]: (params: ParsedMethodParams<M>) => MethodResult<M>
}

function createHandlers(db: DatabaseSync): Handlers {
  return {
    'songs.list': () => listSongs(db),
    'songs.get': ({ id }) => getSong(db, id),
    'songs.create': (song) => createSong(db, song),
    'songs.update': ({ id, song }) => updateSong(db, id, song),
    'songs.delete': ({ id }) => deleteSong(db, id),
    'sections.save': ({ songId, sections }) => saveSections(db, songId, sections),
    'arrangements.create': (params) => createArrangement(db, params),
    'arrangements.save': ({ id, arrangement }) => saveArrangement(db, id, arrangement),
    'arrangements.delete': ({ id }) => deleteArrangement(db, id),
    'setlists.list': () => listSetlists(db),
    'setlists.get': ({ id }) => getSetlist(db, id),
    'setlists.create': (setlist) => createSetlist(db, setlist),
    'setlists.update': ({ id, setlist }) => updateSetlist(db, id, setlist),
    'setlists.delete': ({ id }) => deleteSetlist(db, id),
    'performances.add': (params) => addPerformance(db, params),
    'performances.remove': ({ id }) => removePerformance(db, id),
    'performances.move': ({ id, position }) => movePerformance(db, id, position),
    'performances.setArrangement': ({ id, arrangementId }) =>
      setPerformanceArrangement(db, id, arrangementId),
    'settings.getDisplay': () => getDisplaySettings(db),
    'settings.saveDisplay': (settings) => saveDisplaySettings(db, settings),
    'devices.list': () => listDevices(db),
  }
}

export type RequestOutcome =
  | { ok: true; result: unknown; mutated: boolean }
  | { ok: false; code: RequestErrorCode; message: string }

export type Dispatcher = (method: MethodName, params: unknown) => RequestOutcome

export function createDispatcher(db: DatabaseSync, logger: Logger): Dispatcher {
  const handlers = createHandlers(db)

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
