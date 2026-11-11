import {
  beatAt,
  computeCueView,
  toCues,
  type CueMode,
  type Marker,
  type Transport,
} from '@stagecue/arrangement'
import type { LiveState, OverrideAction } from '@stagecue/event-protocol'
import { EngineError } from '../repositories/support.ts'

interface Bridge {
  connectionId: string
  name: string
  lastHeardAt: number
}

/** A bridge silent this long can be replaced by another one that is sending. */
export const BRIDGE_TIMEOUT_MS = 2_000

/** Whether a DAW message was used, or ignored because another bridge is followed. */
export type BridgeResult = { accepted: true } | { accepted: false; following: string }

/**
 * What is happening right now: the DAW's markers and playhead, and whether the
 * director has taken over. StageCue never controls the DAW; it only listens.
 */
export class LiveSession {
  readonly #now: () => number
  readonly #listeners = new Set<() => void>()
  #bridge: Bridge | null = null
  #project: string | null = null
  #markers: Marker[] = []
  #transport: { value: Transport; receivedAt: number } | null = null
  #mode: CueMode = { mode: 'auto' }
  #hidden = false

  constructor(now: () => number = Date.now) {
    this.#now = now
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
   * StageCue follows one bridge at a time. Another bridge that is also sending
   * (a second laptop, or the simulator left running) is ignored until the
   * followed one disconnects or goes silent; following whichever spoke last
   * made the band flicker between two positions.
   */
  #accept(connectionId: string, name: string): BridgeResult {
    const now = this.#now()
    const current = this.#bridge
    if (current && current.connectionId !== connectionId) {
      if (now - current.lastHeardAt < BRIDGE_TIMEOUT_MS) {
        return { accepted: false, following: current.name }
      }
    }
    this.#bridge = { connectionId, name, lastHeardAt: now }
    return { accepted: true }
  }

  setMarkers(
    connectionId: string,
    name: string,
    project: string | null,
    markers: Marker[],
  ): BridgeResult {
    const result = this.#accept(connectionId, name)
    if (!result.accepted) return result
    this.#project = project
    this.#markers = markers
    this.#changed()
    return result
  }

  setTransport(connectionId: string, name: string, transport: Transport): BridgeResult {
    const result = this.#accept(connectionId, name)
    if (!result.accepted) return result
    this.#transport = { value: transport, receivedAt: this.#now() }
    this.#changed()
    return result
  }

  /**
   * The bridge went away (DAW closed, network dropped). Keep the markers and the
   * last position so the display holds steady, but stop the clock.
   */
  bridgeDisconnected(connectionId: string): void {
    if (this.#bridge?.connectionId !== connectionId) return
    this.#bridge = null
    if (this.#transport) {
      this.#transport = {
        value: { ...this.#transport.value, beat: this.#currentBeat()!, playing: false },
        receivedAt: this.#now(),
      }
    }
    this.#changed()
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
        connected: this.#bridge !== null,
        name: this.#bridge?.name ?? null,
        project: this.#project,
      },
      markers: this.#markers,
      transport,
      mode: this.#mode,
      hidden: this.#hidden,
    }
  }
}
