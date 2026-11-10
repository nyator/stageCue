import {
  CloseCode,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '@stagecue/event-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { createLogger } from '../logger.ts'
import { startEngineServer, type EngineServer, type EngineServerOptions } from './engine-server.ts'

const silent = createLogger('silent')
let server: EngineServer | null = null
const sockets: WebSocket[] = []

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.terminate()
  }
  await server?.close()
  server = null
})

async function start(overrides: Partial<EngineServerOptions> = {}): Promise<EngineServer> {
  server = await startEngineServer({
    host: '127.0.0.1',
    port: 0,
    logger: silent,
    instanceId: crypto.randomUUID(),
    startedAt: Date.now(),
    schemaVersion: 1,
    ...overrides,
  })
  return server
}

interface TestClient {
  socket: WebSocket
  next(): Promise<ServerMessage>
  send(value: unknown): void
  hello(seq?: number, name?: string): void
  closed: Promise<number>
}

async function connect(engine: EngineServer, { autoPong = true } = {}): Promise<TestClient> {
  const socket = new WebSocket(`ws://127.0.0.1:${engine.port}`, { autoPong })
  sockets.push(socket)
  const queue: ServerMessage[] = []
  const waiters: ((message: ServerMessage) => void)[] = []

  socket.on('message', (data) => {
    const result = parseServerMessage(String(data))
    if (!result.ok) {
      throw new Error(`Engine sent an invalid message: ${result.reason}`)
    }
    const waiter = waiters.shift()
    if (waiter) {
      waiter(result.message)
    } else {
      queue.push(result.message)
    }
  })

  const closed = new Promise<number>((resolve) => socket.once('close', resolve))
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })

  const clientId = crypto.randomUUID()
  const send = (value: unknown): void =>
    socket.send(typeof value === 'string' ? value : JSON.stringify(value))

  return {
    socket,
    closed,
    send,
    next: () => {
      const queued = queue.shift()
      return queued ? Promise.resolve(queued) : new Promise((resolve) => waiters.push(resolve))
    },
    hello: (seq = 1, name = 'Test client') =>
      send({
        v: PROTOCOL_VERSION,
        type: 'hello',
        seq,
        sentAt: Date.now(),
        payload: { clientId, role: 'desktop', name },
      }),
  }
}

describe('engine server', () => {
  it('welcomes a client that says hello and lists it in the status', async () => {
    const engine = await start()
    const client = await connect(engine)
    client.hello()

    const welcome = await client.next()
    expect(welcome.type).toBe('welcome')
    if (welcome.type !== 'welcome') return
    expect(welcome.payload.status.clients).toEqual([
      expect.objectContaining({ role: 'desktop', name: 'Test client' }),
    ])
    expect(welcome.payload.status.schemaVersion).toBe(1)
  })

  it('reports invalid input without dropping the connection', async () => {
    const client = await connect(await start())

    client.send('not json')
    expect(await client.next()).toMatchObject({
      type: 'error',
      payload: { code: 'invalid_json' },
    })

    client.send({ v: PROTOCOL_VERSION, type: 'hello', seq: 1, sentAt: 0, payload: {} })
    expect(await client.next()).toMatchObject({
      type: 'error',
      payload: { code: 'invalid_message' },
    })

    client.hello(2)
    expect(await client.next()).toMatchObject({ type: 'welcome' })
  })

  it('rejects messages whose sequence number is not newer', async () => {
    const client = await connect(await start())
    client.hello(5)
    await client.next() // welcome
    await client.next() // status broadcast

    client.hello(5)
    expect(await client.next()).toMatchObject({
      type: 'error',
      payload: { code: 'stale_message', refSeq: 5 },
    })
  })

  it('closes connections that speak another protocol version', async () => {
    const client = await connect(await start())
    client.send({ v: 99, type: 'hello', seq: 1, sentAt: 0, payload: {} })

    expect(await client.next()).toMatchObject({ payload: { code: 'unsupported_version' } })
    expect(await client.closed).toBe(CloseCode.unsupportedVersion)
  })

  it('closes connections that never say hello', async () => {
    const client = await connect(await start({ handshakeTimeoutMs: 50 }))
    expect(await client.closed).toBe(CloseCode.handshakeTimeout)
  })

  it('broadcasts status when clients join and leave', async () => {
    const engine = await start()
    const first = await connect(engine)
    first.hello(1, 'Booth')
    await first.next() // welcome
    await first.next() // status with one client

    const second = await connect(engine)
    second.hello(1, 'Stage')
    const joined = await first.next()
    expect(joined.type === 'engine.status' && joined.payload.clients).toHaveLength(2)

    second.socket.close()
    const left = await first.next()
    expect(left.type === 'engine.status' && left.payload.clients).toEqual([
      expect.objectContaining({ name: 'Booth' }),
    ])
  })

  it('keeps the connection when the identification hook throws', async () => {
    const onClientIdentified = vi.fn(() => {
      throw new Error('database is locked')
    })
    const client = await connect(await start({ onClientIdentified }))
    client.hello()

    expect(await client.next()).toMatchObject({ type: 'welcome' })
    expect(onClientIdentified).toHaveBeenCalledOnce()
  })

  it('terminates peers that stop answering heartbeats', async () => {
    // A frozen peer: never answers pings.
    const client = await connect(await start({ heartbeatIntervalMs: 30 }), { autoPong: false })

    expect(await client.closed).toBe(1006)
  })

  it('reports a clear error when the port is taken', async () => {
    const engine = await start()
    await expect(
      startEngineServer({
        host: '127.0.0.1',
        port: engine.port,
        logger: silent,
        instanceId: crypto.randomUUID(),
        startedAt: Date.now(),
        schemaVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })
})
