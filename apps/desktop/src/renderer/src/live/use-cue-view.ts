import { useCueView as useCueViewFor } from '@stagecue/display-ui'
import { engine } from '../engine'

/** The cue to show right now, for this page's engine connection. */
export function useCueView() {
  return useCueViewFor(engine)
}
