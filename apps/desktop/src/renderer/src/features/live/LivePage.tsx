import { CaretLeft, CaretRight, Hand, MapPin, Play } from '@phosphor-icons/react'
import {
  beatUnit,
  DEFAULT_DISPLAY_SETTINGS,
  toCues,
  type Cue,
  type TimeSignature,
} from '@stagecue/arrangement'
import type { OverrideAction } from '@stagecue/event-protocol'
import { useEffect, useMemo } from 'react'
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

  const override = (next: OverrideAction) =>
    void action.run(() => engine.request('cue.override', next))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('input, select, textarea, [contenteditable="true"]')
      )
        return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const actions: Record<string, OverrideAction> = {
        ArrowLeft: { action: 'previous' },
        ArrowRight: { action: 'next' },
        h: { action: 'hold' },
        f: { action: 'auto' },
        Escape: { action: 'auto' },
      }
      const chosen = actions[event.key]
      if (chosen && cues.length > 0) {
        event.preventDefault()
        void engine.request('cue.override', chosen).catch(() => undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cues.length])

  const manual = view.manual
  const position = transport
    ? `Bar ${barOf(transport.beat, timeSignature)} · ${Math.round(transport.tempo)} BPM · ${timeSignature.numerator}/${timeSignature.denominator}`
    : 'No playhead yet'

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_20rem] gap-8 px-8 py-6">
      <div className="min-w-0">
        <Stage view={view} settings={settings} />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <span
              className={`size-2.5 rounded-full ${manual ? 'bg-warn' : daw?.connected ? 'tally bg-cue' : 'bg-line'}`}
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium text-ink">
                {manual
                  ? 'Director has control'
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

          <div className="flex items-center gap-2">
            <Button
              icon={<CaretLeft className="size-4" />}
              disabled={cues.length === 0}
              onClick={() => override({ action: 'previous' })}
              title="Previous section (←)"
            >
              Previous
            </Button>
            <Button
              icon={<Hand className="size-4" />}
              disabled={cues.length === 0 || manual}
              onClick={() => override({ action: 'hold' })}
              title="Hold this section (H)"
            >
              Hold
            </Button>
            <Button
              disabled={cues.length === 0}
              onClick={() => override({ action: 'next' })}
              title="Next section (→)"
            >
              Next
              <CaretRight className="size-4" />
            </Button>
            <Button
              variant={manual ? 'primary' : 'ghost'}
              icon={<Play className="size-4" />}
              disabled={!manual}
              onClick={() => override({ action: 'auto' })}
              title="Follow Ableton again (F)"
            >
              Follow Ableton
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <InlineError message={action.error} />
        </div>
        <p className="mt-3 text-xs text-faint">
          Keys: ← and → step through sections, H holds the current one, F follows Ableton again.
          Holding stays in place until you choose to follow Ableton.
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
          <MarkerList
            cues={cues}
            currentIndex={view.index}
            timeSignature={timeSignature}
            onSelect={(index) => override({ action: 'select', index })}
          />
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
  onSelect,
}: {
  cues: Cue[]
  currentIndex: number
  timeSignature: TimeSignature
  onSelect: (index: number) => void
}) {
  return (
    <ol className="-mx-2 flex max-h-[60vh] flex-col overflow-y-auto">
      {cues.map((cue, index) => {
        const current = index === currentIndex
        return (
          <li key={`${cue.beat}-${index}`}>
            <button
              type="button"
              aria-current={current ? 'step' : undefined}
              onClick={() => onSelect(index)}
              title="Show this section now"
              className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ${
                current ? 'bg-cue-wash' : 'hover:bg-raised'
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
            </button>
          </li>
        )
      })}
    </ol>
  )
}
