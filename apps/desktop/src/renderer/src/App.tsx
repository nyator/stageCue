import { LivePage } from './features/live/LivePage'
import { LAMP_COLOUR } from './features/setup/lamps'
import type { Lamp, NodeState } from './features/setup/signal'
import { SetupPage } from './features/setup/SetupPage'
import { useSignalPath } from './features/setup/use-signal-path'
import { StylePage } from './features/style/StylePage'
import { navigate, useRoute, type Route } from './navigation/router'
import { Logo } from './ui/logo'

const TABS: { route: Route; label: string }[] = [
  { route: 'live', label: 'Live' },
  { route: 'style', label: 'Style' },
  { route: 'setup', label: 'Setup' },
]

export function App() {
  const route = useRoute()
  const active = TABS.findIndex((tab) => tab.route === route)

  return (
    <div className="flex h-dvh flex-col bg-booth text-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-b border-line-soft bg-panel px-8">
        <div className="flex items-center gap-8">
          <div className="py-3">
            <Logo />
          </div>
          <nav aria-label="Main" className="relative flex self-stretch">
            {TABS.map((tab) => {
              const current = tab.route === route
              return (
                <button
                  key={tab.route}
                  type="button"
                  aria-current={current ? 'page' : undefined}
                  onClick={() => navigate(tab.route)}
                  className={`relative w-20 text-sm font-medium transition-colors duration-150 ${
                    current ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  <span className="inline-block transition-transform duration-150 ease-out active:scale-95">
                    {tab.label}
                  </span>
                </button>
              )
            })}
            {/* The accent marker slides to the open page, like a fader cap. */}
            <span
              className="absolute bottom-0 left-0 h-0.5 w-20 px-5 transition-transform duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none"
              style={{ transform: `translateX(${Math.max(0, active) * 100}%)` }}
              aria-hidden
            >
              <span className="block h-full rounded-full bg-cue" />
            </span>
          </nav>
        </div>
        <SignalStrip />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div key={route} className="enter h-full">
          {route === 'live' ? <LivePage /> : route === 'style' ? <StylePage /> : <SetupPage />}
        </div>
      </main>
    </div>
  )
}

/** The best lamp among the outputs: any live beats ready beats waiting. */
function outputsLamp(nodes: NodeState[]): Lamp {
  const order: Lamp[] = ['live', 'ready', 'waiting', 'failing', 'off']
  return order.find((lamp) => nodes.some((node) => node.lamp === lamp)) ?? 'off'
}

/**
 * Setup's signal path in miniature, always in view: Ableton, the engine, and
 * the outputs. Choosing it opens Setup.
 */
function SignalStrip() {
  const { nodes, verdict } = useSignalPath()
  const outputs = [nodes.propresenter, nodes.screens, nodes.browsers]
  const live = outputs.filter((node) => node.lamp === 'live').length
  const outputLamp = outputsLamp(outputs)

  const stops: { label: string; value: string; lamp: Lamp }[] = [
    { label: 'Ableton', value: nodes.ableton.status, lamp: nodes.ableton.lamp },
    { label: 'Engine', value: nodes.engine.status, lamp: nodes.engine.lamp },
    {
      label: 'Outputs',
      value: live > 0 ? `${live} live` : outputLamp === 'ready' ? 'Ready' : 'None live',
      lamp: outputLamp,
    },
  ]
  const lit = (lamp: Lamp) => lamp === 'live' || lamp === 'ready'

  return (
    <button
      type="button"
      onClick={() => navigate('setup')}
      title={`${verdict.text} Open Setup.`}
      aria-label={`Signal path: ${stops.map((stop) => `${stop.label} ${stop.value}`).join(', ')}. Open Setup.`}
      className="group -mr-2 flex items-center rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150 hover:bg-raised"
    >
      {stops.map((stop, index) => (
        <span key={stop.label} className="flex items-center">
          {index > 0 ? (
            <span
              className={`mx-2.5 h-px w-5 transition-colors duration-200 ${
                lit(stops[index - 1]!.lamp) && lit(stop.lamp) ? 'bg-cue/60' : 'bg-line'
              }`}
              aria-hidden
            />
          ) : null}
          <span className={`size-2 rounded-full ${LAMP_COLOUR[stop.lamp]}`} aria-hidden />
          <span className="ml-2 text-muted">{stop.label}</span>
          <span className="ml-1.5 text-ink">{stop.value}</span>
        </span>
      ))}
    </button>
  )
}
