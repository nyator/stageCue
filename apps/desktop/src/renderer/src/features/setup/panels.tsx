import { Check, Copy } from '@phosphor-icons/react'
import type { ConnectedClient } from '@stagecue/event-protocol'
import type { OutputStatus, ScreenInfo } from '@stagecue/shared-types'
import { useState, type ReactNode } from 'react'
import {
  changeEngineUrl,
  DEFAULT_ENGINE_URL,
  engine,
  useEngineState,
  validateEngineUrl,
} from '../../engine'
import { useEngineQuery } from '../../engine/hooks'
import { formatTimestamp } from '../../lib/format'
import { screenPageUrl } from '../../live/use-screens'
import { Button, IconButton } from '../../ui/button'
import { InlineError, QueryView, SkeletonRows } from '../../ui/feedback'
import { Field, TextInput } from '../../ui/field'
import { browserDisplays } from './signal'

const ROLE_LABELS = { desktop: 'StageCue app', display: 'Screen', daw_bridge: 'Ableton' } as const

/** Left: what this link is and how to set it up. Right: what is true now, and the actions. */
function PanelLayout({
  title,
  lead,
  children,
  aside,
}: {
  title: string
  lead: ReactNode
  children: ReactNode
  aside: ReactNode
}) {
  return (
    <div className="grid grid-cols-[minmax(0,44rem)_minmax(0,22rem)] gap-x-16 gap-y-8">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        <div className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted">{lead}</div>
        <div className="mt-6">{children}</div>
      </div>
      <aside className="flex min-w-0 flex-col gap-6">{aside}</aside>
    </div>
  )
}

