import type { UpdateStatus } from '@stagecue/shared-types'
import { useEffect, useState } from 'react'

/** Whether a newer StageCue is out, pushed from the main process. Idle until one is found. */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    const bridge = window.stagecue
    if (!bridge) return
    let active = true
    void bridge.getUpdateStatus().then((initial) => {
      if (active) setStatus(initial)
    })
    const stop = bridge.onUpdateStatus(setStatus)
    return () => {
      active = false
      stop()
    }
  }, [])
  return status
}
