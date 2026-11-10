import { DEFAULT_DISPLAY_SETTINGS, type CueView, type DisplaySettings } from '@stagecue/arrangement'
import { useEffect, useState } from 'react'
import { engine } from '../../engine'
import { useAction, useEngineQuery } from '../../engine/hooks'
import { useCueView } from '../../live/use-cue-view'
import { useUnsavedChangesGuard } from '../../navigation/router'
import { Button } from '../../ui/button'
import { InlineError, QueryView, SkeletonRows } from '../../ui/feedback'
import { DisplaySettingsPanel } from '../display/DisplaySettingsPanel'
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
    <div className="px-8 py-6">
      <QueryView query={settings} skeleton={<SkeletonRows rows={6} className="h-12" />}>
        {(saved) => <StyleEditor saved={saved} />}
      </QueryView>
    </div>
  )
}

function StyleEditor({ saved }: { saved: DisplaySettings }) {
  const [base, setBase] = useState(saved)
  const [draft, setDraft] = useState(saved)
  const action = useAction()
  const { view, live } = useCueView()
  const dirty = JSON.stringify(draft) !== JSON.stringify(base)
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
    <div className="grid grid-cols-[minmax(0,1fr)_18rem] gap-8">
      <div className="min-w-0">
        <Stage view={shown} settings={draft} />
        <p className="mt-3 text-xs text-faint">
          {liveHasContent
            ? 'Showing what Ableton is playing now.'
            : 'Showing a sample, because nothing is playing. The band in ProPresenter updates when you save.'}
        </p>
      </div>
      <aside className="flex flex-col gap-6 self-start rounded-xl bg-panel p-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Band style</h2>
          <p className="mt-1 text-xs text-faint">
            Applies to the output on every StageCue computer. Where the band sits on the screen is
            decided in ProPresenter.
          </p>
        </div>
        <DisplaySettingsPanel value={draft} onChange={setDraft} />
        <InlineError message={action.error} />
        <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-4">
          <Button
            size="sm"
            variant="ghost"
            disabled={JSON.stringify(draft) === JSON.stringify(DEFAULT_DISPLAY_SETTINGS)}
            onClick={() => setDraft(DEFAULT_DISPLAY_SETTINGS)}
          >
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(base)}>
              Discard
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty}
              loading={action.pending}
              onClick={() => void save()}
            >
              Save
            </Button>
          </div>
        </div>
      </aside>
    </div>
  )
}
