import { ArrowDown, ArrowUp, CopySimple, Minus, Plus, Trash } from '@phosphor-icons/react'
import {
  arrangementInputSchema,
  SECTION_TYPE_LABELS,
  type Arrangement,
  type SongDetail,
  type SongSection,
} from '@stagecue/arrangement'
import { useMemo, useState } from 'react'
import { engine } from '../../engine'
import { useAction } from '../../engine/hooks'
import { estimateDuration, formatBarRange, plural, vocalPartsLabel } from '../../lib/format'
import { useUnsavedChangesGuard } from '../../navigation/router'
import { Button, IconButton } from '../../ui/button'
import { ConfirmDialog } from '../../ui/confirm'
import { InlineError } from '../../ui/feedback'
import { Field, NumberInput, Switch, TextInput } from '../../ui/field'
import { TypeLabel, TypeSwatch, VocalPartPicker } from '../../ui/music'
import {
  arrangementDraft,
  arrangementToInput,
  duplicateEntry,
  insertEntry,
  isArrangementDirty,
  moveEntry,
  placeEntries,
  removeEntry,
  updateEntry,
  type ArrangementDraft,
  type EntryDraft,
} from './drafts'
import { Timeline } from './Timeline'

interface ArrangementEditorProps {
  song: SongDetail
  arrangement: Arrangement
  onDeleted: () => void
}

interface EditorState {
  base: Arrangement
  draft: ArrangementDraft
}

