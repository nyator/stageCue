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
  hello(seq?: number, name?: string, role?: 'desktop' | 'daw_bridge'): void
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
    hello: (seq = 1, name = 'Test client', role = 'desktop') =>
      send({
        v: PROTOCOL_VERSION,
        type: 'hello',
        seq,
        sentAt: Date.now(),
        payload: { clientId, role, name },
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

  it('answers requests and tells every client when the library changes', async () => {
    const dispatch = vi.fn((method: string) =>
      method === 'settings.saveDisplay'
        ? ({ ok: true, result: { created: true }, mutated: true } as const)
        : ({ ok: false, code: 'not_found', message: 'Gone.' } as const),
    )
    const engine = await start({ dispatch })
    const director = await connect(engine)
    const operator = await connect(engine)
    director.hello(1, 'Director')
    await director.next() // welcome
    await director.next() // status
    operator.hello(1, 'Operator')
    await operator.next() // welcome
    await operator.next() // status
    await director.next() // status after operator joined

    const request = (seq: number, requestId: string, method: string) =>
      director.send({
        v: PROTOCOL_VERSION,
        type: 'request',
        seq,
        sentAt: Date.now(),
        payload: { requestId, method, params: {} },
      })

    request(2, 'a', 'devices.list')
    expect(await director.next()).toMatchObject({
      type: 'response',
      payload: { requestId: 'a', ok: false, error: { code: 'not_found' } },
    })

    request(3, 'b', 'settings.saveDisplay')
    expect(await director.next()).toMatchObject({
      type: 'response',
      payload: { requestId: 'b', ok: true, result: { created: true } },
    })
    expect(await director.next()).toMatchObject({ type: 'data.changed' })
    expect(await operator.next()).toMatchObject({
      type: 'data.changed',
      payload: { method: 'settings.saveDisplay' },
    })
  })

  it('refuses requests before hello', async () => {
    const client = await connect(await start())
    client.send({
      v: PROTOCOL_VERSION,
      type: 'request',
      seq: 1,
      sentAt: Date.now(),
      payload: { requestId: 'x', method: 'devices.list', params: {} },
    })
    expect(await client.next()).toMatchObject({
      type: 'response',
      payload: { ok: false, error: { code: 'handshake_required' } },
    })
  })

  it('reports where it can be reached', async () => {
    const engine = await start({ addresses: ['192.168.1.20'] })
    expect(engine.status()).toMatchObject({ addresses: ['192.168.1.20'], port: engine.port })
  })

  it('sends the live state right after the welcome', async () => {
    const snapshot = {
      daw: { connected: false, name: null, project: null },
      markers: [{ name: 'Intro', beat: 0 }],
      transport: null,
      mode: { mode: 'auto' as const },
      hidden: false,
    }
    const client = await connect(await start({ liveSnapshot: () => snapshot }))
    client.hello()
    expect(await client.next()).toMatchObject({ type: 'welcome' })
    expect(await client.next()).toMatchObject({ type: 'live.state', payload: snapshot })
  })

  it('accepts DAW messages only from a daw_bridge connection', async () => {
    const onDawMarkers = vi.fn()
    const onDawTransport = vi.fn()
    const onClientLeft = vi.fn()
    const engine = await start({ onDawMarkers, onDawTransport, onClientLeft })
    const markers = { project: 'Sunday', markers: [{ name: 'Chorus', beat: 16 }] }
    const transport = {
      playing: true,
      beat: 4,
      tempo: 72,
      timeSignature: { numerator: 4, denominator: 4 },
    }
    const daw = (client: TestClient, seq: number, type: string, payload: unknown) =>
      client.send({ v: PROTOCOL_VERSION, type, seq, sentAt: Date.now(), payload })

    const desktop = await connect(engine)
    desktop.hello(1, 'Booth')
    await desktop.next() // welcome
    await desktop.next() // status
    daw(desktop, 2, 'daw.markers', markers)
    expect(await desktop.next()).toMatchObject({
      type: 'error',
      payload: { code: 'invalid_message', refSeq: 2 },
    })
    expect(onDawMarkers).not.toHaveBeenCalled()

    const bridge = await connect(engine)
    bridge.hello(1, 'Ableton', 'daw_bridge')
    await bridge.next() // welcome
    daw(bridge, 2, 'daw.markers', markers)
    daw(bridge, 3, 'daw.transport', transport)
    await vi.waitFor(() => expect(onDawTransport).toHaveBeenCalled())
    expect(onDawMarkers).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ role: 'daw_bridge', name: 'Ableton' }),
      markers,
    )
    expect(onDawTransport.mock.calls[0]?.[2]).toEqual(transport)

    bridge.socket.close()
    await vi.waitFor(() =>
      expect(onClientLeft).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ role: 'daw_bridge' }),
      ),
    )
  })

  it('broadcasts to identified clients only', async () => {
    const engine = await start()
    const identified = await connect(engine)
    identified.hello()
    await identified.next() // welcome
    await identified.next() // status
    const anonymous = await connect(engine)
    let anonymousReceived = 0
    anonymous.socket.on('message', () => (anonymousReceived += 1))

    engine.broadcast('data.changed', { method: 'settings.saveDisplay' })
    expect(await identified.next()).toMatchObject({ type: 'data.changed' })
    expect(anonymousReceived).toBe(0)
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
