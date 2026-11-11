import { Eye, EyeSlash, MapPin } from '@phosphor-icons/react'
import {
  DEFAULT_DISPLAY_SETTINGS,
  toCues,
  type Cue,
  type CueView,
  type TimeSignature,
} from '@stagecue/arrangement'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { engine } from '../../engine'
import { useAction, useEngineQuery } from '../../engine/hooks'
import { useCueView } from '../../live/use-cue-view'
import { useReducedMotion } from '../../live/use-reduced-motion'
import { navigate } from '../../navigation/router'
import { Button } from '../../ui/button'
import { EmptyState, InlineError } from '../../ui/feedback'
import { GroupLabel, PageHeader, type Tone } from '../../ui/page'
import { Monitor, MonitorColumns } from '../display/Monitor'
import { Stage } from '../display/Stage'
import { barOf, barPosition } from './position'

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 }

/**
 * Live is the program monitor: what the room sees, the transport it follows,
 * and the running order of Ableton's locators. See apps/desktop/DESIGN.md.
 */
export function LivePage() {
  const { view, live, beat } = useCueView()
  const settings = useEngineQuery('settings.getDisplay', {}).data ?? DEFAULT_DISPLAY_SETTINGS
  const action = useAction()
  const markers = live?.state.markers
  const cues = useMemo(() => toCues(markers ?? []), [markers])
  const transport = live?.state.transport ?? null
  const timeSignature = transport?.timeSignature ?? FOUR_FOUR
  const daw = live?.state.daw
  const connected = daw?.connected ?? false
  const hidden = live?.state.hidden ?? false
  const onScreen = !hidden && view.current !== null && !view.current.blank

  const setHidden = (value: boolean) =>
    void action.run(() => engine.request('display.setHidden', { hidden: value }))

  const [status, tone]: [string, Tone] = hidden
    ? ['The band is hidden. Show it when Ableton is back in step.', 'warn']
    : !connected
      ? ['Waiting for Ableton. Connect it in Setup.', 'off']
      : transport?.playing
        ? ['Following Ableton.', 'ok']
        : ['Ableton is stopped. The screen holds the section at the playhead.', 'ok']

  return (
    // Fills the window exactly: the monitor takes the height that is left, and only the running order scrolls.
    <div className="mx-auto flex h-full max-w-[90rem] flex-col px-8 py-6">
      <PageHeader title="Live" status={status} tone={tone} />

      <MonitorColumns
        above={
          // Same label row as the running order, so both boxes start level.
          <div className="flex items-baseline justify-between gap-3">
            <GroupLabel>
              <span id="screen-preview">Screen preview</span>
            </GroupLabel>
          </div>
        }
        monitor={
          <section aria-labelledby="screen-preview">
            <Monitor
              tally={hidden ? 'held' : onScreen ? 'on' : 'preview'}
              label={hidden ? 'Hidden' : onScreen ? 'On screen' : 'Standby'}
            >
              <Stage view={view} settings={settings} hidden={hidden} />
            </Monitor>
          </section>
        }
        below={
          <>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl bg-panel px-5 py-4 ring-1 ring-line-soft">
              <Transport
                beat={beat}
                playing={transport?.playing ?? false}
                tempo={transport?.tempo ?? null}
                timeSignature={timeSignature}
              />
              <Button
                size="md"
                variant={hidden ? 'primary' : 'secondary'}
                className="ml-auto h-10 px-4"
                icon={hidden ? <Eye className="size-4" /> : <EyeSlash className="size-4" />}
                aria-pressed={hidden}
                onClick={() => setHidden(!hidden)}
              >
                {hidden ? 'Show band' : 'Hide band'}
              </Button>
            </div>
            <InlineError message={action.error} />
            <p className="max-w-[70ch] text-xs leading-relaxed text-faint">
              The band follows Ableton on its own. Hide it when only the click is playing or the
              service goes off script, and show it again when Ableton is back in step.
            </p>
          </>
        }
        aside={
          <aside aria-labelledby="running-order" className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 items-baseline justify-between gap-3">
              <GroupLabel>
                <span id="running-order">Running order</span>
              </GroupLabel>
              <span className="mb-2.5 truncate text-xs text-faint">{daw?.project ?? ''}</span>
            </div>
            {cues.length === 0 ? (
              <div className="rounded-xl bg-panel p-4 ring-1 ring-line-soft">
                <EmptyState icon={<MapPin className="size-5" />} title="No locators yet">
                  {connected
                    ? 'Add locators in Ableton’s arrangement where each section starts, named like Chorus or Chorus | Full choir.'
                    : 'Once Ableton is connected, its locators appear here in order.'}
                </EmptyState>
                {!connected ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate('setup')}
                  >
                    Open Setup
                  </Button>
                ) : null}
              </div>
            ) : (
              <RunningOrder cues={cues} view={view} timeSignature={timeSignature} />
            )}
          </aside>
        }
      />
    </div>
  )
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">
        {label}
      </span>
      <span className="font-mono text-lg leading-none text-ink tabular-nums">{children}</span>
    </div>
  )
}

