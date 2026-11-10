import type { OutputStatus } from '@stagecue/shared-types'
import { useEffect, useState } from 'react'

/** The NDI output state, pushed from the main process. Null until known. */
export function useOutputStatus(): OutputStatus | null {
  const [status, setStatus] = useState<OutputStatus | null>(null)
  useEffect(() => {
    const bridge = window.stagecue
    if (!bridge) return
    let active = true
    void bridge.getOutputStatus().then((initial) => {
      if (active) setStatus(initial)
    })
    const stop = bridge.onOutputStatus(setStatus)
    return () => {
      active = false
      stop()
    }
  }, [])
  return status
}
