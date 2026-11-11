import path from 'node:path'
import { DEFAULT_ENGINE_PORT } from '@stagecue/event-protocol'
import { z } from 'zod'
import { LOG_LEVELS, type LogLevel } from './logger.ts'

export interface EngineConfig {
  host: string
  port: number
  dataDir: string
  logLevel: LogLevel
  /** The built screen page served to TVs and browsers (apps/screen/dist). */
  screenDir: string
}

const envSchema = z.object({
  // All interfaces by default: the Ableton device on the music computer connects over the network.
  // Set to 127.0.0.1 to accept connections from this computer only.
  STAGECUE_ENGINE_HOST: z.string().trim().min(1).default('0.0.0.0'),
  STAGECUE_ENGINE_PORT: z.coerce.number().int().min(0).max(65_535).default(DEFAULT_ENGINE_PORT),
  STAGECUE_DATA_DIR: z.string().trim().min(1).optional(),
  STAGECUE_LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  STAGECUE_SCREEN_DIR: z.string().trim().min(1).optional(),
})

const defaultDataDir = path.resolve(import.meta.dirname, '../.data')
const defaultScreenDir = path.resolve(import.meta.dirname, '../../screen/dist')

export function loadConfig(env: NodeJS.ProcessEnv): EngineConfig {
  const result = envSchema.safeParse(env)

  if (!result.success) {
    throw new Error(`Invalid engine configuration:\n${z.prettifyError(result.error)}`)
  }

  const parsed = result.data

  return {
    host: parsed.STAGECUE_ENGINE_HOST,
    port: parsed.STAGECUE_ENGINE_PORT,
    dataDir: path.resolve(parsed.STAGECUE_DATA_DIR ?? defaultDataDir),
    logLevel: parsed.STAGECUE_LOG_LEVEL,
    screenDir: path.resolve(parsed.STAGECUE_SCREEN_DIR ?? defaultScreenDir),
  }
}
