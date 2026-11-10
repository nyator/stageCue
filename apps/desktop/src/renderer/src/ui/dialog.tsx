import { X } from '@phosphor-icons/react'
import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { IconButton } from './button'

interface DialogProps {
  open: boolean
  title: string
  description?: string | undefined
  onClose: () => void
  /** When set, the body is a form and Enter submits it. */
  onSubmit?: () => void
  footer: ReactNode
  width?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const widths = {
  sm: 'w-[min(420px,calc(100vw-48px))]',
  md: 'w-[min(520px,calc(100vw-48px))]',
  lg: 'w-[min(720px,calc(100vw-48px))]',
}

/** Native modal dialog: focus trapping, Escape, and the inert background come from the browser. */
export function Dialog({
  open,
  title,
  description,
  onClose,
  onSubmit,
  footer,
  width = 'md',
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit?.()
  }

  const body = (
    <>
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        <IconButton
          label="Close"
          icon={<X className="size-4" />}
          onClick={onClose}
          className="-mr-2"
        />
      </div>
      <div className="px-6 py-5">{children}</div>
      <div className="flex justify-end gap-2 border-t border-line-soft px-6 py-4">{footer}</div>
    </>
  )

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`m-auto max-h-[calc(100dvh-48px)] rounded-xl border border-line-soft bg-panel p-0 text-ink shadow-2xl shadow-black/40 ${widths[width]}`}
    >
      {open ? onSubmit ? <form onSubmit={handleSubmit}>{body}</form> : body : null}
    </dialog>
  )
}
