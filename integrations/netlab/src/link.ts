import net from 'node:net'

/**
 * A TCP relay that behaves like a poor Wi-Fi link, for one hop: the Ableton
 * device to the engine, or the engine to a TV. Bytes keep their order, as TCP
 * guarantees; they are only held back.
 */
export interface LinkProfile {
  /** Every chunk waits at least this long. */
  delayMs: number
  /** Plus a random extra of up to this much. */
  jitterMs: number
  /** Every so often (ms), the link holds everything for `stallMs`: Wi-Fi power saving or retransmission. */
  stallEveryMs: number
  stallMs: number
}

export const CLEAN: LinkProfile = { delayMs: 0, jitterMs: 0, stallEveryMs: 0, stallMs: 0 }

export interface Link {
  port: number
  setProfile(profile: LinkProfile): void
  /** Cuts every connection now, and refuses new ones for `ms` (a dropout). */
  drop(ms: number): void
  close(): Promise<void>
}

class Direction {
  readonly #profile: () => LinkProfile
  readonly #write: (chunk: Buffer) => void
  readonly #queue: { at: number; chunk: Buffer }[] = []
  #timer: ReturnType<typeof setTimeout> | null = null
  #releaseAt = 0
  #stallUntil = 0
  #nextStall = 0

  constructor(profile: () => LinkProfile, write: (chunk: Buffer) => void) {
    this.#profile = profile
    this.#write = write
  }

  push(chunk: Buffer): void {
    const now = performance.now()
    const p = this.#profile()
    if (p.stallEveryMs > 0) {
      if (this.#nextStall === 0) this.#nextStall = now + Math.random() * p.stallEveryMs
      if (now >= this.#nextStall) {
        this.#stallUntil = now + p.stallMs
        this.#nextStall = now + p.stallEveryMs * (0.5 + Math.random())
      }
    }
    const wanted = Math.max(now + p.delayMs + Math.random() * p.jitterMs, this.#stallUntil)
    // In order: a chunk never overtakes the one before it, as on a real TCP link.
    this.#releaseAt = Math.max(this.#releaseAt, wanted)
    this.#queue.push({ at: this.#releaseAt, chunk })
    this.#schedule()
  }

  /** One timer for the oldest chunk, so chunks leave strictly in order. */
  #schedule(): void {
    if (this.#timer || this.#queue.length === 0) return
    this.#timer = setTimeout(
      () => {
        this.#timer = null
        const now = performance.now()
        while (this.#queue.length > 0 && this.#queue[0]!.at <= now + 0.5) {
          this.#write(this.#queue.shift()!.chunk)
        }
        this.#schedule()
      },
      Math.max(0, this.#queue[0]!.at - performance.now()),
    )
  }
}

export function openLink(target: number, initial: LinkProfile = CLEAN): Promise<Link> {
  let profile = initial
  let refuseUntil = 0
  const sockets = new Set<net.Socket>()

  const server = net.createServer((client) => {
    if (performance.now() < refuseUntil) {
      client.destroy()
      return
    }
    const upstream = net.connect(target, '127.0.0.1')
    client.setNoDelay(true)
    upstream.setNoDelay(true)
    sockets.add(client).add(upstream)
    const up = new Direction(
      () => profile,
      (chunk) => upstream.writable && upstream.write(chunk),
    )
    const down = new Direction(
      () => profile,
      (chunk) => client.writable && client.write(chunk),
    )
    client.on('data', (chunk) => up.push(chunk))
    upstream.on('data', (chunk) => down.push(chunk))
    const end = () => {
      client.destroy()
      upstream.destroy()
      sockets.delete(client)
      sockets.delete(upstream)
    }
    client.on('close', end).on('error', end)
    upstream.on('close', end).on('error', end)
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo
      resolve({
        port: address.port,
        setProfile(next) {
          profile = next
        },
        drop(ms) {
          refuseUntil = performance.now() + ms
          for (const socket of sockets) socket.destroy()
          sockets.clear()
        },
        close: () =>
          new Promise<void>((done) => {
            for (const socket of sockets) socket.destroy()
            server.close(() => done())
          }),
      })
    })
  })
}
