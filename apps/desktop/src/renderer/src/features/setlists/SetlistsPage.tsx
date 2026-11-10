import {
  ArrowDown,
  ArrowUp,
  ListNumbers,
  MonitorPlay,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'
import {
  durationSeconds,
  totalBars,
  type Performance,
  type Setlist,
  type SetlistSummary,
} from '@stagecue/arrangement'
import { useState } from 'react'
import { engine } from '../../engine'
import { useAction, useEngineQuery } from '../../engine/hooks'
import {
  estimateDuration,
  formatDuration,
  formatServiceDate,
  plural,
  relativeDay,
  todayIso,
} from '../../lib/format'
import { pickDefaultSetlist } from '../../lib/setlists'
import { navigate } from '../../navigation/router'
import { Button, IconButton } from '../../ui/button'
import { ConfirmDialog } from '../../ui/confirm'
import { EmptyState, InlineError, QueryView, SkeletonRows } from '../../ui/feedback'
import { Select } from '../../ui/field'
import { PageHeader } from '../../ui/page'
import { Timeline } from '../songs/Timeline'
import { AddSongDialog } from './AddSongDialog'
import { SetlistFormDialog } from './SetlistFormDialog'

export function SetlistsPage({ setlistId }: { setlistId: string | null }) {
  const query = useEngineQuery('setlists.list', {})
  const [creating, setCreating] = useState(false)

  const newButton = (
    <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
      New setlist
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Setlists"
        description="Plan each service and the arrangement of every song."
        actions={newButton}
      />
      <div className="px-8 pb-10">
        <QueryView query={query}>
          {(setlists) => {
            if (setlists.length === 0) {
              return (
                <EmptyState
                  icon={<ListNumbers className="size-5" />}
                  title="No setlists yet"
                  action={newButton}
                >
                  A setlist is the running order for one service. Add songs to it and choose which
                  arrangement the team will play.
                </EmptyState>
              )
            }
            const selected =
              setlists.find((s) => s.id === setlistId) ?? pickDefaultSetlist(setlists)
            return (
              <div className="grid grid-cols-[16rem_minmax(0,1fr)] gap-8">
                <SetlistNav setlists={setlists} selectedId={selected?.id ?? null} />
                {selected ? <SetlistDetail key={selected.id} setlistId={selected.id} /> : null}
              </div>
            )
          }}
        </QueryView>
      </div>
      {creating ? (
        <SetlistFormDialog
          setlist={null}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false)
            navigate({ name: 'setlists', setlistId: id })
          }}
        />
      ) : null}
    </>
  )
}

