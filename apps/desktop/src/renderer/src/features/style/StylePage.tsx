import { DEFAULT_DISPLAY_SETTINGS, type CueView, type DisplaySettings } from '@stagecue/arrangement'
import { useEffect, useState } from 'react'
import { engine } from '../../engine'
import { useAction, useEngineQuery } from '../../engine/hooks'
import { useCueView } from '../../live/use-cue-view'
import { useUnsavedChangesGuard } from '../../navigation/router'
import { FullScreenCue } from '@stagecue/display-ui'
import { Button } from '../../ui/button'
import { InlineError, QueryView, SkeletonRows } from '../../ui/feedback'
import { PageHeader } from '../../ui/page'
import { Segmented } from '../../ui/segmented'
import { DisplaySettingsPanel } from '../display/DisplaySettingsPanel'
import { Monitor, MonitorColumns } from '../display/Monitor'
import { Stage } from '../display/Stage'

const SAMPLE_TEMPO = 90
const SAMPLE_SECTION_BEATS = 16

/**
 * Shown while nothing is playing: a four-bar Chorus that loops, so the
 * progress bar, the countdown, and the pulse can all be judged.
 */
function sampleView(beats: number): CueView {
  const into = beats % SAMPLE_SECTION_BEATS
  const remaining = SAMPLE_SECTION_BEATS - into
  return {
    index: 0,
    current: { label: 'Chorus', detail: 'Full choir', beat: 0, blank: false },
    next: { label: 'Bridge', detail: null, beat: SAMPLE_SECTION_BEATS, blank: false },
    countdown: {
      bars: Math.ceil(remaining / 4),
      finalBeats: remaining <= 4 ? Math.ceil(remaining) : null,
      beats: Math.ceil(remaining),
      beatsPerBar: 4,
    },
    beatPhase: beats % 1,
    progress: into / SAMPLE_SECTION_BEATS,
    manual: false,
  }
}

/** Beats elapsed at Ableton's tempo (or 90 BPM before Ableton has reported one). */
function useSampleBeats(active: boolean, tempo: number): number {
  const [beats, setBeats] = useState(0)
  useEffect(() => {
    if (!active) return
    const started = performance.now()
    let frame = requestAnimationFrame(function loop(time) {
      setBeats(((time - started) / 60_000) * tempo)
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [active, tempo])
  return beats
}

export function StylePage() {
  const settings = useEngineQuery('settings.getDisplay', {})
  return (
    // The header with Save stays put; only the settings column scrolls.
    <div className="mx-auto flex h-full max-w-[90rem] flex-col px-8 pt-6">
      <QueryView
        query={settings}
        skeleton={
          <>
            <PageHeader title="Style" status="Loading the saved style…" tone="off" />
            <SkeletonRows rows={6} className="h-12" />
          </>
        }
      >
        {(saved) => <StyleEditor saved={saved} />}
      </QueryView>
    </div>
  )
}

const TARGETS = [
  { value: 'propresenter', label: 'ProPresenter' },
  { value: 'screen', label: 'TV' },
] as const

function StyleEditor({ saved }: { saved: DisplaySettings }) {
  const [base, setBase] = useState(saved)
  const [draft, setDraft] = useState(saved)
  const action = useAction()
  const { view, live } = useCueView()
  const [target, setTarget] = useState<'propresenter' | 'screen'>('propresenter')
  const dirty = JSON.stringify(draft) !== JSON.stringify(base)
  const isDefault = JSON.stringify(draft) === JSON.stringify(DEFAULT_DISPLAY_SETTINGS)
  useUnsavedChangesGuard(dirty)

  // Adopt a style saved on another computer, unless there are local edits.
  if (!dirty && saved !== base) {
    setBase(saved)
    setDraft(saved)
  }

  const liveHasContent = view.current !== null
  const sampleBeats = useSampleBeats(!liveHasContent, live?.state.transport?.tempo ?? SAMPLE_TEMPO)
  const shown = liveHasContent ? view : sampleView(sampleBeats)

  const save = async () => {
    const result = await action.run(() => engine.request('settings.saveDisplay', draft))
    if (result) {
      setBase(result)
      setDraft(result)
    }
  }

  return (
    <>
      <PageHeader
        title="Style"
        status={
          dirty
            ? 'Unsaved changes. Screens keep the old style until you save.'
            : 'Saved. ProPresenter and every TV use this style.'
        }
        tone={dirty ? 'warn' : 'ok'}
        actions={
          <>
            <Button
              variant="ghost"
              disabled={isDefault}
              onClick={() => setDraft(DEFAULT_DISPLAY_SETTINGS)}
            >
              Reset to defaults
            </Button>
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(base)}>
              Discard
            </Button>
            <Button
              variant="primary"
              disabled={!dirty}
              loading={action.pending}
              onClick={() => void save()}
            >
              Save
            </Button>
          </>
        }
      />
      <InlineError message={action.error} />

      <MonitorColumns
        className="mb-6"
        above={
          <div className="flex items-center gap-3 pb-3">
            <span id="preview-on" className="text-[13px] text-muted">
              Preview on
            </span>
            <Segmented
              labelledBy="preview-on"
              options={TARGETS}
              value={target}
              onChange={setTarget}
            />
          </div>
        }
        monitor={
          <Monitor tally="preview" label={liveHasContent ? 'Live from Ableton' : 'Sample'}>
            {target === 'propresenter' ? (
              <Stage view={shown} settings={draft} />
            ) : (
              <div className="@container aspect-video overflow-hidden rounded-md">
                <FullScreenCue view={shown} settings={draft} />
              </div>
            )}
          </Monitor>
        }
        below={
          <p className="text-xs leading-relaxed text-faint">
            {liveHasContent
              ? 'Showing what Ableton is playing now, in the style being edited.'
              : 'Showing a sample Chorus at Ableton’s tempo, because nothing is playing.'}
            {target === 'screen'
              ? ' On a TV the background is solid, so position and opacity do not apply.'
              : ' In ProPresenter, the operator decides where the band sits.'}
          </p>
        }
        aside={
          <aside
            aria-label="Style settings"
            className="min-h-0 overflow-y-auto overscroll-contain rounded-xl bg-panel p-5 ring-1 ring-line-soft"
          >
            <DisplaySettingsPanel value={draft} onChange={setDraft} />
          </aside>
        }
      />
    </>
  )
}