/** Bar and beat, tempo, and metre, as Ableton reports them. */
function Transport({
  beat,
  playing,
  tempo,
  timeSignature,
}: {
  beat: number | null
  playing: boolean
  tempo: number | null
  timeSignature: TimeSignature
}) {
  if (beat === null || tempo === null) {
    return <p className="text-sm text-faint">No playhead yet. Ableton reports it once connected.</p>
  }
  const position = barPosition(beat, timeSignature)

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className={`size-2 rounded-full ${playing ? 'bg-cue' : 'bg-line'}`} aria-hidden />
        {playing ? 'Playing' : 'Stopped'}
      </span>
      <Readout label="Bar">
        {position.bar}.{position.beatInBar + 1}
      </Readout>
      <Readout label="Tempo">{Math.round(tempo)}</Readout>
      <Readout label="Metre">
        {timeSignature.numerator}/{timeSignature.denominator}
      </Readout>
    </div>
  )
}

/**
 * Ableton's locators in order. The current section fills as it plays, like the
 * band's progress bar; the next one says how far away it is.
 */
function RunningOrder({
  cues,
  view,
  timeSignature,
}: {
  cues: Cue[]
  view: CueView
  timeSignature: TimeSignature
}) {
  const list = useRef<HTMLOListElement>(null)
  const reducedMotion = useReducedMotion()
  const current = view.index

  // Keep the current section in view without moving the page around it.
  useEffect(() => {
    const element = list.current
    const row = element?.children[current] as HTMLElement | undefined
    if (!element || !row) return
    const top = row.offsetTop - element.clientHeight / 3
    element.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [current, reducedMotion])

  const countdown = view.countdown
  const away = countdown
    ? countdown.finalBeats !== null
      ? `${countdown.finalBeats} ${countdown.finalBeats === 1 ? 'beat' : 'beats'}`
      : `${countdown.bars} ${countdown.bars === 1 ? 'bar' : 'bars'}`
    : null

  return (
    <ol
      ref={list}
      className="relative flex min-h-0 flex-col overflow-y-auto rounded-xl bg-panel py-1.5 ring-1 ring-line-soft"
    >
      {cues.map((cue, index) => {
        const isCurrent = index === current
        const isNext = index === current + 1 && away !== null
        const past = current >= 0 && index < current
        return (
          <li
            key={`${cue.beat}-${index}`}
            aria-current={isCurrent ? 'step' : undefined}
            className="relative grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 px-3 py-2"
          >
            {isCurrent ? (
              <>
                <span
                  className="absolute inset-0 origin-left bg-cue-wash"
                  style={{ transform: `scaleX(${Math.max(0.02, view.progress ?? 0).toFixed(4)})` }}
                  aria-hidden
                />
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-cue" aria-hidden />
              </>
            ) : null}
            <span className="relative font-mono text-xs text-faint tabular-nums">
              {barOf(cue.beat, timeSignature)}
            </span>
            <span className="relative min-w-0">
              <span
                className={`block truncate text-sm font-medium ${
                  isCurrent
                    ? 'text-ink'
                    : cue.blank
                      ? 'text-faint italic'
                      : past
                        ? 'text-muted'
                        : 'text-ink'
                }`}
              >
                {cue.blank ? 'Clear display' : cue.label}
              </span>
              {cue.detail && !cue.blank ? (
                <span className="block truncate text-[13px] text-muted">{cue.detail}</span>
              ) : null}
            </span>
            <span className="relative text-[11px] font-semibold tracking-[0.1em] uppercase">
              {isCurrent ? <span className="text-cue">Now</span> : null}
              {isNext ? (
                <span className="text-muted">
                  Next <span className="font-mono tracking-normal normal-case">· {away}</span>
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
