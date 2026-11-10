import { useState } from 'react'
import {
  changeEngineUrl,
  DEFAULT_ENGINE_URL,
  engine,
  useEngineState,
  validateEngineUrl,
} from '../../engine'
import { useEngineQuery } from '../../engine/hooks'
import { formatTimestamp } from '../../lib/format'
import { Button } from '../../ui/button'
import { QueryView, SkeletonRows } from '../../ui/feedback'
import { Field, TextInput } from '../../ui/field'
import { PageHeader, SectionHeading } from '../../ui/page'

const ROLE_LABELS = {
  desktop: 'Desktop app',
  display: 'Display',
  daw_bridge: 'DAW bridge',
} as const

export function ConnectionPage() {
  return (
    <>
      <PageHeader
        title="Connection"
        description="How this computer reaches the StageCue engine, and what else is connected."
      />
      <div className="flex max-w-3xl flex-col gap-10 px-8 pb-10">
        <EngineAddress />
        <ConnectedNow />
        <KnownDevices />
        <Integrations />
      </div>
    </>
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
      ? `Connected. Engine running since ${formatTimestamp(new Date(state.status.startedAt).toISOString())}, protocol v${state.status.protocolVersion}, database v${state.status.schemaVersion}.`
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
          hint="Use this computer’s address when the engine runs here. For an engine on the music computer, use its network address."
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

function ConnectedNow() {
  const state = useEngineState()
  return (
    <section>
      <SectionHeading>Connected now</SectionHeading>
      {state.phase !== 'connected' ? (
        <p className="text-sm text-muted">Shown once the engine is reachable.</p>
      ) : (
        <ul className="flex flex-col">
          {state.status.clients.map((client) => (
            <li
              key={client.clientId}
              className="flex items-center justify-between border-b border-line-soft py-2.5 text-sm"
            >
              <span className="text-ink">{client.name}</span>
              <span className="text-muted">{ROLE_LABELS[client.role]}</span>
            </li>
          ))}
        </ul>
      )}
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
                  <td className="py-2.5 text-faint">{formatTimestamp(device.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
    </section>
  )
}

function Integrations() {
  const rows = [
    { name: 'Ableton Live', detail: 'Follows playback through a Max for Live device.' },
    { name: 'Logic Pro', detail: 'Follows playback through MIDI from Logic.' },
    { name: 'ProPresenter', detail: 'Shows the arrangement band over the lyrics.' },
  ]
  return (
    <section>
      <SectionHeading>Integrations</SectionHeading>
      <p className="mb-3 text-sm text-muted">
        These connections are planned but not built yet. Until then, StageCue does not talk to your
        DAW or to ProPresenter.
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between gap-4 border-b border-line-soft py-2.5 text-sm"
          >
            <span>
              <span className="block text-ink">{row.name}</span>
              <span className="block text-xs text-faint">{row.detail}</span>
            </span>
            <span className="shrink-0 text-faint">Not available yet</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