export function ArrangementEditor({ song, arrangement, onDeleted }: ArrangementEditorProps) {
  const [state, setState] = useState<EditorState>(() => ({
    base: arrangement,
    draft: arrangementDraft(arrangement),
  }))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const action = useAction()

  const { draft, base } = state
  const dirty = isArrangementDirty(draft, base)
  const remoteChanged = arrangement.updatedAt !== base.updatedAt
  useUnsavedChangesGuard(dirty)

  // Adopt a newer version saved elsewhere, unless there are local edits to protect.
  if (remoteChanged && !dirty) {
    setState({ base: arrangement, draft: arrangementDraft(arrangement) })
  }

  const sectionsById = useMemo(() => new Map(song.sections.map((s) => [s.id, s])), [song.sections])
  const placed = placeEntries(draft)
  const totalBars = placed.reduce((sum, entry) => sum + entry.endBar - entry.startBar + 1, 0)
  const tempo = draft.tempoBpm ?? song.tempoBpm
  const duration = estimateDuration(totalBars, tempo, song.timeSignature)

  const setDraft = (update: (current: ArrangementDraft) => ArrangementDraft) => {
    setInvalid(null)
    setState((current) => ({ ...current, draft: update(current.draft) }))
  }
  const patchEntry = (key: string, patch: Partial<Omit<EntryDraft, 'key'>>) =>
    setDraft((current) => updateEntry(current, key, patch))

  const addSection = (section: SongSection) => {
    const result = insertEntry(draft, section, selectedKey)
    setDraft(() => result.draft)
    setSelectedKey(result.key)
  }

  const save = async () => {
    const parsed = arrangementInputSchema.safeParse(arrangementToInput(draft))
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? '')
      setInvalid(
        field === 'name'
          ? 'Give the arrangement a name.'
          : field === 'startBar'
            ? 'The start bar must be 1 or later.'
            : field === 'tempoBpm'
              ? 'Tempo must be between 20 and 400 BPM.'
              : 'Every section needs at least 1 bar and 1 pass.',
      )
      return
    }
    const saved = await action.run(() =>
      engine.request('arrangements.save', {
        id: arrangement.id,
        arrangement: arrangementToInput(draft),
      }),
    )
    if (saved) {
      setState({ base: saved, draft: arrangementDraft(saved) })
      setSelectedKey(null)
    }
  }

  const blocks = placed.map((entry) => {
    const section = sectionsById.get(entry.songSectionId)
    return {
      key: entry.key,
      name: section?.name ?? 'Missing section',
      type: section?.type ?? 'other',
      startBar: entry.startBar,
      endBar: entry.endBar,
      repeatCount: entry.repeatCount,
    }
  })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_15rem] gap-x-8">
      <div className="col-span-2 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name" className="w-56">
            {(control) => (
              <TextInput
                {...control}
                maxLength={60}
                value={draft.name}
                onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
              />
            )}
          </Field>
          <Field label="Starts at bar" className="w-28">
            {(control) => (
              <NumberInput
                {...control}
                min={1}
                value={draft.startBar}
                onValueChange={(startBar) => setDraft((d) => ({ ...d, startBar: startBar ?? 0 }))}
              />
            )}
          </Field>
          <Field label="Tempo" className="w-24">
            {(control) => (
              <NumberInput
                {...control}
                min={20}
                max={400}
                placeholder={song.tempoBpm ? String(song.tempoBpm) : 'BPM'}
                value={draft.tempoBpm}
                onValueChange={(tempoBpm) => setDraft((d) => ({ ...d, tempoBpm }))}
              />
            )}
          </Field>
          <Field label="Key" className="w-20">
            {(control) => (
              <TextInput
                {...control}
                maxLength={12}
                placeholder={song.defaultKey ?? ''}
                value={draft.songKey}
                onChange={(event) => setDraft((d) => ({ ...d, songKey: event.target.value }))}
              />
            )}
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            label="Delete arrangement"
            tone="danger"
            size="md"
            icon={<Trash className="size-4" />}
            onClick={() => setDeleting(true)}
          />
          <Button
            variant="ghost"
            disabled={!dirty || action.pending}
            onClick={() => {
              setState({ base: arrangement, draft: arrangementDraft(arrangement) })
              setInvalid(null)
              action.clearError()
            }}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            disabled={!dirty}
            loading={action.pending}
            onClick={() => void save()}
          >
            Save arrangement
          </Button>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mt-4 flex flex-col gap-2">
          {remoteChanged && dirty ? (
            <p className="rounded-md bg-raised px-3 py-2 text-sm text-warn">
              Someone else saved this arrangement while you were editing. Saving now replaces their
              version with yours.
            </p>
          ) : null}
          <InlineError message={invalid ?? action.error} />
        </div>

        <p className="mt-5 mb-2 text-[13px] text-muted">
          {plural(draft.entries.length, 'section')} · <span className="font-mono">{totalBars}</span>{' '}
          bars
          {duration ? (
            <>
              {' '}
              · about <span className="font-mono">{duration}</span> at {tempo} BPM
            </>
          ) : null}
        </p>
        <Timeline
          label={`Bar map of ${draft.name}`}
          blocks={blocks}
          selectedKey={selectedKey}
          onSelect={(key) => setSelectedKey((current) => (current === key ? null : key))}
        />

        {draft.entries.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-line-soft px-6 py-8 text-sm text-muted">
            This arrangement is empty. Add sections from the list on the right, in the order the
            team plays them.
          </p>
        ) : (
          <ol className="mt-6 flex flex-col">
            {placed.map((entry, index) => {
              const section = sectionsById.get(entry.songSectionId)
              if (!section) return null
              return (
                <EntryRow
                  key={entry.key}
                  entry={entry}
                  section={section}
                  index={index}
                  count={placed.length}
                  selected={entry.key === selectedKey}
                  onToggle={() =>
                    setSelectedKey((current) => (current === entry.key ? null : entry.key))
                  }
                  onChange={(patch) => patchEntry(entry.key, patch)}
                  onMove={(delta) => setDraft((d) => moveEntry(d, entry.key, delta))}
                  onDuplicate={() => setDraft((d) => duplicateEntry(d, entry.key))}
                  onRemove={() => {
                    setDraft((d) => removeEntry(d, entry.key))
                    setSelectedKey(null)
                  }}
                />
              )
            })}
          </ol>
        )}
      </div>

      <aside className="self-start rounded-xl bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">Add a section</h3>
        <p className="mt-1 mb-3 text-xs text-faint">
          {selectedKey ? 'Inserts after the selected row.' : 'Adds to the end.'}
        </p>
        <ul className="flex flex-col gap-0.5">
          {song.sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => addSection(section)}
                className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-ink transition-colors duration-150 hover:bg-raised"
              >
                <TypeSwatch type={section.type} />
                <span className="min-w-0 flex-1 truncate">{section.name}</span>
                <span className="font-mono text-xs text-faint">{section.lengthBars}</span>
                <Plus className="size-3.5 text-faint group-hover:text-cue" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <ConfirmDialog
        open={deleting}
        title={`Delete “${arrangement.name}”?`}
        confirmLabel="Delete arrangement"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await engine.request('arrangements.delete', { id: arrangement.id })
          setDeleting(false)
          onDeleted()
        }}
      >
        <p>
          Setlists that use it keep their own copy of the sections, so planned services are not
          affected.
        </p>
      </ConfirmDialog>
    </div>
  )
}

