import { beatAt, computeCueView, smoothBeat, toCues, type CueView } from '@stagecue/arrangement'
import { useEffect, useMemo, useState } from 'react'
import { engine, useLive, type LiveSnapshot } from '../engine'

/** The playhead estimated now, from the newest report. */
function estimateNow(): number | null {
  const live = engine.getLive()
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
export function useCueView(): { view: CueView; live: LiveSnapshot | null } {
  const live = useLive()
  const markers = live?.state.markers
  const cues = useMemo(() => toCues(markers ?? []), [markers])
  const transport = live?.state.transport ?? null
  const playing = transport?.playing ?? false
  const [shownBeat, setShownBeat] = useState<number | null>(null)

  useEffect(() => {
    if (!playing) return
    let frame = requestAnimationFrame(function loop() {
      const estimate = estimateNow()
      if (estimate !== null) setShownBeat((previous) => smoothBeat(previous, estimate))
      frame = requestAnimationFrame(loop)
    })
    return () => {
      cancelAnimationFrame(frame)
      setShownBeat(null)
    }
  }, [playing])

  const playhead = transport
    ? { ...transport, beat: playing && shownBeat !== null ? shownBeat : transport.beat }
    : null

  return {
    view: computeCueView(cues, playhead, live?.state.mode ?? { mode: 'auto' }),
    live,
  }
}