function SetlistNav({
  setlists,
  selectedId,
}: {
  setlists: SetlistSummary[]
  selectedId: string | null
}) {
  const today = todayIso()
  const upcoming = setlists
    .filter((s) => !s.serviceDate || s.serviceDate >= today)
    .sort((a, b) => (a.serviceDate ?? '9999').localeCompare(b.serviceDate ?? '9999'))
  const past = setlists.filter((s) => s.serviceDate && s.serviceDate < today)

  const group = (title: string, items: SetlistSummary[]) =>
    items.length === 0 ? null : (
      <div>
        <h2 className="mb-1.5 px-3 text-xs font-medium text-faint">{title}</h2>
        <ul className="flex flex-col gap-0.5">
          {items.map((setlist) => {
            const selected = setlist.id === selectedId
            return (
              <li key={setlist.id}>
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => navigate({ name: 'setlists', setlistId: setlist.id })}
                  className={`flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors duration-150 ${
                    selected ? 'bg-raised' : 'hover:bg-panel'
                  }`}
                >
                  <span className="truncate text-sm font-medium text-ink">{setlist.name}</span>
                  <span className="text-xs text-faint">
                    {formatServiceDate(setlist.serviceDate)} ·{' '}
                    {plural(setlist.performanceCount, 'song')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )

  return (
    <nav aria-label="Setlists" className="flex flex-col gap-5">
      {group('Upcoming', upcoming)}
      {group('Past', past)}
    </nav>
  )
}

function SetlistDetail({ setlistId }: { setlistId: string }) {
  const query = useEngineQuery('setlists.get', { id: setlistId })
  return (
    <QueryView query={query} skeleton={<SkeletonRows rows={5} className="h-14" />}>
      {(setlist) => <SetlistView setlist={setlist} />}
    </QueryView>
  )
}

function performanceDuration(performance: Performance): number | null {
  if (!performance.tempoBpm) return null
  const { numerator, denominator } = performance.timeSignature
  return durationSeconds(
    totalBars(performance.sections),
    performance.tempoBpm,
    numerator,
    denominator,
  )
}

function SetlistView({ setlist }: { setlist: Setlist }) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState(false)
  const action = useAction()

  const durations = setlist.performances.map(performanceDuration)
  const knownTotal = durations.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  const allKnown = durations.every((value) => value !== null)

  return (
    <section aria-label={setlist.name} className="min-w-0">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{setlist.name}</h2>
          <p className="text-sm text-muted">
            {formatServiceDate(setlist.serviceDate)}
            {setlist.serviceDate ? ` · ${relativeDay(setlist.serviceDate)}` : ''}
            {setlist.performances.length > 0
              ? ` · ${plural(setlist.performances.length, 'song')}, about ${allKnown ? '' : 'at least '}${formatDuration(knownTotal)}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            icon={<MonitorPlay className="size-4" />}
            disabled={setlist.performances.length === 0}
            onClick={() =>
              navigate({
                name: 'display',
                setlistId: setlist.id,
                performanceId: setlist.performances[0]?.id ?? null,
              })
            }
          >
            Preview display
          </Button>
          <Button icon={<PencilSimple className="size-4" />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <IconButton
            label="Delete setlist"
            tone="danger"
            size="md"
            icon={<Trash className="size-4" />}
            onClick={() => setDeleting(true)}
          />
        </div>
      </div>

      <div className="mb-3">
        <InlineError message={action.error} />
      </div>

      {setlist.performances.length === 0 ? (
        <EmptyState
          icon={<ListNumbers className="size-5" />}
          title="No songs in this setlist"
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add a song
            </Button>
          }
        >
          Add songs in the order they will be sung. You choose the arrangement for each one.
        </EmptyState>
      ) : (
        <>
          <ol className="flex flex-col">
            {setlist.performances.map((performance, index) => (
              <PerformanceRow
                key={performance.id}
                performance={performance}
                index={index}
                count={setlist.performances.length}
                onAction={(task) => void action.run(task)}
              />
            ))}
          </ol>
          <Button
            className="mt-4"
            icon={<Plus className="size-4" />}
            onClick={() => setAdding(true)}
          >
            Add a song
          </Button>
        </>
      )}

      {adding ? <AddSongDialog setlistId={setlist.id} onClose={() => setAdding(false)} /> : null}
      {editing ? (
        <SetlistFormDialog
          setlist={setlist}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting}
        title={`Delete ${setlist.name}?`}
        confirmLabel="Delete setlist"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await engine.request('setlists.delete', { id: setlist.id })
          setDeleting(false)
          navigate({ name: 'setlists', setlistId: null })
        }}
      >
        <p>The songs and arrangements stay in your library. Only this running order is removed.</p>
      </ConfirmDialog>
    </section>
  )
}

interface PerformanceRowProps {
  performance: Performance
  index: number
  count: number
  onAction: (task: () => Promise<unknown>) => void
}

function PerformanceRow({ performance, index, count, onAction }: PerformanceRowProps) {
  const bars = totalBars(performance.sections)
  const duration = estimateDuration(bars, performance.tempoBpm, performance.timeSignature)
  const details = [
    performance.songKey ? `Key of ${performance.songKey}` : null,
    `${bars} bars`,
    duration,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="grid grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-line-soft py-3">
      <span className="font-mono text-xs text-faint">{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() =>
            navigate({
              name: 'song',
              songId: performance.songId,
              tab: 'arrangements',
              arrangementId: performance.arrangementId,
            })
          }
          className="truncate text-left font-medium text-ink hover:text-cue"
        >
          {performance.songTitle}
        </button>
        <p className="mb-2 text-xs text-faint">{details}</p>
        <Timeline
          compact
          label={`Sections of ${performance.songTitle}`}
          blocks={performance.sections.map((section) => ({ ...section, key: section.id }))}
        />
      </div>
      <ArrangementPicker performance={performance} onAction={onAction} />
      <div className="flex items-center">
        <IconButton
          label={`Preview ${performance.songTitle} on the display`}
          icon={<MonitorPlay className="size-4" />}
          onClick={() =>
            navigate({
              name: 'display',
              setlistId: performance.setlistId,
              performanceId: performance.id,
            })
          }
        />
        <IconButton
          label={`Move ${performance.songTitle} earlier`}
          icon={<ArrowUp className="size-4" />}
          disabled={index === 0}
          onClick={() =>
            onAction(() =>
              engine.request('performances.move', { id: performance.id, position: index - 1 }),
            )
          }
        />
        <IconButton
          label={`Move ${performance.songTitle} later`}
          icon={<ArrowDown className="size-4" />}
          disabled={index === count - 1}
          onClick={() =>
            onAction(() =>
              engine.request('performances.move', { id: performance.id, position: index + 1 }),
            )
          }
        />
        <IconButton
          label={`Remove ${performance.songTitle} from this setlist`}
          tone="danger"
          icon={<X className="size-4" />}
          onClick={() =>
            onAction(() => engine.request('performances.remove', { id: performance.id }))
          }
        />
      </div>
    </li>
  )
}

function ArrangementPicker({
  performance,
  onAction,
}: {
  performance: Performance
  onAction: (task: () => Promise<unknown>) => void
}) {
  const song = useEngineQuery('songs.get', { id: performance.songId })
  const arrangements = song.data?.arrangements ?? []
  const editable = performance.status === 'planned'

  return (
    <Select
      aria-label={`Arrangement of ${performance.songTitle}`}
      value={performance.arrangementId ?? ''}
      disabled={!editable || song.data === undefined}
      onChange={(event) => {
        const arrangementId = event.target.value
        if (arrangementId) {
          onAction(() =>
            engine.request('performances.setArrangement', { id: performance.id, arrangementId }),
          )
        }
      }}
      className="h-8 text-[13px]"
    >
      {performance.arrangementId === null ? (
        <option value="">Arrangement deleted (copy kept)</option>
      ) : null}
      {song.data === undefined && performance.arrangementName ? (
        <option value={performance.arrangementId ?? ''}>{performance.arrangementName}</option>
      ) : null}
      {arrangements.map((arrangement) => (
        <option key={arrangement.id} value={arrangement.id}>
          {arrangement.name}
        </option>
      ))}
    </Select>
  )
}
