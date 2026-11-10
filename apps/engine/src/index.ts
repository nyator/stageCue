import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.ts'
import { migrate, openDatabase } from './db/database.ts'
import { recordDeviceSeen } from './db/devices.ts'
import { createLogger } from './logger.ts'
import { startEngineServer, type EngineServer } from './server/engine-server.ts'

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  const logger = createLogger(config.logLevel)

  mkdirSync(config.dataDir, { recursive: true })
  const databasePath = path.join(config.dataDir, 'stagecue.db')
  const db = openDatabase(databasePath)
  const schemaVersion = migrate(db)
  logger.info('Database ready', { path: databasePath, schemaVersion })

  let server: EngineServer
  try {
    server = await startEngineServer({
      host: config.host,
      port: config.port,
      logger: logger.child('ws'),
      instanceId: randomUUID(),
      startedAt: Date.now(),
      schemaVersion,
      onClientIdentified: (client) => {
        recordDeviceSeen(db, {
          id: client.clientId,
          name: client.name,
          role: client.role,
          address: client.address,
          seenAt: new Date(),
        })
      },
    })
  } catch (error) {
    db.close()
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(
        `Port ${config.port} on ${config.host} is already in use. Is another engine running? Set STAGECUE_ENGINE_PORT to use a different port.`,
        { cause: error },
      )
    }
    throw error
  }

  const engine = server
  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    logger.info('Shutting down', { signal })
    await engine.close()
    db.close()
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
