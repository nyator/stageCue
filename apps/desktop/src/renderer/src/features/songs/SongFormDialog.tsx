import { songInputSchema, type Song, type SongInput } from '@stagecue/arrangement'
import { useState } from 'react'
import { engine } from '../../engine'
import { useAction } from '../../engine/hooks'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { InlineError } from '../../ui/feedback'
import { Field, NumberInput, Select, TextInput } from '../../ui/field'

interface SongFormDialogProps {
  open: boolean
  /** Edit this song, or create a new one when null. */
  song: Song | null
  onClose: () => void
  onSaved: (songId: string) => void
}

const DENOMINATORS = [2, 4, 8, 16] as const

function initialValues(song: Song | null): SongInput {
  return {
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    defaultKey: song?.defaultKey ?? '',
    tempoBpm: song?.tempoBpm ?? null,
    timeSignature: song?.timeSignature ?? { numerator: 4, denominator: 4 },
    notes: song?.notes ?? '',
  }
}

export function SongFormDialog({ open, song, onClose, onSaved }: SongFormDialogProps) {
  // Mounted only while open, so each opening starts from the current song.
  return open ? <SongForm song={song} onClose={onClose} onSaved={onSaved} /> : null
}

function SongForm({ song, onClose, onSaved }: Omit<SongFormDialogProps, 'open'>) {
  const [values, setValues] = useState(() => initialValues(song))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const action = useAction()

  const set = <K extends keyof SongInput>(key: K, value: SongInput[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    const parsed = songInputSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0])
        next[field] ??=
          field === 'title'
            ? 'Enter the song title.'
            : field === 'tempoBpm'
              ? 'Tempo must be between 20 and 400 BPM.'
              : issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    const saved = await action.run(() =>
      song
        ? engine.request('songs.update', { id: song.id, song: values })
        : engine.request('songs.create', values),
    )
    if (saved) onSaved(saved.id)
  }

  return (
    <Dialog
      open
      title={song ? 'Edit song details' : 'New song'}
      description={song ? undefined : 'Add the basics now. You will describe its sections next.'}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={action.pending}>
            {song ? 'Save changes' : 'Create song'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title" error={errors.title} className="col-span-2">
          {(control) => (
            <TextInput
              {...control}
              autoFocus
              value={values.title}
              onChange={(event) => set('title', event.target.value)}
            />
          )}
        </Field>
        <Field label="Writer or artist" className="col-span-2">
          {(control) => (
            <TextInput
              {...control}
              value={values.artist ?? ''}
              onChange={(event) => set('artist', event.target.value)}
            />
          )}
        </Field>
        <Field label="Key" hint="For example G, Bb, or F#m">
          {(control) => (
            <TextInput
              {...control}
              value={values.defaultKey ?? ''}
              onChange={(event) => set('defaultKey', event.target.value)}
            />
          )}
        </Field>
        <Field label="Tempo (BPM)" error={errors.tempoBpm}>
          {(control) => (
            <NumberInput
              {...control}
              min={20}
              max={400}
              value={values.tempoBpm}
              onValueChange={(tempo) => set('tempoBpm', tempo)}
            />
          )}
        </Field>
        <Field label="Beats per bar" error={errors.timeSignature}>
          {(control) => (
            <NumberInput
              {...control}
              min={1}
              max={32}
              value={values.timeSignature.numerator}
              onValueChange={(numerator) =>
                set('timeSignature', { ...values.timeSignature, numerator: numerator ?? 0 })
              }
            />
          )}
        </Field>
        <Field label="Beat unit">
          {(control) => (
            <Select
              {...control}
              value={values.timeSignature.denominator}
              onChange={(event) =>
                set('timeSignature', {
                  ...values.timeSignature,
                  denominator: Number(event.target.value) as (typeof DENOMINATORS)[number],
                })
              }
            >
              {DENOMINATORS.map((denominator) => (
                <option key={denominator} value={denominator}>
                  {denominator === 4
                    ? '4 (quarter note)'
                    : denominator === 8
                      ? '8 (eighth note)'
                      : denominator}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="mt-4">
        <InlineError message={action.error} />
      </div>
    </Dialog>
  )
}
