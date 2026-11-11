import type { ScreenInfo } from '@stagecue/shared-types'
import { useEffect, useState } from 'react'

/** Screens attached to this computer, kept current as they are plugged in or out. */
export function useScreens(): ScreenInfo[] {
  const [screens, setScreens] = useState<ScreenInfo[]>([])
  useEffect(() => {
    const bridge = window.stagecue
    if (!bridge) return
    let active = true
    void bridge.listScreens().then((initial) => {
      if (active) setScreens(initial)
    })
    const stop = bridge.onScreensChanged(setScreens)
    return () => {
      active = false
      stop()
    }
  }, [])
  return screens
}

/** The engine serves the screen page on its own address: ws://host:port → http://host:port/. */
export function screenPageUrl(engineUrl: string): string {
  const url = new URL(engineUrl)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = '/'
  url.search = ''
  return url.toString()
}
