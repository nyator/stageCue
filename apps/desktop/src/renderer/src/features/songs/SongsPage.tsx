import { MagnifyingGlass, MusicNotesSimple, Plus } from '@phosphor-icons/react'
import type { SongSummary } from '@stagecue/arrangement'
import { useMemo, useState } from 'react'
import { useEngineQuery } from '../../engine/hooks'
import { formatMeter, formatTimestamp, plural } from '../../lib/format'
import { navigate } from '../../navigation/router'
import { Button } from '../../ui/button'
import { EmptyState, QueryView } from '../../ui/feedback'
import { controlClass } from '../../ui/styles'
import { PageHeader } from '../../ui/page'
import { SongFormDialog } from './SongFormDialog'

function openSong(songId: string) {
  navigate({ name: 'song', songId, tab: 'arrangements', arrangementId: null })
}

export function SongsPage() {
  const query = useEngineQuery('songs.list', {})
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const newSongButton = (
    <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
      New song
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Songs"
        description={query.data ? plural(query.data.length, 'song') : 'Your song library'}
        actions={newSongButton}
      />
      <div className="px-8 pb-10">
        <QueryView query={query}>
          {(songs) =>
            songs.length === 0 ? (
              <EmptyState
                icon={<MusicNotesSimple className="size-5" />}
                title="No songs yet"
                action={newSongButton}
              >
                Add a song, then describe its sections: intro, verses, choruses, bridge.
                Arrangements put those sections in the order your team plays them.
              </EmptyState>
            ) : (
              <SongTable songs={songs} search={search} onSearch={setSearch} />
            )
          }
        </QueryView>
      </div>
      <SongFormDialog
        open={creating}
        song={null}
        onClose={() => setCreating(false)}
        onSaved={(songId) => {
          setCreating(false)
          navigate({ name: 'song', songId, tab: 'sections', arrangementId: null })
        }}
      />
    </>
  )
}

function SongTable({
  songs,
  search,
  onSearch,
}: {
  songs: SongSummary[]
  search: string
  onSearch: (value: string) => void
}) {
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return songs
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(needle) || song.artist?.toLowerCase().includes(needle),
    )
  }, [songs, search])

  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <MagnifyingGlass
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <input
          type="search"
          aria-label="Search songs"
          placeholder="Search by title or writer"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className={`${controlClass} h-9 w-full pl-9`}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-sm text-muted">No songs match “{search.trim()}”.</p>
      ) : (
        <table className="w-full table-fixed text-left text-sm">
          <thead className="text-xs text-faint">
            <tr className="border-b border-line-soft">
              <th className="pb-2 font-medium">Song</th>
              <th className="w-16 pb-2 font-medium">Key</th>
              <th className="w-20 pb-2 font-medium">Tempo</th>
              <th className="w-20 pb-2 font-medium">Meter</th>
              <th className="w-24 pb-2 font-medium">Sections</th>
              <th className="w-32 pb-2 font-medium">Arrangements</th>
              <th className="w-40 pb-2 font-medium">Edited</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((song) => (
              <tr
                key={song.id}
                onClick={() => openSong(song.id)}
                className="cursor-default border-b border-line-soft transition-colors duration-150 hover:bg-panel"
              >
                <td className="py-3 pr-4">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      openSong(song.id)
                    }}
                    className="block max-w-full truncate text-left font-medium text-ink"
                  >
                    {song.title}
                  </button>
                  <span className="block truncate text-xs text-faint">
                    {song.artist ?? 'Unknown writer'}
                  </span>
                </td>
                <td className="py-3 text-muted">{song.defaultKey ?? '–'}</td>
                <td className="py-3 font-mono text-muted">{song.tempoBpm ?? '–'}</td>
                <td className="py-3 font-mono text-muted">{formatMeter(song.timeSignature)}</td>
                <td className="py-3 font-mono text-muted">{song.sectionCount}</td>
                <td className="py-3 font-mono text-muted">{song.arrangementCount}</td>
                <td className="py-3 whitespace-nowrap text-faint">
                  {formatTimestamp(song.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
