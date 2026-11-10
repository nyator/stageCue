import { ArrowLeft, PencilSimple, Trash } from '@phosphor-icons/react'
import type { SongDetail } from '@stagecue/arrangement'
import { useState } from 'react'
import { engine } from '../../engine'
import { useEngineQuery } from '../../engine/hooks'
import { formatMeter } from '../../lib/format'
import { navigate, type Route } from '../../navigation/router'
import { Button, IconButton } from '../../ui/button'
import { ConfirmDialog } from '../../ui/confirm'
import { QueryView, SkeletonRows } from '../../ui/feedback'
import { PageHeader } from '../../ui/page'
import { ArrangementWorkspace } from './ArrangementWorkspace'
import { SectionsEditor } from './SectionsEditor'
import { SongFormDialog } from './SongFormDialog'

type SongRoute = Extract<Route, { name: 'song' }>

export function SongPage({ route }: { route: SongRoute }) {
  const query = useEngineQuery('songs.get', { id: route.songId })

  return (
    <QueryView
      query={query}
      skeleton={
        <div className="p-8">
          <SkeletonRows rows={6} className="h-12" />
        </div>
      }
    >
      {(song) => <SongView song={song} route={route} />}
    </QueryView>
  )
}

const TABS = [
  { id: 'arrangements', label: 'Arrangements' },
  { id: 'sections', label: 'Sections' },
] as const

function SongView({ song, route }: { song: SongDetail; route: SongRoute }) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const details = [
    song.artist,
    song.defaultKey ? `Key of ${song.defaultKey}` : null,
    song.tempoBpm ? `${song.tempoBpm} BPM` : null,
    formatMeter(song.timeSignature),
  ].filter(Boolean)

  const setTab = (tab: SongRoute['tab']) => navigate({ ...route, tab })

  return (
    <>
      <PageHeader
        above={
          <button
            type="button"
            onClick={() => navigate({ name: 'songs' })}
            className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Songs
          </button>
        }
        title={song.title}
        description={details.join(' · ')}
        actions={
          <>
            <Button icon={<PencilSimple className="size-4" />} onClick={() => setEditing(true)}>
              Edit details
            </Button>
            <IconButton
              label="Delete song"
              tone="danger"
              size="md"
              icon={<Trash className="size-4" />}
              onClick={() => setDeleting(true)}
            />
          </>
        }
      />

      <div
        role="tablist"
        aria-label="Song views"
        className="flex gap-6 border-b border-line-soft px-8"
      >
        {TABS.map((tab) => {
          const selected = route.tab === tab.id
          const count = tab.id === 'sections' ? song.sections.length : song.arrangements.length
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setTab(tab.id)}
              className={`relative -mb-px flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors duration-150 ${
                selected ? 'border-cue text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              <span className="font-mono text-xs text-faint">{count}</span>
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="px-8 py-6">
        {route.tab === 'sections' ? (
          <SectionsEditor key={song.id} song={song} />
        ) : (
          <ArrangementWorkspace
            song={song}
            selectedId={route.arrangementId}
            onSelect={(arrangementId) => navigate({ ...route, arrangementId })}
            onEditSections={() => setTab('sections')}
          />
        )}
      </div>

      <SongFormDialog
        open={editing}
        song={song}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
      <ConfirmDialog
        open={deleting}
        title={`Delete ${song.title}?`}
        confirmLabel="Delete song"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await engine.request('songs.delete', { id: song.id })
          navigate({ name: 'songs' })
        }}
      >
        <p>
          This removes the song, its {song.sections.length} sections, and its{' '}
          {song.arrangements.length} arrangements. It cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  )
}
