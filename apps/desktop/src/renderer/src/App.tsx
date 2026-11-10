import { STAGECUE_APP_NAME } from '@stagecue/shared-types'
import { engine, useEngineState, type EngineConnectionState } from './engine'

export function App() {
  const electronVersion = window.stagecue?.versions.electron

  return (
    <main className="flex h-full min-h-screen flex-col overflow-hidden bg-booth text-ink">
      <div className="h-px bg-cue" aria-hidden="true" />
      <div className="enter flex flex-1 flex-col justify-between px-10 py-10 sm:px-16 sm:py-14">
        <p className="font-mono text-sm text-muted">Desktop</p>
        <div>
          <CueMark />
          <h1 className="mt-6 text-balance text-6xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-7xl">
            {STAGECUE_APP_NAME}
          </h1>
          <p className="mt-5 max-w-[38ch] text-pretty text-lg leading-[1.55] text-muted">
            Welcome. The application is running.
          </p>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 font-mono text-sm text-muted">
          <EngineStatusLine />
          {electronVersion ? <span>Electron {electronVersion}</span> : null}
        </footer>
      </div>
    </main>
  )
}

const engineHost = new URL(engine.url).host

const indicator: Record<EngineConnectionState['phase'], string> = {
  connected: 'tally bg-cue',
  connecting: 'bg-warn',
  offline: 'bg-alert',
}

function EngineStatusLine() {
  const state = useEngineState()

  let label: string
  let detail: string
  switch (state.phase) {
    case 'connected':
      label = 'Engine connected'
      detail = `${engineHost} · protocol v${state.status.protocolVersion} · database v${state.status.schemaVersion}`
      break
    case 'connecting':
      label = 'Connecting to engine'
      detail = engineHost
      break
    case 'offline':
      label = 'Engine offline'
      detail = `${engineHost} · retrying`
      break
  }

  return (
    <p className="flex items-center gap-3" role="status" aria-live="polite">
      <span className={`size-2 shrink-0 ${indicator[state.phase]}`} aria-hidden="true" />
      <span className="text-ink">{label}</span>
      <span>{detail}</span>
    </p>
  )
}

function CueMark() {
  return (
    <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true">
      <rect width="40" height="4" className="fill-cue" />
      <rect y="12" width="28" height="4" className="fill-line" />
      <rect y="24" width="18" height="4" className="fill-line" />
    </svg>
  )
}
