import { beatAt, computeCueView, smoothBeat, toCues, type CueView } from '@stagecue/arrangement'
import type { EngineConnection, LiveSnapshot } from '@stagecue/engine-client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

export function useLive(connection: EngineConnection): LiveSnapshot | null {
  return useSyncExternalStore(connection.subscribeLive, connection.getLive)
}

/** The playhead estimated now, from the newest report. */
function estimateNow(connection: EngineConnection): number | null {
  const live = connection.getLive()
  const transport = live?.state.transport
  if (!live || !transport) return null
  // performance.now(), not the animation frame's timestamp: receivedAt uses this
  // clock, and off-screen windows stamp frames tens of milliseconds behind it.
  return beatAt(transport, performance.now() - live.receivedAt)
}

/**
 * The cue to show right now. While the DAW plays, this re-renders every
 * animation frame and moves the playhead forward from the last report, so the
 * countdown, pulse, and progress bar stay smooth between network updates.
 */
export function useCueView(connection: EngineConnection): {
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
      const estimate = estimateNow(connection)
      if (estimate !== null) setShownBeat((previous) => smoothBeat(previous, estimate))
      frame = requestAnimationFrame(loop)
    })
    return () => {
      cancelAnimationFrame(frame)
      setShownBeat(null)
    }
  }, [playing, connection])

  const playhead = transport
    ? { ...transport, beat: playing && shownBeat !== null ? shownBeat : transport.beat }
    : null

  return {
    view: computeCueView(cues, playhead, live?.state.mode ?? { mode: 'auto' }),
    live,
    beat: playhead?.beat ?? null,
  }
}
