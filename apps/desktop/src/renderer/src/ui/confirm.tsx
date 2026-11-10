import type { ReactNode } from 'react'
import { useAction } from '../engine/hooks'
import { Button } from './button'
import { Dialog } from './dialog'
import { InlineError } from './feedback'

interface ConfirmDialogProps {
  open: boolean
  title: string
  confirmLabel: string
  onClose: () => void
  /** Runs the action. The dialog stays open and shows the error if it fails. */
  onConfirm: () => Promise<unknown>
  children: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  onClose,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const action = useAction()

  const close = () => {
    action.clearError()
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={title}
      width="sm"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            className="text-alert"
            loading={action.pending}
            onClick={() => void action.run(onConfirm)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-muted">
        {children}
        <InlineError message={action.error} />
      </div>
    </Dialog>
  )
}
