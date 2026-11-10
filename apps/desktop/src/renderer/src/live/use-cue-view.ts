import { beatAt, computeCueView, toCues, type CueView } from '@stagecue/arrangement'
import { useEffect, useMemo, useState } from 'react'
import { useLive, type LiveSnapshot } from '../engine'

/**
 * The cue to show right now. While the DAW plays, this re-renders every
 * animation frame and moves the playhead forward from the last report, so the
 * countdown and pulse stay smooth between network updates.
 */
export function useCueView(): { view: CueView; live: LiveSnapshot | null } {
  const live = useLive()
  const markers = live?.state.markers
  const cues = useMemo(() => toCues(markers ?? []), [markers])
  const transport = live?.state.transport ?? null
  const playing = transport?.playing ?? false
  const [frameTime, setFrameTime] = useState(0)

  useEffect(() => {
    if (!playing) return
    let frame = requestAnimationFrame(function loop(time) {
      setFrameTime(time)
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  const playhead =
    live && transport
      ? { ...transport, beat: beatAt(transport, frameTime - live.receivedAt) }
      : null

  return {
    view: computeCueView(cues, playhead, live?.state.mode ?? { mode: 'auto' }),
    live,
  }
}
