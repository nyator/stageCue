import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.ts'
import { migrate, openDatabase } from './db/database.ts'
import { LiveSession } from './live/live-session.ts'
import { startAnnouncer } from './discovery/announcer.ts'
import { createLogger } from './logger.ts'
import { lanAddresses } from './network.ts'
import { recordDeviceSeen } from './repositories/devices.ts'
import { createDispatcher } from './rpc/dispatcher.ts'
import { startEngineServer, type EngineServer } from './server/engine-server.ts'
import { createStaticHandler } from './server/static-files.ts'

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  const logger = createLogger(config.logLevel)

  mkdirSync(config.dataDir, { recursive: true })
  const databasePath = path.join(config.dataDir, 'stagecue.db')
  const db = openDatabase(databasePath)
  const schemaVersion = migrate(db)
  logger.info('Database ready', { path: databasePath, schemaVersion })

  const live = new LiveSession()
  const dawLog = logger.child('daw')
  // One warning per ignored connection, not one per message.
  const ignored = new Set<string>()
  const warnIgnored = (connectionId: string, name: string, following: string) => {
    if (ignored.has(connectionId)) return
    ignored.add(connectionId)
    dawLog.warn('Ignoring a second DAW bridge while another one is connected', {
      ignored: name,
      following,
    })
  }
  const addresses = lanAddresses(config.host)
  const instanceId = randomUUID()

  let server: EngineServer
  try {
    server = await startEngineServer({
      host: config.host,
      port: config.port,
      logger: logger.child('ws'),
      instanceId,
      startedAt: Date.now(),
      schemaVersion,
      addresses,
      dispatch: createDispatcher(db, live, logger.child('rpc')),
      liveSnapshot: () => live.snapshot(),
      httpHandler: createStaticHandler(config.screenDir),
      onClientIdentified: (client) => {
        recordDeviceSeen(db, {
          id: client.clientId,
          name: client.name,
          role: client.role,
          address: client.address,
          seenAt: new Date(),
        })
      },
      onDawMarkers: (connectionId, client, { project, markers }) => {
        dawLog.info('Markers received', { from: client.name, project, count: markers.length })
        const result = live.setMarkers(connectionId, client.name, project, markers)
        if (!result.accepted) warnIgnored(connectionId, client.name, result.following)
      },
      onDawTransport: (connectionId, client, transport) => {
        const result = live.setTransport(connectionId, client.name, transport)
        if (!result.accepted) warnIgnored(connectionId, client.name, result.following)
      },
      onClientLeft: (connectionId, client) => {
        if (client.role === 'daw_bridge') {
          dawLog.warn('DAW bridge disconnected', { from: client.name })
          live.bridgeDisconnected(connectionId)
        }
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
  const announcer = startAnnouncer({
    host: config.host,
    port: engine.port,
    instanceId,
    logger: logger.child('discovery'),
  })
  live.onChange(() => engine.broadcast('live.state', live.snapshot()))

  if (addresses.length > 0) {
    logger.info(
      'The Ableton device finds StageCue by itself; to type an address, use one of these',
      {
        addresses: addresses.map((address) => `${address}:${engine.port}`),
      },
    )
    logger.info('TVs and browsers can show the cue at', {
      urls: addresses.map((address) => `http://${address}:${engine.port}/`),
    })
  }

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    logger.info('Shutting down', { signal })
    await announcer.close()
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
