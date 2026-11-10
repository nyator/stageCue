import { Plus, Rows, Stack } from '@phosphor-icons/react'
import type { Arrangement, SongDetail } from '@stagecue/arrangement'
import { useState } from 'react'
import { engine } from '../../engine'
import { useAction } from '../../engine/hooks'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { EmptyState, InlineError } from '../../ui/feedback'
import { Field, TextInput } from '../../ui/field'
import { ArrangementEditor } from './ArrangementEditor'

interface ArrangementWorkspaceProps {
  song: SongDetail
  selectedId: string | null
  onSelect: (arrangementId: string | null) => void
  onEditSections: () => void
}

export function ArrangementWorkspace({
  song,
  selectedId,
  onSelect,
  onEditSections,
}: ArrangementWorkspaceProps) {
  const [creating, setCreating] = useState(false)
  const selected =
    song.arrangements.find((a) => a.id === selectedId) ?? song.arrangements[0] ?? null

  if (song.sections.length === 0) {
    return (
      <EmptyState
        icon={<Rows className="size-5" />}
        title="Add sections first"
        action={<Button onClick={onEditSections}>Add sections</Button>}
      >
        An arrangement is an order of sections, so {song.title} needs its sections before you can
        arrange it.
      </EmptyState>
    )
  }

  const newButton = (
    <Button
      size="sm"
      variant="ghost"
      icon={<Plus className="size-4" />}
      onClick={() => setCreating(true)}
    >
      New arrangement
    </Button>
  )

  return (
    <>
      {selected ? (
        <>
          <div
            className="mb-5 flex flex-wrap items-center gap-1"
            role="tablist"
            aria-label="Arrangements"
          >
            {song.arrangements.map((arrangement) => {
              const active = arrangement.id === selected.id
              return (
                <button
                  key={arrangement.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(arrangement.id)}
                  className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors duration-150 ${
                    active ? 'bg-raised text-ink' : 'text-muted hover:bg-panel hover:text-ink'
                  }`}
                >
                  {arrangement.name}
                </button>
              )
            })}
            <span className="mx-1 h-4 w-px bg-line-soft" aria-hidden />
            {newButton}
          </div>
          <ArrangementEditor
            key={selected.id}
            song={song}
            arrangement={selected}
            onDeleted={() => onSelect(null)}
          />
        </>
      ) : (
        <EmptyState
          icon={<Stack className="size-5" />}
          title="No arrangements yet"
          action={newButton}
        >
          An arrangement is the order your team plays the sections in, with repeats and
          instructions. A song can have several, such as a short version and a Sunday morning
          version.
        </EmptyState>
      )}

      {creating ? (
        <NewArrangementDialog
          song={song}
          onClose={() => setCreating(false)}
          onCreated={(arrangement) => {
            setCreating(false)
            onSelect(arrangement.id)
          }}
        />
      ) : null}
    </>
  )
}

function NewArrangementDialog({
  song,
  onClose,
  onCreated,
}: {
  song: SongDetail
  onClose: () => void
  onCreated: (arrangement: Arrangement) => void
}) {
  const [name, setName] = useState('')
  const [copyFromId, setCopyFromId] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const action = useAction()

  const submit = async () => {
    if (!name.trim()) {
      setNameError('Give the arrangement a name, such as “Sunday morning”.')
      return
    }
    const created = await action.run(() =>
      engine.request('arrangements.create', { songId: song.id, name, copyFromId }),
    )
    if (created) onCreated(created)
  }

  const options = [
    { id: null, label: 'Every section once, in song order' },
    ...song.arrangements.map((a) => ({ id: a.id, label: `A copy of “${a.name}”` })),
  ]

  return (
    <Dialog
      open
      title="New arrangement"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={action.pending}>
            Create arrangement
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" error={nameError}>
          {(control) => (
            <TextInput
              {...control}
              autoFocus
              maxLength={60}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setNameError(null)
              }}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-muted">Start from</legend>
          {options.map((option) => (
            <label
              key={option.id ?? 'song-order'}
              className="flex items-center gap-2.5 text-sm text-ink"
            >
              <input
                type="radio"
                name="copy-from"
                checked={copyFromId === option.id}
                onChange={() => setCopyFromId(option.id)}
                className="size-4 accent-[var(--color-cue)]"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <InlineError message={action.error} />
      </div>
    </Dialog>
  )
}