interface EntryRowProps {
  entry: EntryDraft & { startBar: number; endBar: number }
  section: SongSection
  index: number
  count: number
  selected: boolean
  onToggle: () => void
  onChange: (patch: Partial<Omit<EntryDraft, 'key'>>) => void
  onMove: (delta: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
}

function EntryRow({
  entry,
  section,
  index,
  count,
  selected,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: EntryRowProps) {
  const parts = entry.vocalParts ?? section.vocalParts
  const instructions = entry.instructions?.trim() || section.instructions
  const overridden = entry.vocalParts !== null || Boolean(entry.instructions?.trim())

  return (
    <li
      className={`border-b border-line-soft transition-colors duration-150 ${selected ? 'bg-panel' : ''}`}
    >
      <div className="grid grid-cols-[28px_minmax(0,1fr)_7.5rem_auto_auto] items-center gap-3 px-2 py-2.5">
        <span className="font-mono text-xs text-faint">{String(index + 1).padStart(2, '0')}</span>
        <button
          type="button"
          aria-expanded={selected}
          onClick={onToggle}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <TypeSwatch type={section.type} className="h-8 w-1" />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium text-ink">{section.name}</span>
              {showTypeLabel(section) ? <TypeLabel type={section.type} /> : null}
              {overridden ? (
                <span className="rounded bg-cue-wash px-1.5 text-[11px] font-medium text-cue">
                  Custom
                </span>
              ) : null}
            </span>
            <span className="block truncate text-xs text-faint">
              {vocalPartsLabel(parts)}
              {instructions ? ` · ${instructions}` : ''}
            </span>
          </span>
        </button>
        <span className="font-mono text-xs text-muted">
          {formatBarRange(entry.startBar, entry.endBar)}
        </span>
        <div className="flex items-center gap-1.5">
          <NumberInput
            aria-label={`Bars per pass for ${section.name}`}
            min={1}
            max={999}
            value={entry.barsPerPass}
            onValueChange={(bars) => onChange({ barsPerPass: bars ?? 0 })}
            className="h-8 w-16 text-[13px]"
          />
          <RepeatStepper
            name={section.name}
            value={entry.repeatCount}
            onChange={(repeatCount) => onChange({ repeatCount })}
          />
        </div>
        <div className="flex items-center">
          <IconButton
            label={`Move ${section.name} up`}
            icon={<ArrowUp className="size-4" />}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <IconButton
            label={`Move ${section.name} down`}
            icon={<ArrowDown className="size-4" />}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          />
          <IconButton
            label={`Duplicate ${section.name}`}
            icon={<CopySimple className="size-4" />}
            onClick={onDuplicate}
          />
          <IconButton
            label={`Remove ${section.name}`}
            tone="danger"
            icon={<Trash className="size-4" />}
            onClick={onRemove}
          />
        </div>
      </div>

      {selected ? (
        <div className="enter grid grid-cols-2 gap-x-6 gap-y-4 px-2 pt-1 pb-5 pl-[52px]">
          <div className="col-span-2 flex flex-col gap-3">
            <Switch
              label="Use the section’s vocal parts"
              description={vocalPartsLabel(section.vocalParts)}
              checked={entry.vocalParts === null}
              onChange={(useDefault) =>
                onChange({ vocalParts: useDefault ? null : section.vocalParts })
              }
            />
            {entry.vocalParts !== null ? (
              <VocalPartPicker
                label={`Vocal parts for ${section.name} in this arrangement`}
                value={entry.vocalParts}
                onChange={(vocalParts) => onChange({ vocalParts })}
              />
            ) : null}
          </div>
          <Field label="Choir instruction" hint="Leave empty to use the section’s instruction.">
            {(control) => (
              <TextInput
                {...control}
                maxLength={280}
                placeholder={section.instructions ?? 'No instruction'}
                value={entry.instructions ?? ''}
                onChange={(event) => onChange({ instructions: event.target.value })}
              />
            )}
          </Field>
          <Field label="Director notes" hint="For the band and director. Not shown to the choir.">
            {(control) => (
              <TextInput
                {...control}
                maxLength={1000}
                value={entry.notes}
                onChange={(event) => onChange({ notes: event.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}
    </li>
  )
}

/** The type is worth showing only when the name does not already say it, as in “Refrain”. */
function showTypeLabel(section: SongSection): boolean {
  return !section.name.toLowerCase().startsWith(SECTION_TYPE_LABELS[section.type].toLowerCase())
}

function RepeatStepper({
  name,
  value,
  onChange,
}: {
  name: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div
      role="group"
      aria-label={`Passes of ${name}`}
      className="flex h-8 items-center rounded-md border border-line-soft bg-raised"
    >
      <button
        type="button"
        aria-label={`Fewer passes of ${name}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className="flex h-full w-7 items-center justify-center text-faint transition-colors hover:text-ink disabled:opacity-40"
      >
        <Minus className="size-3" />
      </button>
      <span className="w-7 text-center font-mono text-[13px] text-ink" aria-live="polite">
        ×{value}
      </span>
      <button
        type="button"
        aria-label={`More passes of ${name}`}
        disabled={value >= 99}
        onClick={() => onChange(value + 1)}
        className="flex h-full w-7 items-center justify-center text-faint transition-colors hover:text-ink disabled:opacity-40"
      >
        <Plus className="size-3" />
      </button>
    </div>
  )
}