function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="flex max-w-[60ch] flex-col">
      {children.map((step, index) => (
        <li
          key={index}
          className="grid grid-cols-[2rem_minmax(0,1fr)] border-t border-line-soft py-3 text-sm leading-relaxed text-muted first:border-t-0 first:pt-0"
        >
          <span className="font-mono text-xs leading-6 text-faint">{index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

function Facts({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
        {title}
      </h3>
      {children}
    </div>
  )
}

/** A value to read out or type somewhere else, with a copy button that confirms. */
function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-line-soft bg-raised py-1 pr-1 pl-3">
      <code className="min-w-0 truncate font-mono text-[15px] text-ink">{value}</code>
      <IconButton
        label={copied ? `Copied ${value}` : `Copy ${value}`}
        icon={copied ? <Check className="size-4 text-cue" /> : <Copy className="size-4" />}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
      />
    </div>
  )
}

function engineAddresses(state: ReturnType<typeof useEngineState>, scheme = '') {
  if (state.phase !== 'connected') return { list: [] as string[], loopback: false }
  const list = state.status.addresses.map(
    (address) => `${scheme}${address}:${state.status.port}${scheme ? '/' : ''}`,
  )
  return { list, loopback: list.length > 0 && list.every((value) => value.includes('127.0.0.1')) }
}

const LOOPBACK_NOTE = (
  <>
    The engine only accepts connections from this computer. Start it with{' '}
    <code className="font-mono text-[13px] text-ink">STAGECUE_ENGINE_HOST=0.0.0.0</code> so other
    computers can reach it.
  </>
)

// ---------------------------------------------------------------------------

export function AbletonPanel({
  daw,
}: {
  daw: { connected: boolean; name: string | null; project: string | null } | null
}) {
  const state = useEngineState()
  const { list, loopback } = engineAddresses(state)

  return (
    <PanelLayout
      title="Ableton"
      lead={
        daw?.connected ? (
          <>
            Following <span className="text-ink">{daw.name}</span>
            {daw.project ? (
              <>
                {' '}
                in <span className="text-ink">{daw.project}</span>
              </>
            ) : null}
            . StageCue reads the locators and the playhead; it never changes the song.
          </>
        ) : (
          'Not connected. Three steps on the music computer connect it.'
        )
      }
      aside={
        <>
          <Facts title="Type this into the device">
            {state.phase !== 'connected' ? (
              <p className="text-sm text-faint">Shown once the engine is running.</p>
            ) : list.length === 0 || loopback ? (
              <p className="text-sm text-muted">{LOOPBACK_NOTE}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {list.map((address) => (
                  <CopyValue key={address} value={address} />
                ))}
              </div>
            )}
          </Facts>
          <p className="text-xs leading-relaxed text-faint">
            StageCue follows one Ableton at a time. If the simulator is running, stop it before
            testing the real device.
          </p>
        </>
      }
    >
      <Steps>
        {[
          'On the music computer, drop StageCue.amxd onto any track in the Live set. The master track is fine; audio passes through untouched.',
          'Type the address on the right into the device and press Return. The device remembers it.',
          <>
            Add a locator where each section starts, named like{' '}
            <span className="text-ink">Chorus</span> or{' '}
            <span className="text-ink">Chorus | Full choir</span>. A locator named{' '}
            <span className="text-ink">-</span> clears the screen.
          </>,
        ]}
      </Steps>
    </PanelLayout>
  )
}

export function EnginePanel() {
  const state = useEngineState()
  const [value, setValue] = useState(engine.url)
  const [error, setError] = useState<string | null>(null)
  const devices = useEngineQuery('devices.list', {})
  const changed = value.trim() !== engine.url

  const apply = (url: string) => {
    const problem = validateEngineUrl(url)
    setError(problem)
    if (!problem) {
      changeEngineUrl(url)
      setValue(url)
    }
  }

  const clients: ConnectedClient[] = state.phase === 'connected' ? state.status.clients : []

  return (
    <PanelLayout
      title="StageCue engine"
      lead={
        state.phase === 'connected'
          ? `Running since ${formatTimestamp(new Date(state.status.startedAt).toISOString())}. Everything passes through it: Ableton reports to it, and every output reads from it.`
          : state.phase === 'connecting'
            ? 'Connecting. This normally takes a moment after StageCue starts.'
            : 'StageCue cannot reach its engine and keeps retrying. Start it with pnpm dev, or check the address below.'
      }
      aside={
        <>
          <Facts title="Connected now">
            {clients.length === 0 ? (
              <p className="text-sm text-faint">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col">
                {clients.map((client) => (
                  <li
                    key={client.clientId}
                    className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2 text-sm last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-ink">{client.name}</span>
                    <span className="shrink-0 text-xs text-faint">{ROLE_LABELS[client.role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Facts>
          {state.phase === 'connected' ? (
            <p className="font-mono text-xs text-faint">
              Protocol v{state.status.protocolVersion} · database v{state.status.schemaVersion}
            </p>
          ) : null}
        </>
      }
    >
      <form
        className="flex max-w-[60ch] items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          apply(value.trim())
        }}
      >
        <Field
          label="Engine address"
          hint="The engine normally runs on this computer. Change this only if it runs on another one."
          error={error}
          className="flex-1"
        >
          {(control) => (
            <TextInput
              {...control}
              spellCheck={false}
              className="font-mono"
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setError(null)
              }}
            />
          )}
        </Field>
        <div className="flex gap-2 pt-[26px]">
          <Button type="submit" variant="primary" disabled={!changed}>
            Connect
          </Button>
          <Button
            variant="ghost"
            disabled={engine.url === DEFAULT_ENGINE_URL}
            onClick={() => apply(DEFAULT_ENGINE_URL)}
          >
            Use default
          </Button>
        </div>
      </form>

      <h3 className="mt-10 mb-3 text-sm font-semibold text-ink">
        Every computer that has connected
      </h3>
      <QueryView query={devices} skeleton={<SkeletonRows rows={2} className="h-9" />}>
        {(list) => (
          <table className="w-full max-w-[60ch] text-left text-sm">
            <thead className="text-xs text-faint">
              <tr className="border-b border-line-soft">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {list.map((device) => (
                <tr key={device.id} className="border-b border-line-soft">
                  <td className="max-w-[16rem] truncate py-2.5 pr-3 text-ink">{device.name}</td>
                  <td className="py-2.5 pr-3 text-muted">{ROLE_LABELS[device.role]}</td>
                  <td className="py-2.5 whitespace-nowrap text-faint">
                    {formatTimestamp(device.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
    </PanelLayout>
  )
}

export function ProPresenterPanel({ output }: { output: OutputStatus | null }) {
  const sourceName = `${window.stagecue?.deviceName ?? 'This computer'} (${output?.sourceName ?? 'StageCue'})`
  const receivers = output?.state === 'sending' ? output.receivers : 0

  return (
    <PanelLayout
      title="ProPresenter"
      lead={
        output
          ? output.state === 'sending'
            ? 'StageCue sends the band as an NDI video source with a transparent background. The operator layers it over the lyrics.'
            : output.message
          : 'Checking the NDI output…'
      }
      aside={
        <>
          <Facts title="NDI source">
            <CopyValue value={sourceName} />
          </Facts>
          <Facts title="Receiving now">
            <p className="text-sm text-ink">
              {output?.state !== 'sending'
                ? 'Nothing, because NDI is not sending.'
                : receivers === 0
                  ? 'No receiver yet.'
                  : `${receivers} ${receivers === 1 ? 'receiver' : 'receivers'}, such as ProPresenter.`}
            </p>
          </Facts>
        </>
      }
    >
      <Steps>
        {[
          'In ProPresenter, add the NDI source on the right as a video input.',
          <>
            Set that input’s alpha to <span className="text-ink">premultiplied</span>. With straight
            alpha, the band’s see-through areas look too dark.
          </>,
          'Place it on a layer above the lyrics in the looks or props you choose, and size it there. Lyrics, slides, and media stay under the operator’s control.',
        ]}
      </Steps>
    </PanelLayout>
  )
}

export function ScreensPanel({ screens }: { screens: ScreenInfo[] }) {
  const state = useEngineState()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const toggle = async (screen: ScreenInfo) => {
    setError(null)
    setBusy(screen.id)
    try {
      if (screen.showing) {
        await window.stagecue?.stopScreen(screen.id)
      } else {
        const problem = await window.stagecue?.showOnScreen(screen.id, screenPageUrl(engine.url))
        if (problem) setError(problem)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <PanelLayout
      title="Screens on this computer"
      lead="Without ProPresenter, StageCue can fill a TV with the cue: the section, what comes next, and the countdown, large enough to read across the room."
      aside={
        <Facts title="Connected screens">
          <ul className="flex flex-col">
            {screens.map((screen) => (
              <li
                key={screen.id}
                className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{screen.label}</span>
                  <span className="block text-xs text-faint">
                    {screen.width}×{screen.height}
                    {screen.primary ? ' · StageCue is on this one' : ''}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={screen.showing ? 'primary' : 'secondary'}
                  loading={busy === screen.id}
                  disabled={state.phase !== 'connected' && !screen.showing}
                  onClick={() => void toggle(screen)}
                  aria-pressed={screen.showing}
                >
                  {screen.showing ? 'Showing' : 'Show cue'}
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <InlineError message={error} />
          </div>
        </Facts>
      }
    >
      <Steps>
        {[
          'Connect the TV with HDMI, or turn on AirPlay to an Apple TV and choose to use it as a separate display.',
          'Choose Show cue next to that screen. The cue fills it, using the colours from the Style tab.',
          'To take it down, choose Showing again, or press Esc on that screen.',
        ]}
      </Steps>
      {screens.length <= 1 ? (
        <p className="mt-6 max-w-[60ch] rounded-md bg-raised px-3 py-2 text-sm text-muted">
          Only this screen is connected. When you plug in a TV it appears on the right. Showing the
          cue on this screen covers StageCue until you press Esc.
        </p>
      ) : null}
    </PanelLayout>
  )
}

export function BrowsersPanel() {
  const state = useEngineState()
  const { list, loopback } = engineAddresses(state, 'http://')
  const open = state.phase === 'connected' ? browserDisplays(state.status.clients) : []

  return (
    <PanelLayout
      title="Browsers on the network"
      lead="Any screen with a web browser can show the cue full screen: a smart TV, a tablet, or a small computer plugged into the TV. It only needs the same network as this computer."
      aside={
        <>
          <Facts title="Open this address">
            {state.phase !== 'connected' ? (
              <p className="text-sm text-faint">Shown once the engine is running.</p>
            ) : list.length === 0 || loopback ? (
              <p className="text-sm text-muted">{LOOPBACK_NOTE}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {list.map((url) => (
                  <CopyValue key={url} value={url} />
                ))}
              </div>
            )}
          </Facts>
          <Facts title="Open now">
            {open.length === 0 ? (
              <p className="text-sm text-faint">No browser has the cue open.</p>
            ) : (
              <ul className="flex flex-col">
                {open.map((client) => (
                  <li
                    key={client.clientId}
                    className="border-b border-line-soft py-2 text-sm text-ink last:border-b-0"
                  >
                    {client.name}
                  </li>
                ))}
              </ul>
            )}
          </Facts>
        </>
      }
    >
      <Steps>
        {[
          'On the TV or tablet, open the address on the right in its web browser.',
          'Click or tap once to go full screen. The cue follows Ableton from then on.',
          <>
            To name it in StageCue, add <span className="font-mono text-ink">?name=Choir%20TV</span>{' '}
            to the address.
          </>,
        ]}
      </Steps>
    </PanelLayout>
  )
}
