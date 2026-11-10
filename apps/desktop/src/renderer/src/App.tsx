import { STAGECUE_APP_NAME } from '@stagecue/shared-types'
import { useEngineState, useLive } from './engine'
import { LivePage } from './features/live/LivePage'
import { SetupPage } from './features/setup/SetupPage'
import { StylePage } from './features/style/StylePage'
import { useOutputStatus } from './live/use-output-status'
import { navigate, useRoute, type Route } from './navigation/router'

const TABS: { route: Route; label: string }[] = [
  { route: 'live', label: 'Live' },
  { route: 'style', label: 'Style' },
  { route: 'setup', label: 'Setup' },
]

export function App() {
  const route = useRoute()

  return (
    <div className="flex h-dvh flex-col bg-booth text-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-line-soft bg-panel px-8 py-3">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <CueMark />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">
              {STAGECUE_APP_NAME}
            </span>
          </div>
          <nav aria-label="Main" className="flex gap-1">
            {TABS.map((tab) => {
              const active = tab.route === route
              return (
                <button
                  key={tab.route}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(tab.route)}
                  className={`h-8 rounded-md px-3 text-sm font-medium transition-colors duration-150 ${
                    active ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
        <StatusLights />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {route === 'live' ? <LivePage /> : route === 'style' ? <StylePage /> : <SetupPage />}
      </main>
    </div>
  )
}

type Tone = 'ok' | 'warn' | 'off' | 'bad'
const toneClass: Record<Tone, string> = {
  ok: 'bg-cue',
  warn: 'bg-warn',
  off: 'bg-line',
  bad: 'bg-alert',
}

function Light({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <button
      type="button"
      onClick={() => navigate('setup')}
      title={`${label}: ${value}. Open Setup.`}
      className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-raised"
    >
      <span className={`size-2 rounded-full ${toneClass[tone]}`} aria-hidden />
      <span className="text-muted">{label}</span>
      <span className="max-w-[14rem] truncate text-ink">{value}</span>
    </button>
  )
}

function StatusLights() {
  const engineState = useEngineState()
  const daw = useLive()?.state.daw
  const output = useOutputStatus()

  const engineLight: [string, Tone] =
    engineState.phase === 'connected'
      ? ['Connected', 'ok']
      : engineState.phase === 'connecting'
        ? ['Connecting', 'warn']
        : ['Offline', 'bad']

  const outputLight: [string, Tone] = !output
    ? ['Checking', 'off']
    : output.state === 'sending'
      ? [output.receivers > 0 ? `On air (${output.receivers})` : 'Ready', 'ok']
      : output.state === 'error'
        ? ['Error', 'bad']
        : output.state === 'starting'
          ? ['Starting', 'warn']
          : ['Not set up', 'off']

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-1">
      <Light
        label="Ableton"
        value={daw?.connected ? (daw.project ?? daw.name ?? 'Connected') : 'Not connected'}
        tone={daw?.connected ? 'ok' : 'off'}
      />
      <Light label="NDI" value={outputLight[0]} tone={outputLight[1]} />
      <Light label="Engine" value={engineLight[0]} tone={engineLight[1]} />
    </div>
  )
}

function CueMark() {
  return (
    <svg width="20" height="14" viewBox="0 0 40 28" aria-hidden="true">
      <rect width="40" height="4" className="fill-cue" />
      <rect y="12" width="28" height="4" className="fill-line" />
      <rect y="24" width="18" height="4" className="fill-line" />
    </svg>
  )
}
