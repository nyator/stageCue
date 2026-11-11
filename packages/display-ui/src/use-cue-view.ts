import { beatAt, computeCueView, smoothBeat, toCues, type CueView } from '@stagecue/arrangement'
import type { EngineConnection, LiveSnapshot } from '@stagecue/engine-client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

export function useLive(connection: EngineConnection): LiveSnapshot | null {
  return useSyncExternalStore(connection.subscribeLive, connection.getLive)
}

/** The playhead estimated now (plus earlyMs), from the newest report. */
function estimateNow(connection: EngineConnection, earlyMs: number): number | null {
  const live = connection.getLive()
  const transport = live?.state.transport
  if (!live || !transport) return null
  // performance.now(), not the animation frame's timestamp: receivedAt uses this
  // clock, and off-screen windows stamp frames tens of milliseconds behind it.
  return beatAt(transport, performance.now() - live.receivedAt + earlyMs)
}

/**
 * The cue to show right now. While the DAW plays, this re-renders every
 * animation frame and moves the playhead forward from the last report, so the
 * countdown, pulse, and progress bar stay smooth between network updates.
 *
 * `earlyMs` runs the playhead that far ahead while playing, to cancel out delay
 * further down the line (the NDI output uses it; previews and TVs stay exact).
 */
export function useCueView(
  connection: EngineConnection,
  earlyMs = 0,
): {
  view: CueView
  live: LiveSnapshot | null
  /** The playhead in quarter notes, smoothed between reports. Null before the DAW reports. */
  beat: number | null
} {
  const live = useLive(connection)
  const markers = live?.state.markers
  const cues = useMemo(() => toCues(markers ?? []), [markers])
  const transport = live?.state.transport ?? null
  const playing = transport?.playing ?? false
  const [shownBeat, setShownBeat] = useState<number | null>(null)

  useEffect(() => {
    if (!playing) return
    let frame = requestAnimationFrame(function loop() {
      const estimate = estimateNow(connection, earlyMs)
      if (estimate !== null) setShownBeat((previous) => smoothBeat(previous, estimate))
      frame = requestAnimationFrame(loop)
    })
    return () => {
      cancelAnimationFrame(frame)
      setShownBeat(null)
    }
  }, [playing, connection, earlyMs])

  const playhead = transport
    ? { ...transport, beat: playing && shownBeat !== null ? shownBeat : transport.beat }
    : null

  return {
    view: computeCueView(cues, playhead, live?.state.mode ?? { mode: 'auto' }),
    live,
    beat: playhead?.beat ?? null,
  }
}
