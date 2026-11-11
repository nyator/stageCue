import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from '@stagecue/arrangement'
import { FullScreenCue, useCueView } from '@stagecue/display-ui'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { connection, embedded } from './connection'

/** The band style, loaded from the engine and reloaded whenever it is saved. */
function useDisplaySettings(connected: boolean): DisplaySettings {
  const [settings, setSettings] = useState(DEFAULT_DISPLAY_SETTINGS)
  const [revision, setRevision] = useState(0)

  useEffect(() => connection.onDataChanged(() => setRevision((value) => value + 1)), [])

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    connection.request('settings.getDisplay', {}).then(
      (loaded) => {
        if (!cancelled) setSettings(loaded)
      },
      () => {
        // Keep the last style; the next change or reconnect tries again.
      },
    )
    return () => {
      cancelled = true
    }
  }, [connected, revision])

  return settings
}

/** Hides the pointer after it has been still for a few seconds. */
function useIdleCursor(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const wake = () => {
      document.body.classList.remove('idle')
      clearTimeout(timer)
      timer = setTimeout(() => document.body.classList.add('idle'), 3_000)
    }
    wake()
    window.addEventListener('pointermove', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
    }
  }, [])
}

/** Browsers only allow full screen after a click or tap, so offer it briefly. */
function FullScreenHint() {
  const [visible, setVisible] = useState(!embedded && !document.fullscreenElement)

  useEffect(() => {
    if (!visible) return
    const hide = setTimeout(() => setVisible(false), 10_000)
    const goFullScreen = () => {
      setVisible(false)
      void document.documentElement.requestFullscreen?.().catch(() => undefined)
    }
    window.addEventListener('click', goFullScreen, { once: true })
    return () => {
      clearTimeout(hide)
      window.removeEventListener('click', goFullScreen)
    }
  }, [visible])

  if (!visible) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[4cqmin] flex justify-center">
      <span className="rounded-full bg-white/10 px-[2.4cqmin] py-[1cqmin] text-[max(13px,2cqmin)] text-white/70">
        Click or tap anywhere for full screen
      </span>
    </div>
  )
}

export function ScreenApp() {
  const state = useSyncExternalStore(connection.subscribe, connection.getState)
  const connected = state.phase === 'connected'
  const { view, live } = useCueView(connection)
  const settings = useDisplaySettings(connected)
  useIdleCursor()

  const hidden = live?.state.hidden ?? false
  const status = !connected
    ? 'Reconnecting to StageCue…'
    : live && !live.state.daw.connected
      ? 'Waiting for Ableton'
      : null

  return (
    <div className="@container relative h-dvh w-screen">
      {hidden ? (
        // The media team took the band off screen: show nothing at all.
        <div className="h-full w-full bg-black" />
      ) : (
        <FullScreenCue view={view} settings={settings} status={status} />
      )}
      <FullScreenHint />
    </div>
  )
}
