import { MagnifyingGlass } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { engine } from '../../engine'
import { useAction, useEngineQuery } from '../../engine/hooks'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { InlineError, SkeletonRows } from '../../ui/feedback'
import { controlClass } from '../../ui/styles'

interface AddSongDialogProps {
  setlistId: string
  onClose: () => void
}

/** Mount only while open. Pick a song, then one of its arrangements. */
export function AddSongDialog({ setlistId, onClose }: AddSongDialogProps) {
  const songs = useEngineQuery('songs.list', {})
  const [search, setSearch] = useState('')
  const [songId, setSongId] = useState<string | null>(null)
  const [arrangementId, setArrangementId] = useState<string | null>(null)
  const song = useEngineQuery('songs.get', songId ? { id: songId } : null)
  const action = useAction()

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (songs.data ?? []).filter((s) => !needle || s.title.toLowerCase().includes(needle))
  }, [songs.data, search])

  const arrangements = song.data?.arrangements ?? []
  const chosenArrangement = arrangementId ?? arrangements[0]?.id ?? null

  const add = async () => {
    if (!songId || !chosenArrangement) return
    const result = await action.run(() =>
      engine.request('performances.add', { setlistId, songId, arrangementId: chosenArrangement }),
    )
    if (result) onClose()
  }

  return (
    <Dialog
      open
      title="Add a song"
      description="The setlist keeps its own copy of the arrangement, so later edits do not change it."
      width="lg"
      onClose={onClose}
      onSubmit={() => void add()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!chosenArrangement}
            loading={action.pending}
          >
            Add to setlist
          </Button>
        </>
      }
    >
      <div className="grid h-80 grid-cols-2 gap-5">
        <div className="flex min-h-0 flex-col">
          <div className="relative mb-2">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <input
              type="search"
              aria-label="Search songs"
              placeholder="Search songs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${controlClass} h-9 w-full pl-9`}
            />
          </div>
          <div role="listbox" aria-label="Songs" className="min-h-0 flex-1 overflow-y-auto">
            {songs.data === undefined ? (
              <SkeletonRows rows={5} className="h-9" />
            ) : filtered.length === 0 ? (
              <p className="p-2 text-sm text-muted">No songs found.</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={s.id === songId}
                  disabled={s.arrangementCount === 0}
                  onClick={() => {
                    setSongId(s.id)
                    setArrangementId(null)
                  }}
                  className={`flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors duration-150 disabled:opacity-50 ${
                    s.id === songId ? 'bg-cue-wash' : 'hover:bg-raised'
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${s.id === songId ? 'text-cue' : 'text-ink'}`}
                  >
                    {s.title}
                  </span>
                  <span className="text-xs text-faint">
                    {s.arrangementCount === 0
                      ? 'No arrangements yet'
                      : (s.artist ?? 'Unknown writer')}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <fieldset className="flex min-h-0 flex-col">
          <legend className="mb-2 text-[13px] font-medium text-muted">Arrangement</legend>
          {!songId ? (
            <p className="text-sm text-faint">Choose a song to see its arrangements.</p>
          ) : song.data === undefined ? (
            <SkeletonRows rows={2} className="h-12" />
          ) : (
            <div className="flex flex-col gap-1 overflow-y-auto">
              {arrangements.map((arrangement) => (
                <label
                  key={arrangement.id}
                  className={`flex cursor-default items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150 ${
                    chosenArrangement === arrangement.id ? 'bg-raised' : 'hover:bg-raised/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="arrangement"
                    checked={chosenArrangement === arrangement.id}
                    onChange={() => setArrangementId(arrangement.id)}
                    className="size-4 accent-[var(--color-cue)]"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm text-ink">{arrangement.name}</span>
                    <span className="text-xs text-faint">
                      {arrangement.entries.length} sections
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>
      <div className="mt-4">
        <InlineError message={action.error ?? songs.error} />
      </div>
    </Dialog>
  )
}
