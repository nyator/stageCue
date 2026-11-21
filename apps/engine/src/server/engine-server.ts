import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ArrivalClock } from '@stagecue/arrangement'
import {
  CloseCode,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ClientMessagePayload,
  type ConnectedClient,
  type EngineStatus,
  type ErrorCode,
  type LiveState,
  type ServerMessage,
  type ServerMessagePayload,
} from '@stagecue/event-protocol'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { Logger } from '../logger.ts'
import type { Dispatcher } from '../rpc/dispatcher.ts'

export interface ClientIdentified extends ConnectedClient {
  address: string | null
}

export interface EngineServerOptions {
  host: string
  port: number
  logger: Logger
  instanceId: string
  startedAt: number
  schemaVersion: number
  /** Called once per connection after a valid hello. Errors are logged, not propagated. */
  onClientIdentified?: (client: ClientIdentified) => void
  /** Handles request messages. Without one, every request fails with internal_error. */
  dispatch?: Dispatcher
  /** Where other computers can reach this engine. Reported in the status. */
  addresses?: string[]
  /** Sent to each client right after its welcome. */
  liveSnapshot?: () => LiveState
  /** DAW messages from connections that identified as daw_bridge. Errors are logged. */
  onDawMarkers?: (
    connectionId: string,
    client: ConnectedClient,
    payload: ClientMessagePayload<'daw.markers'>,
  ) => void
  onDawTransport?: (
    connectionId: string,
    client: ConnectedClient,
    payload: ClientMessagePayload<'daw.transport'>,
    /** How long the report was held up on the way, by its sentAt (ArrivalClock). */
    latenessMs: number,
  ) => void
  /** Called when an identified connection closes. */
  onClientLeft?: (connectionId: string, client: ConnectedClient) => void
  /** Answers plain HTTP requests on the same port, such as the screen page. 404 without one. */
  httpHandler?: (request: IncomingMessage, response: ServerResponse) => void
  heartbeatIntervalMs?: number
  handshakeTimeoutMs?: number
}

export interface EngineServer {
  readonly host: string
  readonly port: number
  status(): EngineStatus
  /** Sends a message to every identified client. */
  broadcast<T extends ServerMessage['type']>(type: T, payload: ServerMessagePayload<T>): void
  close(): Promise<void>
}

interface Connection {
  id: string
  socket: WebSocket
  address: string | null
  alive: boolean
  lastClientSeq: number
  client: ConnectedClient | null
  handshakeTimer: NodeJS.Timeout | null
  /** How late this peer's messages arrive, from their sentAt. */
  arrival: ArrivalClock
  /** Lateness of the message being handled. */
  latenessMs: number
}

const CLOSE_GRACE_MS = 1_000

function rawToString(data: RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8')
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8')
  }

  return Buffer.from(data).toString('utf8')
}

