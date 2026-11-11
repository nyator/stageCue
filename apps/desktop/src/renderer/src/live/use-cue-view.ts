import { useCueView as useCueViewFor } from '@stagecue/display-ui'
import { engine } from '../engine'

/**
 * The cue to show right now, for this page's engine connection. `earlyMs` runs
 * the playhead ahead to cancel delay after StageCue; only the NDI output uses it.
 */
export function useCueView(earlyMs = 0) {
  return useCueViewFor(engine, earlyMs)
}
