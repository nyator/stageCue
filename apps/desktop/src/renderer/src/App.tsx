import {
  ListNumbers,
  MonitorPlay,
  MusicNotesSimple,
  PlugsConnected,
  SquaresFour,
  type Icon,
} from '@phosphor-icons/react'
import { STAGECUE_APP_NAME } from '@stagecue/shared-types'
import { useEngineState } from './engine'
import { ConnectionPage } from './features/connection/ConnectionPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { DisplayPage } from './features/display/DisplayPage'
import { SetlistsPage } from './features/setlists/SetlistsPage'
import { SongPage } from './features/songs/SongPage'
import { SongsPage } from './features/songs/SongsPage'
import { navigate, useRoute, type Route } from './navigation/router'

interface NavItem {
  label: string
  icon: Icon
  route: Route
  matches: Route['name'][]
}

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: SquaresFour, route: { name: 'dashboard' }, matches: ['dashboard'] },
  { label: 'Songs', icon: MusicNotesSimple, route: { name: 'songs' }, matches: ['songs', 'song'] },
  {
    label: 'Setlists',
    icon: ListNumbers,
    route: { name: 'setlists', setlistId: null },
    matches: ['setlists'],
  },
  {
    label: 'Display',
    icon: MonitorPlay,
    route: { name: 'display', setlistId: null, performanceId: null },
    matches: ['display'],
  },
  {
    label: 'Connection',
    icon: PlugsConnected,
    route: { name: 'connection' },
    matches: ['connection'],
  },
]

export function App() {
  const route = useRoute()

  return (
    <div className="grid h-dvh grid-cols-[13.5rem_minmax(0,1fr)] bg-booth text-ink">
      <aside className="flex min-h-0 flex-col border-r border-line-soft bg-panel">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
          <CueMark />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">{STAGECUE_APP_NAME}</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = item.matches.includes(route.name)
            const IconComponent = item.icon
            return (
              <button
                key={item.label}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.route)}
                className={`flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 ${
                  active ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink'
                }`}
              >
                <IconComponent
                  className={`size-[18px] ${active ? 'text-cue' : ''}`}
                  weight={active ? 'fill' : 'regular'}
                  aria-hidden
                />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto px-5 py-4">
          <EngineIndicator />
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto">
        <Screen route={route} />
      </main>
    </div>
  )
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'dashboard':
      return <DashboardPage />
    case 'songs':
      return <SongsPage />
    case 'song':
      return <SongPage key={route.songId} route={route} />
    case 'setlists':
      return <SetlistsPage setlistId={route.setlistId} />
    case 'display':
      return <DisplayPage setlistId={route.setlistId} performanceId={route.performanceId} />
    case 'connection':
      return <ConnectionPage />
  }
}

function EngineIndicator() {
  const state = useEngineState()
  const label =
    state.phase === 'connected'
      ? 'Engine connected'
      : state.phase === 'connecting'
        ? 'Connecting to engine'
        : 'Engine offline'
  const tone =
    state.phase === 'connected'
      ? 'tally bg-cue'
      : state.phase === 'connecting'
        ? 'bg-warn'
        : 'bg-alert'

  return (
    <button
      type="button"
      onClick={() => navigate({ name: 'connection' })}
      className="flex items-center gap-2.5 text-[13px] text-muted transition-colors hover:text-ink"
      role="status"
      aria-live="polite"
    >
      <span className={`size-2 rounded-full ${tone}`} aria-hidden />
      {label}
    </button>
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
