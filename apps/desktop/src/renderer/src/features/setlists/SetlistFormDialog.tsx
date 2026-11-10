import { setlistInputSchema, type SetlistSummary } from '@stagecue/arrangement'
import { useState } from 'react'
import { engine } from '../../engine'
import { useAction } from '../../engine/hooks'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { InlineError } from '../../ui/feedback'
import { Field, TextInput } from '../../ui/field'

interface SetlistFormDialogProps {
  setlist: SetlistSummary | null
  onClose: () => void
  onSaved: (setlistId: string) => void
}

/** Mount only while open. Creates a setlist, or edits the given one. */
export function SetlistFormDialog({ setlist, onClose, onSaved }: SetlistFormDialogProps) {
  const [name, setName] = useState(setlist?.name ?? '')
  const [serviceDate, setServiceDate] = useState(setlist?.serviceDate ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const action = useAction()

  const submit = async () => {
    const input = { name, serviceDate: serviceDate || null, notes: setlist?.notes ?? null }
    if (!setlistInputSchema.safeParse(input).success) {
      setNameError('Give the setlist a name, such as “Sunday Morning Service”.')
      return
    }
    const saved = await action.run(() =>
      setlist
        ? engine.request('setlists.update', { id: setlist.id, setlist: input })
        : engine.request('setlists.create', input),
    )
    if (saved) onSaved(saved.id)
  }

  return (
    <Dialog
      open
      title={setlist ? 'Edit setlist' : 'New setlist'}
      width="sm"
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={action.pending}>
            {setlist ? 'Save changes' : 'Create setlist'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" error={nameError}>
          {(control) => (
            <TextInput
              {...control}
              autoFocus
              maxLength={80}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setNameError(null)
              }}
            />
          )}
        </Field>
        <Field label="Service date" hint="Optional. Upcoming services appear on the dashboard.">
          {(control) => (
            <TextInput
              {...control}
              type="date"
              value={serviceDate}
              onChange={(event) => setServiceDate(event.target.value)}
              className="w-48 [color-scheme:dark]"
            />
          )}
        </Field>
        <InlineError message={action.error} />
      </div>
    </Dialog>
  )
}
