import {
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ClientMessagePayload,
  type ClientRole,
  type EngineStatus,
} from '@stagecue/event-protocol'

export type EngineConnectionState =
  | { phase: 'connecting' }
  | { phase: 'connected'; status: EngineStatus }
  | { phase: 'offline'; attempt: number }

export interface ClientIdentity {
  clientId: string
  role: ClientRole
  name: string
}

const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 5_000

/**
 * Owns the WebSocket to the engine: handshake, validation, stale-message
 * rejection, and reconnection with capped backoff. UI code only reads state.
 */
export class EngineConnection {
  readonly url: string
  readonly #identity: ClientIdentity
  #state: EngineConnectionState = { phase: 'connecting' }
  #listeners = new Set<() => void>()
  #socket: WebSocket | null = null
  #retryTimer: ReturnType<typeof setTimeout> | null = null
  #failedAttempts = 0
  #outgoingSeq = 0
  #lastServerSeq = -1
  #running = false

  constructor(url: string, identity: ClientIdentity) {
    this.url = url
    this.#identity = identity
  }

  start(): void {
    if (this.#running) {
      return
    }
    this.#running = true
    this.#open()
  }

  stop(): void {
    this.#running = false
    if (this.#retryTimer) {
      clearTimeout(this.#retryTimer)
      this.#retryTimer = null
    }
    this.#socket?.close(1000, 'Client stopped')
    this.#socket = null
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): EngineConnectionState => this.#state

  #setState(state: EngineConnectionState): void {
    this.#state = state
    for (const listener of this.#listeners) {
      listener()
    }
  }

  #open(): void {
    if (this.#state.phase !== 'offline') {
      this.#setState({ phase: 'connecting' })
    }

    let socket: WebSocket
    try {
      socket = new WebSocket(this.url)
    } catch (error) {
      console.error('[engine] Invalid engine URL', this.url, error)
      this.#scheduleReconnect()
      return
    }
    this.#socket = socket

    socket.addEventListener('open', () => {
      // Sequence numbers restart per connection; the engine tracks them per connection.
      this.#outgoingSeq = 0
      this.#send('hello', { ...this.#identity })
    })

    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this.#handleMessage(event.data)
      }
    })

    socket.addEventListener('close', () => {
      if (this.#socket !== socket) {
        return
      }
      this.#socket = null
      this.#scheduleReconnect()
    })
  }

  #send<T extends ClientMessage['type']>(type: T, payload: ClientMessagePayload<T>): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) {
      return
    }
    this.#outgoingSeq += 1
    this.#socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type,
        seq: this.#outgoingSeq,
        sentAt: Date.now(),
        payload,
      }),
    )
  }

  #handleMessage(raw: string): void {
    const result = parseServerMessage(raw)
    if (!result.ok) {
      console.warn('[engine] Ignoring invalid message', result.code, result.reason)
      return
    }

    const message = result.message

    // A welcome starts a new engine session, which may have restarted its counter.
    if (message.type !== 'welcome' && message.seq <= this.#lastServerSeq) {
      console.warn('[engine] Ignoring stale message', message.type, message.seq)
      return
    }
    this.#lastServerSeq = message.seq

    switch (message.type) {
      case 'welcome':
        this.#failedAttempts = 0
        this.#setState({ phase: 'connected', status: message.payload.status })
        break
      case 'engine.status':
        this.#setState({ phase: 'connected', status: message.payload })
        break
      case 'error':
        console.warn('[engine] Engine rejected a message', message.payload)
        break
    }
  }

  #scheduleReconnect(): void {
    if (!this.#running) {
      return
    }

    this.#failedAttempts += 1
    this.#setState({ phase: 'offline', attempt: this.#failedAttempts })

    const backoff = Math.min(RETRY_BASE_MS * 2 ** (this.#failedAttempts - 1), RETRY_MAX_MS)
    const jitter = Math.random() * 250
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null
      this.#open()
    }, backoff + jitter)
  }
}