export async function startEngineServer(options: EngineServerOptions): Promise<EngineServer> {
  const { logger } = options
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000
  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? 5_000
  const connections = new Set<Connection>()
  let outgoingSeq = 0

  // One port for both: WebSocket clients upgrade, browsers get the screen page.
  const httpServer = createServer((request, response) => {
    try {
      if (options.httpHandler) {
        options.httpHandler(request, response)
      } else {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('Not found')
      }
    } catch (error) {
      logger.error('HTTP request failed', { url: request.url, error })
      if (!response.headersSent) response.writeHead(500)
      response.end()
    }
  })
  await new Promise<void>((resolve, reject) => {
    httpServer.once('listening', resolve)
    httpServer.once('error', reject)
    httpServer.listen(options.port, options.host)
  })

  httpServer.on('error', (error) => {
    logger.error('HTTP server error', { error })
  })

  // Created only once the port is ours: before that, it would rethrow a failed listen
  // (such as the port being in use) as an unhandled error instead of letting it reject above.
  const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MESSAGE_BYTES })

  wss.on('error', (error) => {
    logger.error('WebSocket server error', { error })
  })

  const address = wss.address() as AddressInfo

  function status(): EngineStatus {
    const clients: ConnectedClient[] = []
    for (const connection of connections) {
      if (connection.client) {
        clients.push(connection.client)
      }
    }

    return {
      instanceId: options.instanceId,
      startedAt: options.startedAt,
      protocolVersion: PROTOCOL_VERSION,
      schemaVersion: options.schemaVersion,
      addresses: options.addresses ?? [],
      port: address.port,
      clients,
    }
  }

  function send<T extends ServerMessage['type']>(
    connection: Connection,
    type: T,
    payload: ServerMessagePayload<T>,
  ): void {
    if (connection.socket.readyState !== WebSocket.OPEN) {
      return
    }

    outgoingSeq += 1
    const message = { v: PROTOCOL_VERSION, type, seq: outgoingSeq, sentAt: Date.now(), payload }
    connection.socket.send(JSON.stringify(message), (error) => {
      if (error) {
        logger.warn('Failed to send message', { connectionId: connection.id, type, error })
      }
    })
  }

  function sendError(
    connection: Connection,
    code: ErrorCode,
    message: string,
    refSeq: number | null,
  ): void {
    logger.debug('Rejected client message', { connectionId: connection.id, code, message })
    send(connection, 'error', { code, message, refSeq })
  }

  function broadcastStatus(): void {
    const current = status()
    for (const connection of connections) {
      if (connection.client) {
        send(connection, 'engine.status', current)
      }
    }
  }

  function handleHello(connection: Connection, payload: ClientMessagePayload<'hello'>): void {
    if (connection.client) {
      sendError(connection, 'invalid_message', 'This connection has already said hello.', null)
      return
    }

    if (connection.handshakeTimer) {
      clearTimeout(connection.handshakeTimer)
      connection.handshakeTimer = null
    }

    connection.client = { clientId: payload.clientId, role: payload.role, name: payload.name }
    logger.info('Client identified', {
      connectionId: connection.id,
      ...connection.client,
      address: connection.address,
    })

    try {
      options.onClientIdentified?.({ ...connection.client, address: connection.address })
    } catch (error) {
      logger.error('Client identification hook failed', { connectionId: connection.id, error })
    }

    send(connection, 'welcome', {
      connectionId: connection.id,
      serverTime: Date.now(),
      status: status(),
    })
    if (options.liveSnapshot) {
      send(connection, 'live.state', options.liveSnapshot())
    }
    broadcastStatus()
  }

  function broadcast<T extends ServerMessage['type']>(
    type: T,
    payload: ServerMessagePayload<T>,
  ): void {
    for (const connection of connections) {
      if (connection.client) {
        send(connection, type, payload)
      }
    }
  }

  function handleDaw(
    connection: Connection,
    message: Extract<ClientMessage, { type: 'daw.markers' | 'daw.transport' }>,
  ): void {
    const client = connection.client
    if (client?.role !== 'daw_bridge') {
      sendError(
        connection,
        'invalid_message',
        'Only a connection that said hello as daw_bridge can send DAW messages.',
        message.seq,
      )
      return
    }
    try {
      if (message.type === 'daw.markers') {
        options.onDawMarkers?.(connection.id, client, message.payload)
      } else {
        options.onDawTransport?.(connection.id, client, message.payload, connection.latenessMs)
      }
    } catch (error) {
      logger.error('DAW message handler failed', { connectionId: connection.id, error })
    }
  }

  function handleRequest(connection: Connection, payload: ClientMessagePayload<'request'>): void {
    const { requestId, method } = payload

    if (!connection.client) {
      send(connection, 'response', {
        requestId,
        ok: false,
        error: { code: 'handshake_required', message: 'Say hello before making requests.' },
      })
      return
    }

    const outcome = options.dispatch
      ? options.dispatch(method, payload.params)
      : ({ ok: false, code: 'internal_error', message: 'Requests are not available.' } as const)

    if (!outcome.ok) {
      logger.debug('Request rejected', { method, code: outcome.code, message: outcome.message })
      send(connection, 'response', {
        requestId,
        ok: false,
        error: { code: outcome.code, message: outcome.message },
      })
      return
    }

    send(connection, 'response', { requestId, ok: true, result: outcome.result })
    if (outcome.mutated) {
      logger.info('Data changed', { method, clientId: connection.client.clientId })
      broadcast('data.changed', { method })
    }
  }

  function handleMessage(connection: Connection, data: RawData, isBinary: boolean): void {
    if (isBinary) {
      sendError(connection, 'invalid_message', 'Binary frames are not supported.', null)
      return
    }

    const result = parseClientMessage(rawToString(data))
    if (!result.ok) {
      sendError(connection, result.code, result.reason, null)
      if (result.code === 'unsupported_version') {
        connection.socket.close(CloseCode.unsupportedVersion, 'Unsupported protocol version')
      }
      return
    }

    const message = result.message
    // Every message teaches the clock what "on time" is, so measure them all.
    connection.latenessMs = connection.arrival.lateness(message.sentAt, Date.now())
    if (message.seq <= connection.lastClientSeq) {
      sendError(
        connection,
        'stale_message',
        `Sequence ${message.seq} is not newer than ${connection.lastClientSeq}.`,
        message.seq,
      )
      return
    }
    connection.lastClientSeq = message.seq

    switch (message.type) {
      case 'hello':
        handleHello(connection, message.payload)
        break
      case 'request':
        handleRequest(connection, message.payload)
        break
      case 'daw.markers':
      case 'daw.transport':
        handleDaw(connection, message)
        break
    }
  }

  wss.on('connection', (socket, request) => {
    const connection: Connection = {
      id: randomUUID(),
      socket,
      address: request.socket.remoteAddress ?? null,
      alive: true,
      lastClientSeq: -1,
      client: null,
      handshakeTimer: null,
      arrival: new ArrivalClock(),
      latenessMs: 0,
    }
    connections.add(connection)
    logger.debug('Connection opened', { connectionId: connection.id, address: connection.address })

    connection.handshakeTimer = setTimeout(() => {
      logger.warn('Closing connection that never said hello', { connectionId: connection.id })
      socket.close(CloseCode.handshakeTimeout, 'Handshake timeout')
    }, handshakeTimeoutMs)

    socket.on('pong', () => {
      connection.alive = true
    })

    socket.on('message', (data, isBinary) => {
      try {
        handleMessage(connection, data, isBinary)
      } catch (error) {
        logger.error('Unhandled error while processing message', {
          connectionId: connection.id,
          error,
        })
        sendError(connection, 'internal_error', 'The engine could not process this message.', null)
      }
    })

    socket.on('error', (error) => {
      logger.warn('Connection error', { connectionId: connection.id, error })
    })

    socket.on('close', (code) => {
      if (connection.handshakeTimer) {
        clearTimeout(connection.handshakeTimer)
      }
      connections.delete(connection)
      logger.info('Connection closed', {
        connectionId: connection.id,
        code,
        clientId: connection.client?.clientId,
      })
      if (connection.client) {
        try {
          options.onClientLeft?.(connection.id, connection.client)
        } catch (error) {
          logger.error('Client left hook failed', { connectionId: connection.id, error })
        }
        broadcastStatus()
      }
    })
  })

  // Browsers answer protocol-level pings automatically, so this detects dead peers
  // (sleeping laptops, dropped Wi-Fi) without any client-side code.
  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.alive) {
        logger.warn('Terminating unresponsive connection', { connectionId: connection.id })
        connection.socket.terminate()
        continue
      }
      connection.alive = false
      connection.socket.ping()
    }
  }, heartbeatIntervalMs)
  heartbeat.unref()

  logger.info('Listening for connections', { host: options.host, port: address.port })

  return {
    host: options.host,
    port: address.port,
    status,
    broadcast,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat)
        for (const connection of connections) {
          connection.socket.close(CloseCode.shuttingDown, 'Engine shutting down')
        }
        const forceClose = setTimeout(() => {
          for (const connection of connections) {
            connection.socket.terminate()
          }
        }, CLOSE_GRACE_MS)
        forceClose.unref()
        wss.close(() => {
          httpServer.close(() => {
            clearTimeout(forceClose)
            resolve()
          })
          // Browsers keep idle HTTP connections open; do not wait for them.
          httpServer.closeAllConnections()
        })
      }),
  }
}
