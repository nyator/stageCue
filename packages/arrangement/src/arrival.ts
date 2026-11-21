/*
 * How late a message arrived, from the sender's clock.
 *
 * Over Wi-Fi a playhead report can sit in the air for a few milliseconds or,
 * when the link stalls, for a second; then several arrive at once. Treated as
 * fresh, a late report puts the playhead in the past: the screen falls behind
 * or steps back. Every message carries `sentAt`, the sender's clock when it was
 * sent, so the receiver can tell how long it waited and wind the report's
 * arrival back by that much.
 *
 * The two computers' clocks never agree, so `receivedAt - sentAt` is the clock
 * difference plus the travel time. The smallest value seen lately is the clock
 * difference plus the quickest trip, so anything above it is how late this
 * message is. The quickest trip itself (a few milliseconds on Wi-Fi) cannot be
 * told apart from the clock difference and stays in.
 */

/**
 * When a connection drops while the DAW is playing, displays keep counting on
 * their own this long before stopping. Most Wi-Fi drops are over in a few
 * seconds and the device reconnects; freezing at once would leave the choir
 * looking at a stopped band while the music plays on.
 */
export const COAST_MS = 8_000

/** How long the quickest trip is remembered. Long enough to span a Wi-Fi bad patch. */
export const ARRIVAL_WINDOW_MS = 20_000
/** A report later than this is not waiting in the air: something else changed. */
export const MAX_LATENESS_MS = 3_000
/**
 * When even the quickest message of the last few seconds is this late, the
 * sender's clock was set back (the computer synced its time). Start again from
 * what is arriving now instead of treating every message as late.
 */
const CLOCK_STEP_MS = 300
const CLOCK_STEP_SPAN_MS = 3_000

interface Sample {
  at: number
  difference: number
}

export class ArrivalClock {
  /** Samples whose differences only rise, oldest first: the front is the window's smallest. */
  #lowest: Sample[] = []
  /** The same, for the last few seconds only, to notice a clock being set back. */
  #recent: Sample[] = []
  /** Since when every message has looked late by more than CLOCK_STEP_MS, if they have. */
  #lateSince: number | null = null

  /**
   * How many milliseconds late a message is, 0 or more. `sentAt` is the
   * sender's clock; `receivedAt` is this computer's clock (Date.now()) when it arrived.
   */
  lateness(sentAt: number, receivedAt: number): number {
    if (!Number.isFinite(sentAt)) return 0
    const sample = { at: receivedAt, difference: receivedAt - sentAt }
    push(this.#lowest, sample, receivedAt - ARRIVAL_WINDOW_MS)
    push(this.#recent, sample, receivedAt - CLOCK_STEP_SPAN_MS)

    // Every message for a while has been late: the clock moved, not the network.
    // (A burst after a stall is late too, but it is followed by messages on time.)
    if (sample.difference - this.#lowest[0]!.difference > CLOCK_STEP_MS) {
      this.#lateSince ??= receivedAt
      if (receivedAt - this.#lateSince >= CLOCK_STEP_SPAN_MS) {
        this.#lowest = [...this.#recent]
        this.#lateSince = null
      }
    } else {
      this.#lateSince = null
    }

    const late = sample.difference - this.#lowest[0]!.difference
    return Math.min(MAX_LATENESS_MS, Math.max(0, late))
  }
}

/** Adds a sample, keeping the list's differences rising and dropping what is too old. */
function push(list: Sample[], sample: Sample, oldest: number): void {
  while (list.length > 0 && list.at(-1)!.difference >= sample.difference) list.pop()
  list.push(sample)
  while (list.length > 1 && list[0]!.at < oldest) list.shift()
}
