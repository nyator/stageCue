import {
  methods,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ClientMessagePayload,
  type ClientRole,
  type EngineStatus,
  type MethodName,
  type MethodParams,
  type MethodResult,
  type RequestErrorCode,
  type ServerMessagePayload,
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

export type EngineRequestErrorCode = RequestErrorCode | 'offline' | 'timeout' | 'invalid_response'

/** A failed request. The message is written for the person using the app. */
export class EngineRequestError extends Error {
  readonly code: EngineRequestErrorCode

  constructor(code: EngineRequestErrorCode, message: string) {
    super(message)
    this.name = 'EngineRequestError'
    this.code = code
  }
}

interface PendingRequest {
  method: MethodName
  resolve: (result: unknown) => void
  reject: (error: EngineRequestError) => void
  timer: ReturnType<typeof setTimeout>
}

const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 5_000
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Owns the WebSocket to the engine: handshake, validation, stale-message
 * rejection, requests, and reconnection with capped backoff. UI code only
 * reads state and calls request().
 */
export class EngineConnection {
  #url: string
  readonly #identity: ClientIdentity
  #state: EngineConnectionState = { phase: 'connecting' }
  #listeners = new Set<() => void>()
  #libraryListeners = new Set<(method: string) => void>()
  #pending = new Map<string, PendingRequest>()
  #socket: WebSocket | null = null
  #retryTimer: ReturnType<typeof setTimeout> | null = null
  #failedAttempts = 0
  #outgoingSeq = 0
  #lastServerSeq = -1
  #running = false

  constructor(url: string, identity: ClientIdentity) {
    this.#url = url
    this.#identity = identity
  }

  get url(): string {
    return this.#url
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
    const socket = this.#socket
    this.#socket = null
    socket?.close(1000, 'Client stopped')
    this.#failPending('offline', 'The connection to the engine was closed.')
  }

  /** Switches to a different engine address and reconnects. */
  setUrl(url: string): void {
    this.stop()
    this.#url = url
    this.#failedAttempts = 0
    this.#setState({ phase: 'connecting' })
    this.start()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): EngineConnectionState => this.#state

  /** Called after any client changes library data. */
  onLibraryChanged(listener: (method: string) => void): () => void {
    this.#libraryListeners.add(listener)
    return () => this.#libraryListeners.delete(listener)
  }

  request<M extends MethodName>(method: M, params: MethodParams<M>): Promise<MethodResult<M>> {
    if (this.#state.phase !== 'connected' || this.#socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new EngineRequestError('offline', 'StageCue is not connected to the engine.'),
      )
    }

    const requestId = crypto.randomUUID()
    return new Promise<MethodResult<M>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId)
        reject(new EngineRequestError('timeout', 'The engine did not answer in time.'))
      }, REQUEST_TIMEOUT_MS)

      this.#pending.set(requestId, {
        method,
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      })
      this.#send('request', { requestId, method, params })
    })
  }

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
      socket = new WebSocket(this.#url)
    } catch (error) {
      console.error('[engine] Invalid engine URL', this.#url, error)
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
      this.#failPending('offline', 'The connection to the engine was lost.')
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
      case 'response':
        this.#handleResponse(message.payload)
        break
      case 'library.changed':
        for (const listener of this.#libraryListeners) {
          listener(message.payload.method)
        }
        break
      case 'error':
        console.warn('[engine] Engine rejected a message', message.payload)
        break
    }
  }

  #handleResponse(payload: ServerMessagePayload<'response'>): void {
    const pending = this.#pending.get(payload.requestId)
    if (!pending) {
      return
    }
    this.#pending.delete(payload.requestId)
    clearTimeout(pending.timer)

    if (!payload.ok) {
      pending.reject(new EngineRequestError(payload.error.code, payload.error.message))
      return
    }

    const parsed = methods[pending.method].result.safeParse(payload.result)
    if (!parsed.success) {
      console.error('[engine] Invalid result', pending.method, parsed.error)
      pending.reject(
        new EngineRequestError('invalid_response', 'The engine sent data this app cannot read.'),
      )
      return
    }
    pending.resolve(parsed.data)
  }

  #failPending(code: EngineRequestErrorCode, message: string): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new EngineRequestError(code, message))
    }
    this.#pending.clear()
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
