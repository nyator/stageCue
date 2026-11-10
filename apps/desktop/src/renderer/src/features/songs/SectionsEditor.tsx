import { ArrowDown, ArrowUp, Plus, Rows, Trash } from '@phosphor-icons/react'
import {
  SECTION_TYPE_LABELS,
  SECTION_TYPES,
  type SectionType,
  type SongDetail,
} from '@stagecue/arrangement'
import { useMemo, useState } from 'react'
import { engine } from '../../engine'
import { useAction } from '../../engine/hooks'
import { plural } from '../../lib/format'
import { useUnsavedChangesGuard } from '../../navigation/router'
import { Button, IconButton } from '../../ui/button'
import { EmptyState, InlineError } from '../../ui/feedback'
import { NumberInput, Select, TextInput } from '../../ui/field'
import { TypeSwatch, VocalPartPicker } from '../../ui/music'
import {
  addSection,
  moveSection,
  removeSection,
  sectionDrafts,
  sectionsToInput,
  updateSection,
  validateSections,
  type SectionDraft,
} from './drafts'

const QUICK_ADD: SectionType[] = ['intro', 'verse', 'chorus', 'bridge', 'vamp', 'ending']

export function SectionsEditor({ song }: { song: SongDetail }) {
  const [saved, setSaved] = useState(song.sections)
  const [drafts, setDrafts] = useState(() => sectionDrafts(song.sections))
  const [showErrors, setShowErrors] = useState(false)
  const [addType, setAddType] = useState<SectionType>('other')
  const action = useAction()

  const dirty = useMemo(
    () =>
      JSON.stringify(sectionsToInput(drafts)) !==
      JSON.stringify(sectionsToInput(sectionDrafts(saved))),
    [drafts, saved],
  )
  useUnsavedChangesGuard(dirty)

  // Adopt changes saved elsewhere, unless the user is in the middle of editing.
  if (!dirty && song.sections !== saved) {
    setSaved(song.sections)
    setDrafts(sectionDrafts(song.sections))
  }

  const errors = validateSections(drafts)
  const update = (key: string, patch: Partial<SectionDraft>) =>
    setDrafts((d) => updateSection(d, key, patch))

  const save = async () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true)
      return
    }
    const result = await action.run(() =>
      engine.request('sections.save', { songId: song.id, sections: sectionsToInput(drafts) }),
    )
    if (result) {
      setShowErrors(false)
      setSaved(result.sections)
      setDrafts(sectionDrafts(result.sections))
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-[60ch] text-sm text-muted">
          Sections are the building blocks of {song.title}. Arrangements use them in any order, as
          many times as needed. Parts and instructions here are the defaults the choir sees.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            disabled={!dirty || action.pending}
            onClick={() => {
              setDrafts(sectionDrafts(saved))
              setShowErrors(false)
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
            Save sections
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <InlineError message={action.error} />
      </div>

      {drafts.length === 0 ? (
        <EmptyState icon={<Rows className="size-5" />} title="No sections yet">
          Start with the parts of the song as written, such as Intro, Verse 1, Chorus, and Ending.
          Use the buttons below to add them.
        </EmptyState>
      ) : (
        <ol className="flex flex-col">
          {drafts.map((draft, index) => (
            <SectionRow
              key={draft.key}
              draft={draft}
              index={index}
              count={drafts.length}
              error={showErrors ? errors[draft.key] : undefined}
              onChange={(patch) => update(draft.key, patch)}
              onMove={(delta) => setDrafts((d) => moveSection(d, draft.key, delta))}
              onRemove={() => setDrafts((d) => removeSection(d, draft.key))}
            />
          ))}
        </ol>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-faint">Add</span>
        {QUICK_ADD.map((type) => (
          <Button
            key={type}
            size="sm"
            icon={<TypeSwatch type={type} className="h-3 w-1" />}
            onClick={() => setDrafts((d) => addSection(d, type))}
          >
            {SECTION_TYPE_LABELS[type]}
          </Button>
        ))}
        <div className="flex items-center gap-1">
          <Select
            aria-label="Other section type"
            value={addType}
            onChange={(event) => setAddType(event.target.value as SectionType)}
            className="h-8 w-40 text-[13px]"
          >
            {SECTION_TYPES.filter((type) => !QUICK_ADD.includes(type)).map((type) => (
              <option key={type} value={type}>
                {SECTION_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
          <IconButton
            label={`Add ${SECTION_TYPE_LABELS[addType]}`}
            icon={<Plus className="size-4" />}
            onClick={() => setDrafts((d) => addSection(d, addType))}
          />
        </div>
      </div>
      {drafts.length > 0 ? (
        <p className="mt-4 text-xs text-faint">
          {plural(drafts.length, 'section')} ·{' '}
          {drafts.reduce((sum, draft) => sum + (draft.lengthBars ?? 0), 0)} bars if each is played
          once
        </p>
      ) : null}
    </div>
  )
}

interface SectionRowProps {
  draft: SectionDraft
  index: number
  count: number
  error: string | undefined
  onChange: (patch: Partial<SectionDraft>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

function SectionRow({ draft, index, count, error, onChange, onMove, onRemove }: SectionRowProps) {
  const label = draft.name.trim() || `section ${index + 1}`
  return (
    <li className="grid grid-cols-[28px_1fr_auto] gap-x-3 gap-y-3 border-b border-line-soft py-4 first:pt-0">
      <span className="pt-2 font-mono text-xs text-faint">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TypeSwatch type={draft.type} className="h-6 w-1" />
          <TextInput
            aria-label={`Name of ${label}`}
            aria-invalid={error ? true : undefined}
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className="w-48 font-medium"
          />
          <Select
            aria-label={`Type of ${label}`}
            value={draft.type}
            onChange={(event) => onChange({ type: event.target.value as SectionType })}
            className="w-40"
          >
            {SECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {SECTION_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <NumberInput
              aria-label={`Length of ${label} in bars`}
              aria-invalid={error ? true : undefined}
              min={1}
              max={999}
              value={draft.lengthBars}
              onValueChange={(lengthBars) => onChange({ lengthBars })}
              className="w-20"
            />
            <span className="text-[13px] text-faint">bars</span>
          </div>
        </div>
        <VocalPartPicker
          label={`Vocal parts for ${label}`}
          value={draft.vocalParts}
          onChange={(vocalParts) => onChange({ vocalParts })}
        />
        <TextInput
          aria-label={`Instructions for ${label}`}
          placeholder="Instruction for the choir, such as “Women only, softly”"
          value={draft.instructions}
          maxLength={280}
          onChange={(event) => onChange({ instructions: event.target.value })}
        />
        {error ? <p className="text-xs text-alert">{error}</p> : null}
      </div>

      <div className="flex items-start gap-0.5">
        <IconButton
          label={`Move ${label} up`}
          icon={<ArrowUp className="size-4" />}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        />
        <IconButton
          label={`Move ${label} down`}
          icon={<ArrowDown className="size-4" />}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        />
        <IconButton
          label={`Remove ${label}`}
          tone="danger"
          icon={<Trash className="size-4" />}
          onClick={onRemove}
        />
      </div>
    </li>
  )
}
