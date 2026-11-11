import { Copy } from '@phosphor-icons/react'
import { useState } from 'react'
import {
  changeEngineUrl,
  DEFAULT_ENGINE_URL,
  engine,
  useEngineState,
  useLive,
  validateEngineUrl,
} from '../../engine'
import { useEngineQuery } from '../../engine/hooks'
import { useOutputStatus } from '../../live/use-output-status'
import { formatTimestamp } from '../../lib/format'
import { Button, IconButton } from '../../ui/button'
import { QueryView, SkeletonRows } from '../../ui/feedback'
import { Field, TextInput } from '../../ui/field'
import { SectionHeading } from '../../ui/page'

const ROLE_LABELS = { desktop: 'StageCue app', display: 'Output', daw_bridge: 'Ableton' } as const

export function SetupPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-10 px-8 py-6">
      <ConnectAbleton />
      <ConnectProPresenter />
      <EngineAddress />
      <KnownDevices />
    </div>
  )
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-sm text-muted">
      <span className="font-mono text-xs leading-6 text-faint">{number}</span>
      <div className="leading-6">{children}</div>
    </li>
  )
}

function ConnectAbleton() {
  const state = useEngineState()
  const daw = useLive()?.state.daw
  const [copied, setCopied] = useState<string | null>(null)
  const addresses =
    state.phase === 'connected'
      ? state.status.addresses.map((address) => `${address}:${state.status.port}`)
      : []

  const copy = (value: string) => {
    void navigator.clipboard.writeText(value).then(() => setCopied(value))
  }

  return (
    <section>
      <SectionHeading>Connect Ableton</SectionHeading>
      <p className={`mb-4 text-sm ${daw?.connected ? 'text-cue' : 'text-muted'}`}>
        {daw?.connected
          ? `Connected to ${daw.name}${daw.project ? `, ${daw.project}` : ''}.`
          : 'Ableton is not connected.'}
      </p>
      <ol className="flex flex-col gap-2">
        <Step number={1}>
          On the music computer, drop the StageCue device onto any track in your Live set.
        </Step>
        <Step number={2}>
          Enter this computer’s address in the device:
          {addresses.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {addresses.map((address) => (
                <li key={address} className="flex items-center gap-1">
                  <code className="rounded bg-raised px-2 py-1 font-mono text-[13px] text-ink">
                    {address}
                  </code>
                  <IconButton
                    label={copied === address ? 'Copied' : `Copy ${address}`}
                    icon={<Copy className="size-4" />}
                    onClick={() => copy(address)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <span className="block text-faint">
              {state.phase === 'connected'
                ? 'The engine only accepts connections from this computer. Start it with STAGECUE_ENGINE_HOST=0.0.0.0 to allow the music computer.'
                : 'Shown once the engine is running.'}
            </span>
          )}
        </Step>
        <Step number={3}>
          Add locators in the arrangement where each section starts, named like “Chorus” or “Chorus
          | Full choir”. A locator named “-” clears the screen.
        </Step>
      </ol>
    </section>
  )
}

function ConnectProPresenter() {
  const status = useOutputStatus()
  const tone =
    status?.state === 'sending'
      ? 'text-cue'
      : status?.state === 'error'
        ? 'text-alert'
        : 'text-warn'

  return (
    <section>
      <SectionHeading>Show it in ProPresenter</SectionHeading>
      <p className={`mb-4 text-sm ${status ? tone : 'text-faint'}`}>
        {status ? status.message : 'Checking the output…'}
        {status?.state === 'sending' && status.receivers > 0
          ? ` ${status.receivers} receiver${status.receivers === 1 ? '' : 's'} connected.`
          : ''}
      </p>
      <ol className="flex flex-col gap-2">
        <Step number={1}>
          StageCue publishes the band as an NDI video source with a transparent background. It is
          listed as “{window.stagecue?.deviceName ?? 'this computer'} (
          {status?.sourceName ?? 'StageCue'})”.
        </Step>
        <Step number={2}>
          In ProPresenter, add that NDI source as a video input and set its alpha to{' '}
          <span className="text-ink">premultiplied</span>, so the band’s see-through areas are not
          too dark. Then place it on a layer above the lyrics in the looks or props you choose.
        </Step>
        <Step number={3}>
          Size and position it there. Lyrics, slides, and media stay entirely under the operator’s
          control.
        </Step>
      </ol>
    </section>
  )
}

function EngineAddress() {
  const state = useEngineState()
  const [value, setValue] = useState(engine.url)
  const [error, setError] = useState<string | null>(null)
  const changed = value.trim() !== engine.url

  const apply = (url: string) => {
    const problem = validateEngineUrl(url)
    setError(problem)
    if (!problem) {
      changeEngineUrl(url)
      setValue(url)
    }
  }

  const statusText =
    state.phase === 'connected'
      ? `Connected. Running since ${formatTimestamp(new Date(state.status.startedAt).toISOString())}, protocol v${state.status.protocolVersion}.`
      : state.phase === 'connecting'
        ? 'Connecting…'
        : 'Cannot reach the engine. Retrying automatically.'

  return (
    <section>
      <SectionHeading>Engine</SectionHeading>
      <form
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          apply(value.trim())
        }}
      >
        <Field
          label="Engine address"
          hint="The engine normally runs on this computer. Change this only if it runs elsewhere."
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
      <p
        role="status"
        className={`mt-3 text-sm ${state.phase === 'connected' ? 'text-muted' : state.phase === 'offline' ? 'text-warn' : 'text-faint'}`}
      >
        {statusText}
      </p>
    </section>
  )
}

function KnownDevices() {
  const devices = useEngineQuery('devices.list', {})
  return (
    <section>
      <SectionHeading>Every computer that has connected</SectionHeading>
      <QueryView query={devices} skeleton={<SkeletonRows rows={2} className="h-9" />}>
        {(list) => (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-faint">
              <tr className="border-b border-line-soft">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Last address</th>
                <th className="pb-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {list.map((device) => (
                <tr key={device.id} className="border-b border-line-soft">
                  <td className="py-2.5 text-ink">{device.name}</td>
                  <td className="py-2.5 text-muted">{ROLE_LABELS[device.role]}</td>
                  <td className="py-2.5 font-mono text-xs text-muted">
                    {device.lastAddress ?? '–'}
                  </td>
                  <td className="py-2.5 whitespace-nowrap text-faint">
                    {formatTimestamp(device.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
    </section>
  )
}
