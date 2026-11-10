import type { ReactNode } from 'react'

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
