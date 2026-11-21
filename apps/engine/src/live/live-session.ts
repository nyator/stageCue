import {
  beatAt,
  COAST_MS,
  computeCueView,
  toCues,
  type CueMode,
  type Marker,
  type Transport,
} from '@stagecue/arrangement'
import type { LiveState, OverrideAction } from '@stagecue/event-protocol'
import { EngineError } from '../repositories/support.ts'

/** What one connected bridge last reported, kept so StageCue can fall back to it. */
interface BridgeRecord {
  name: string
  project: string | null
  /** Null until this bridge has sent its markers. */
  markers: Marker[] | null
  transport: { value: Transport; receivedAt: number } | null
}

/** Whether a DAW message was used, or ignored because another bridge is followed. */
export type BridgeResult = { accepted: true } | { accepted: false; following: string }

/** Runs `run` after `ms`; returns a function that cancels it. */
export type Schedule = (run: () => void, ms: number) => () => void

const realSchedule: Schedule = (run, ms) => {
  const timer = setTimeout(run, ms)
  timer.unref?.()
  return () => clearTimeout(timer)
}

/**
 * What is happening right now: the DAW's markers and playhead, and whether the
 * director has taken over. StageCue never controls the DAW; it only listens.
 */
export class LiveSession {
  readonly #now: () => number
  readonly #listeners = new Set<() => void>()
  /** Every bridge that has spoken, in the order they first did; kept until it disconnects. */
  readonly #bridges = new Map<string, BridgeRecord>()
  #followed: string | null = null
  #project: string | null = null
  #markers: Marker[] = []
  #transport: { value: Transport; receivedAt: number } | null = null
  #mode: CueMode = { mode: 'auto' }
  #hidden = false
  readonly #schedule: Schedule
  /** Cancels the pending stop while coasting after the followed bridge dropped. */
  #cancelCoast: (() => void) | null = null

  constructor(now: () => number = Date.now, schedule: Schedule = realSchedule) {
    this.#now = now
    this.#schedule = schedule
  }

  /** Called after any change, so the server can broadcast the new state. */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #changed(): void {
    for (const listener of this.#listeners) listener()
  }

  /**
   * StageCue follows one bridge at a time: the first to speak, for as long as it
   * stays connected. A connected bridge that is quiet (Ableton stopped sends
   * nothing) is still in charge, so another device on the network cannot take
   * over the screen by sending while Ableton is stopped. Dead connections are
   * closed by the server's heartbeat, which then hands over (bridgeDisconnected).
   * Following whichever spoke last made the band flicker between two positions.
   */
  #record(connectionId: string, name: string): BridgeResult {
    if (!this.#bridges.has(connectionId)) {
      this.#bridges.set(connectionId, { name, project: null, markers: null, transport: null })
    }
    if (this.#followed === null) {
      this.#followed = connectionId
      // A bridge is back while the band was coasting: it takes over from here.
      this.#cancelCoast?.()
      this.#cancelCoast = null
    }
    if (this.#followed === connectionId) return { accepted: true }
    return {
      accepted: false,
      following: this.#bridges.get(this.#followed)?.name ?? 'another bridge',
    }
  }

  setMarkers(
    connectionId: string,
    name: string,
    project: string | null,
    markers: Marker[],
  ): BridgeResult {
    const result = this.#record(connectionId, name)
    const bridge = this.#bridges.get(connectionId)!
    bridge.project = project
    bridge.markers = markers
    if (!result.accepted) return result
    this.#project = project
    this.#markers = markers
    this.#changed()
    return result
  }

  /**
   * `latenessMs` is how long the report was held up on the way (Wi-Fi stalls),
   * from its sentAt. The report describes the playhead when it was sent, so it
   * is dated then: a late report does not drag the playhead into the past.
   */
  setTransport(
    connectionId: string,
    name: string,
    transport: Transport,
    latenessMs = 0,
  ): BridgeResult {
    const result = this.#record(connectionId, name)
    const received = { value: transport, receivedAt: this.#now() - latenessMs }
    this.#bridges.get(connectionId)!.transport = received
    if (!result.accepted) return result
    this.#transport = received
    this.#changed()
    return result
  }

  /**
   * A bridge went away (DAW closed, network dropped). If it was the one followed
   * and another is still connected, follow that one, with its own last markers
   * and position. Otherwise keep the markers and, if the DAW was playing, keep
   * counting for COAST_MS: a Wi-Fi drop is usually over before then and the
   * device reconnects. If no bridge is back by then, stop the clock where it is.
   */
  bridgeDisconnected(connectionId: string): void {
    if (!this.#bridges.delete(connectionId) || this.#followed !== connectionId) return

    const [nextId, next] = this.#bridges.entries().next().value ?? []
    if (nextId && next) {
      this.#followed = nextId
      if (next.markers) {
        this.#project = next.project
        this.#markers = next.markers
      }
      if (next.transport) this.#transport = next.transport
    } else {
      this.#followed = null
      if (this.#transport?.value.playing) {
        this.#cancelCoast?.()
        this.#cancelCoast = this.#schedule(() => {
          this.#cancelCoast = null
          if (this.#followed !== null) return
          this.#stopClock()
          this.#changed()
        }, COAST_MS)
      } else {
        this.#stopClock()
      }
    }
    this.#changed()
  }

  /** Holds the playhead where it is now. */
  #stopClock(): void {
    if (!this.#transport) return
    this.#transport = {
      value: { ...this.#transport.value, beat: this.#currentBeat()!, playing: false },
      receivedAt: this.#now(),
    }
  }

  #currentBeat(): number | null {
    if (!this.#transport) return null
    return beatAt(this.#transport.value, this.#now() - this.#transport.receivedAt)
  }

  /** The section the display shows now, as an index into the sorted markers. */
  #shownIndex(): number {
    const transport = this.#transport?.value
    return computeCueView(
      toCues(this.#markers),
      transport ? { ...transport, beat: this.#currentBeat()! } : null,
      this.#mode,
    ).index
  }

  override(action: OverrideAction): CueMode {
    const count = toCues(this.#markers).length
    if (action.action === 'auto') {
      this.#mode = { mode: 'auto' }
    } else if (count === 0) {
      throw new EngineError('conflict', 'There are no markers to choose from yet.')
    } else {
      const shown = Math.max(this.#shownIndex(), 0)
      const index =
        action.action === 'select'
          ? action.index
          : action.action === 'next'
            ? shown + 1
            : action.action === 'previous'
              ? shown - 1
              : shown
      this.#mode = { mode: 'manual', index: Math.min(Math.max(index, 0), count - 1) }
    }
    this.#changed()
    return this.#mode
  }

  /** The media team's switch. Resets to shown when the engine restarts. */
  setHidden(hidden: boolean): { hidden: boolean } {
    if (this.#hidden !== hidden) {
      this.#hidden = hidden
      this.#changed()
    }
    return { hidden }
  }

  snapshot(): LiveState {
    const transport = this.#transport
      ? { ...this.#transport.value, beat: this.#currentBeat()! }
      : null
    return {
      daw: {
        connected: this.#followed !== null,
        name: this.#followed ? (this.#bridges.get(this.#followed)?.name ?? null) : null,
        project: this.#project,
      },
      markers: this.#markers,
      transport,
      mode: this.#mode,
      hidden: this.#hidden,
    }
  }
}
