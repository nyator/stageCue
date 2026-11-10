import { CaretLeft, CaretRight, MonitorPlay } from '@phosphor-icons/react'
import {
  cueFrame,
  DEFAULT_DISPLAY_SETTINGS,
  stepCursor,
  type CueCursor,
  type DisplaySettings,
  type Performance,
  type SetlistSummary,
} from '@stagecue/arrangement'
import { useEffect, useMemo, useState } from 'react'
import { engine } from '../../engine'
import { useAction, useEngineQuery } from '../../engine/hooks'
import { formatShortDate } from '../../lib/format'
import { pickDefaultSetlist } from '../../lib/setlists'
import { navigate, useUnsavedChangesGuard } from '../../navigation/router'
import { Button } from '../../ui/button'
import { EmptyState, InlineError, QueryView } from '../../ui/feedback'
import { Select } from '../../ui/field'
import { typeBackground } from '../../ui/type-colors'
import { PageHeader } from '../../ui/page'
import { ChoirDisplay } from './ChoirDisplay'
import { DisplaySettingsPanel } from './DisplaySettingsPanel'

interface DisplayPageProps {
  setlistId: string | null
  performanceId: string | null
}

export function DisplayPage({ setlistId, performanceId }: DisplayPageProps) {
  const setlists = useEngineQuery('setlists.list', {})
  const settings = useEngineQuery('settings.getDisplay', {})
  const both = {
    data:
      setlists.data && settings.data
        ? { setlists: setlists.data, settings: settings.data }
        : undefined,
    error: setlists.error ?? settings.error,
  }

  return (
    <>
      <PageHeader
        title="Display"
        description="Preview what the choir sees above the lyrics. Nothing is sent to ProPresenter yet."
      />
      <div className="px-8 pb-10">
        <QueryView
          query={both}
          skeleton={<div className="aspect-video max-w-4xl animate-pulse rounded-lg bg-raised" />}
        >
          {(data) => (
            <DisplayWorkspace
              setlists={data.setlists}
              saved={data.settings}
              setlistId={setlistId}
              performanceId={performanceId}
            />
          )}
        </QueryView>
      </div>
    </>
  )
}

interface DisplayWorkspaceProps extends DisplayPageProps {
  setlists: SetlistSummary[]
  saved: DisplaySettings
}

