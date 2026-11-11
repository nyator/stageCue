import { Eye, EyeSlash, MapPin } from '@phosphor-icons/react'
import {
  beatUnit,
  DEFAULT_DISPLAY_SETTINGS,
  toCues,
  type Cue,
  type TimeSignature,
} from '@stagecue/arrangement'
import { useMemo } from 'react'
import { engine } from '../../engine'
import { useAction, useEngineQuery } from '../../engine/hooks'
import { useCueView } from '../../live/use-cue-view'
import { navigate } from '../../navigation/router'
import { Button } from '../../ui/button'
import { EmptyState, InlineError } from '../../ui/feedback'
import { Stage } from '../display/Stage'

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 }

/** 1-based bar number, as the DAW shows it. */
function barOf(beat: number, timeSignature: TimeSignature): number {
  return Math.floor(beat / (timeSignature.numerator * beatUnit(timeSignature)) + 1e-6) + 1
}

export function LivePage() {
  const { view, live } = useCueView()
  const settings = useEngineQuery('settings.getDisplay', {}).data ?? DEFAULT_DISPLAY_SETTINGS
  const action = useAction()
  const markers = live?.state.markers
  const cues = useMemo(() => toCues(markers ?? []), [markers])
  const transport = live?.state.transport ?? null
  const timeSignature = transport?.timeSignature ?? FOUR_FOUR
  const daw = live?.state.daw

  const hidden = live?.state.hidden ?? false
  const setHidden = (value: boolean) =>
    void action.run(() => engine.request('display.setHidden', { hidden: value }))

  const position = transport
    ? `Bar ${barOf(transport.beat, timeSignature)} · ${Math.round(transport.tempo)} BPM · ${timeSignature.numerator}/${timeSignature.denominator}`
    : 'No playhead yet'

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_20rem] gap-8 px-8 py-6">
      <div className="min-w-0">
        <Stage view={view} settings={settings} hidden={hidden} />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <span
              className={`size-2.5 rounded-full ${hidden ? 'bg-warn' : daw?.connected ? 'tally bg-cue' : 'bg-line'}`}
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium text-ink">
                {hidden
                  ? 'Band hidden from the screen'
                  : daw?.connected
                    ? 'Following Ableton'
                    : 'Waiting for Ableton'}
              </p>
              <p className="font-mono text-xs text-faint">
                {transport ? (transport.playing ? 'Playing · ' : 'Stopped · ') : ''}
                {position}
              </p>
            </div>
          </div>

          <Button
            variant={hidden ? 'primary' : 'secondary'}
            icon={hidden ? <Eye className="size-4" /> : <EyeSlash className="size-4" />}
            onClick={() => setHidden(!hidden)}
            title={hidden ? 'Put the band back on the screen' : 'Take the band off the screen'}
          >
            {hidden ? 'Show band' : 'Hide band'}
          </Button>
        </div>
        <div className="mt-3">
          <InlineError message={action.error} />
        </div>
        <p className="mt-3 text-xs text-faint">
          The band follows Ableton on its own. Hide it when only the click is playing or the service
          goes off script, and show it again when Ableton is back in step.
        </p>
      </div>

      <aside className="flex min-h-0 flex-col self-start rounded-xl bg-panel p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Markers</h2>
          <span className="truncate text-xs text-faint">{live?.state.daw.project ?? ''}</span>
        </div>
        {cues.length === 0 ? (
          <EmptyState icon={<MapPin className="size-5" />} title="No markers yet">
            {daw?.connected
              ? 'Add locators in Ableton’s arrangement where each section starts, named like “Chorus” or “Chorus | Full choir”.'
              : 'Once Ableton is connected, its locators appear here. See Setup for how to connect it.'}
          </EmptyState>
        ) : (
          <MarkerList cues={cues} currentIndex={view.index} timeSignature={timeSignature} />
        )}
        {!daw?.connected && cues.length === 0 ? (
          <Button
            className="mt-3 self-start"
            size="sm"
            variant="ghost"
            onClick={() => navigate('setup')}
          >
            Open Setup
          </Button>
        ) : null}
      </aside>
    </div>
  )
}

function MarkerList({
  cues,
  currentIndex,
  timeSignature,
}: {
  cues: Cue[]
  currentIndex: number
  timeSignature: TimeSignature
}) {
  return (
    <ol className="-mx-2 flex max-h-[60vh] flex-col overflow-y-auto">
      {cues.map((cue, index) => {
        const current = index === currentIndex
        return (
          <li key={`${cue.beat}-${index}`}>
            <div
              aria-current={current ? 'step' : undefined}
              className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 ${
                current ? 'bg-cue-wash' : ''
              }`}
            >
              <span className="font-mono text-xs text-faint">{barOf(cue.beat, timeSignature)}</span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-sm font-medium ${current ? 'text-cue' : cue.blank ? 'text-faint' : 'text-ink'}`}
                >
                  {cue.blank ? 'Clear display' : cue.label}
                </span>
                {cue.detail && !cue.blank ? (
                  <span className="block truncate text-xs text-faint">{cue.detail}</span>
                ) : null}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
