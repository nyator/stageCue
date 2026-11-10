import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  /** Small line above the title, such as a back link. */
  above?: ReactNode
}

export function PageHeader({ title, description, actions, above }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-8 pt-7 pb-6">
      <div className="min-w-0">
        {above}
        <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-balance text-ink">
          {title}
        </h1>
        {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function SectionHeading({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {actions}
    </div>
  )
}