/** Owns the style draft, so the stage previews unsaved changes as they are made. */
function DisplayWorkspace({ setlists, saved, setlistId, performanceId }: DisplayWorkspaceProps) {
  const [base, setBase] = useState(saved)
  const [draft, setDraft] = useState(saved)
  const action = useAction()
  const dirty = JSON.stringify(draft) !== JSON.stringify(base)
  useUnsavedChangesGuard(dirty)

  // Adopt a style saved on another computer, unless there are local edits.
  if (!dirty && saved !== base) {
    setBase(saved)
    setDraft(saved)
  }

  const chosenSetlistId = setlistId ?? pickDefaultSetlist(setlists)?.id ?? null
  const setlist = useEngineQuery('setlists.get', chosenSetlistId ? { id: chosenSetlistId } : null)
  const performances = setlist.data?.performances ?? []
  const performance = performances.find((p) => p.id === performanceId) ?? performances[0] ?? null

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
        {setlists.length === 0 ? (
          <EmptyState icon={<MonitorPlay className="size-5" />} title="Nothing to preview">
            Create a setlist and add a song to it. Its arrangement then plays through here section
            by section.
          </EmptyState>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-3">
              <Select
                aria-label="Setlist"
                value={chosenSetlistId ?? ''}
                onChange={(event) =>
                  navigate({ name: 'display', setlistId: event.target.value, performanceId: null })
                }
                className="w-72"
              >
                {setlists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}, {formatShortDate(s.serviceDate)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Song"
                value={performance?.id ?? ''}
                disabled={performances.length === 0}
                onChange={(event) =>
                  navigate({
                    name: 'display',
                    setlistId: chosenSetlistId,
                    performanceId: event.target.value,
                  })
                }
                className="w-72"
              >
                {performances.length === 0 ? (
                  <option value="">No songs in this setlist</option>
                ) : null}
                {performances.map((p, index) => (
                  <option key={p.id} value={p.id}>
                    {index + 1}. {p.songTitle}
                  </option>
                ))}
              </Select>
            </div>
            {setlist.data === undefined ? (
              <div className="aspect-video animate-pulse rounded-lg bg-raised" />
            ) : (
              <PreviewStage
                key={performance?.id ?? 'none'}
                performance={performance}
                settings={draft}
              />
            )}
          </>
        )}
      </div>

      <aside className="flex flex-col gap-6 self-start rounded-xl bg-panel p-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Display style</h2>
          <p className="mt-1 text-xs text-faint">Shared by every StageCue computer.</p>
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

function PreviewStage({
  performance,
  settings,
}: {
  performance: Performance | null
  settings: DisplaySettings
}) {
  const [cursor, setCursor] = useState<CueCursor>({ index: 0, pass: 1 })
  const sections = useMemo(() => performance?.sections ?? [], [performance])
  const frame = cueFrame(sections, cursor)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('input, select, textarea, [contenteditable="true"]')
      ) {
        return
      }
      if (event.key === 'ArrowRight') setCursor((c) => stepCursor(sections, c, 1))
      if (event.key === 'ArrowLeft') setCursor((c) => stepCursor(sections, c, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sections])

  const last = sections.at(-1)
  const atStart = cursor.index === 0 && cursor.pass === 1
  const atEnd = cursor.index === sections.length - 1 && cursor.pass === (last?.repeatCount ?? 1)

  return (
    <div>
      <div className="@container relative aspect-video overflow-hidden rounded-lg bg-[oklch(0.12_0.005_165)] ring-1 ring-line-soft">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1.2cqw] px-[10cqw] text-center">
          <p className="text-[3.2cqw] leading-tight font-semibold text-white/30">
            Lyric slides from ProPresenter
          </p>
          <p className="text-[3.2cqw] leading-tight font-semibold text-white/30">
            appear behind this band
          </p>
        </div>
        <ChoirDisplay frame={frame} settings={settings} />
        {!frame ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            {performance
              ? 'This song has no sections to show.'
              : 'Add a song to this setlist to preview it.'}
          </p>
        ) : null}
      </div>

      {frame ? (
        <>
          <div className="mt-4 flex items-center justify-between gap-4">
            <Button
              icon={<CaretLeft className="size-4" />}
              disabled={atStart}
              onClick={() => setCursor((c) => stepCursor(sections, c, -1))}
            >
              Previous
            </Button>
            <p className="text-center text-sm text-muted" aria-live="polite">
              <span className="text-ink">{frame.current.name}</span> · section {cursor.index + 1} of{' '}
              {sections.length}
              {frame.totalPasses > 1 ? ` · pass ${frame.pass} of ${frame.totalPasses}` : ''}
            </p>
            <Button disabled={atEnd} onClick={() => setCursor((c) => stepCursor(sections, c, 1))}>
              Next
              <CaretRight className="size-4" />
            </Button>
          </div>
          <ol className="mt-5 flex flex-wrap gap-1.5" aria-label="Jump to a section">
            {sections.map((section, index) => {
              const current = index === cursor.index
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    onClick={() => setCursor({ index, pass: 1 })}
                    className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150 ${
                      current
                        ? 'bg-raised text-ink ring-1 ring-line'
                        : 'text-muted hover:bg-panel hover:text-ink'
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${typeBackground[section.type]}`}
                      aria-hidden
                    />
                    {section.name}
                    {section.repeatCount > 1 ? (
                      <span className="text-faint">×{section.repeatCount}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="mt-3 text-xs text-faint">
            Use the arrow keys to step through sections and repeats.
          </p>
        </>
      ) : null}
    </div>
  )
}
