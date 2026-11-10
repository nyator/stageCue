import { ArrowRight, CalendarBlank, MonitorPlay, Plus } from '@phosphor-icons/react'
import { totalBars, type SetlistSummary } from '@stagecue/arrangement'
import { useState } from 'react'
import { useEngineQuery } from '../../engine/hooks'
import { useEngineState } from '../../engine'
import {
  estimateDuration,
  formatServiceDate,
  formatTimestamp,
  plural,
  relativeDay,
  todayIso,
} from '../../lib/format'
import { nextService } from '../../lib/setlists'
import { navigate } from '../../navigation/router'
import { Button } from '../../ui/button'
import { EmptyState, QueryView, SkeletonRows } from '../../ui/feedback'
import { PageHeader, SectionHeading } from '../../ui/page'
import { SetlistFormDialog } from '../setlists/SetlistFormDialog'
import { Timeline } from '../songs/Timeline'

export function DashboardPage() {
  const setlists = useEngineQuery('setlists.list', {})
  const songs = useEngineQuery('songs.list', {})
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader title="Dashboard" description={formatServiceDate(todayIso())} />
      <div className="grid grid-cols-[minmax(0,1fr)_18rem] gap-10 px-8 pb-10">
        <div className="min-w-0">
          <QueryView query={setlists} skeleton={<SkeletonRows rows={5} className="h-14" />}>
            {(list) => {
              const next = nextService(list)
              return next ? (
                <NextService setlist={next} />
              ) : (
                <EmptyState
                  icon={<CalendarBlank className="size-5" />}
                  title="No upcoming service"
                  action={
                    <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                      Plan a service
                    </Button>
                  }
                >
                  Create a setlist with a date and it appears here, with its running order and the
                  arrangement of each song.
                </EmptyState>
              )
            }}
          </QueryView>
        </div>

        <aside className="flex flex-col gap-8">
          <SystemStatus />
          <section>
            <SectionHeading
              actions={
                <button
                  type="button"
                  onClick={() => navigate({ name: 'songs' })}
                  className="text-xs text-faint hover:text-ink"
                >
                  All songs
                </button>
              }
            >
              Recently edited
            </SectionHeading>
            <QueryView query={songs} skeleton={<SkeletonRows rows={4} className="h-9" />}>
              {(list) =>
                list.length === 0 ? (
                  <p className="text-sm text-muted">No songs yet.</p>
                ) : (
                  <ul className="flex flex-col">
                    {[...list]
                      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                      .slice(0, 5)
                      .map((song) => (
                        <li key={song.id}>
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                name: 'song',
                                songId: song.id,
                                tab: 'arrangements',
                                arrangementId: null,
                              })
                            }
                            className="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-panel"
                          >
                            <span className="truncate text-sm text-ink">{song.title}</span>
                            <span className="shrink-0 text-xs text-faint">
                              {formatTimestamp(song.updatedAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )
              }
            </QueryView>
          </section>
        </aside>
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

function NextService({ setlist: summary }: { setlist: SetlistSummary }) {
  const query = useEngineQuery('setlists.get', { id: summary.id })

  return (
    <section aria-labelledby="next-service">
      <p className="text-[13px] font-medium text-cue">
        Next service · {summary.serviceDate ? relativeDay(summary.serviceDate) : ''}
      </p>
      <h2 id="next-service" className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-ink">
        {summary.name}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {formatServiceDate(summary.serviceDate)} · {plural(summary.performanceCount, 'song')}
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          onClick={() => navigate({ name: 'setlists', setlistId: summary.id })}
        >
          Open setlist
          <ArrowRight className="size-4" />
        </Button>
        <Button
          icon={<MonitorPlay className="size-4" />}
          disabled={summary.performanceCount === 0}
          onClick={() => navigate({ name: 'display', setlistId: summary.id, performanceId: null })}
        >
          Preview display
        </Button>
      </div>

      <div className="mt-8">
        <QueryView
          query={query}
          skeleton={<SkeletonRows rows={summary.performanceCount || 3} className="h-16" />}
        >
          {(setlist) =>
            setlist.performances.length === 0 ? (
              <p className="text-sm text-muted">No songs added yet.</p>
            ) : (
              <ol className="flex flex-col">
                {setlist.performances.map((performance, index) => {
                  const bars = totalBars(performance.sections)
                  const duration = estimateDuration(
                    bars,
                    performance.tempoBpm,
                    performance.timeSignature,
                  )
                  return (
                    <li
                      key={performance.id}
                      className="grid grid-cols-[28px_minmax(0,14rem)_minmax(0,1fr)] items-center gap-4 border-b border-line-soft py-3.5"
                    >
                      <span className="font-mono text-xs text-faint">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{performance.songTitle}</p>
                        <p className="truncate text-xs text-faint">
                          {[
                            performance.arrangementName ?? 'Saved copy',
                            performance.songKey,
                            duration,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <Timeline
                        compact
                        label={`Sections of ${performance.songTitle}`}
                        blocks={performance.sections.map((section) => ({
                          ...section,
                          key: section.id,
                        }))}
                      />
                    </li>
                  )
                })}
              </ol>
            )
          }
        </QueryView>
      </div>
    </section>
  )
}

function SystemStatus() {
  const state = useEngineState()
  const clients = state.phase === 'connected' ? state.status.clients.length : 0

  const rows: { label: string; value: string; tone: 'ok' | 'off' | 'warn' }[] = [
    {
      label: 'Engine',
      value:
        state.phase === 'connected'
          ? 'Connected'
          : state.phase === 'connecting'
            ? 'Connecting'
            : 'Offline',
      tone: state.phase === 'connected' ? 'ok' : 'warn',
    },
    {
      label: 'StageCue computers',
      value: state.phase === 'connected' ? plural(clients, 'online', 'online') : 'Unknown',
      tone: state.phase === 'connected' ? 'ok' : 'off',
    },
    { label: 'Ableton Live', value: 'Not available yet', tone: 'off' },
    { label: 'Logic Pro', value: 'Not available yet', tone: 'off' },
    { label: 'ProPresenter', value: 'Not available yet', tone: 'off' },
  ]

  const toneClass = { ok: 'bg-cue', warn: 'bg-warn', off: 'bg-line' }

  return (
    <section>
      <SectionHeading
        actions={
          <button
            type="button"
            onClick={() => navigate({ name: 'connection' })}
            className="text-xs text-faint hover:text-ink"
          >
            Details
          </button>
        }
      >
        System
      </SectionHeading>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-line-soft py-2 text-sm"
          >
            <span className="text-muted">{row.label}</span>
            <span className="flex items-center gap-2 text-ink">
              <span className={`size-1.5 rounded-full ${toneClass[row.tone]}`} aria-hidden />
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
