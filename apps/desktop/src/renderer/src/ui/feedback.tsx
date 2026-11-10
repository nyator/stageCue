import { WarningCircle, WifiSlash } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { useEngineState } from '../engine'

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-alert-wash px-3 py-2 text-sm text-alert"
    >
      <WarningCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  )
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  children: ReactNode
  action?: ReactNode
}

/** Explains what belongs here and how to add it. */
export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-soft px-6 py-8">
      <span className="text-faint" aria-hidden>
        {icon}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-1 max-w-[52ch] text-sm text-muted">{children}</p>
      </div>
      {action}
    </div>
  )
}

export function SkeletonRows({
  rows = 4,
  className = 'h-11',
}: {
  rows?: number
  className?: string
}) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`animate-pulse rounded-md bg-raised ${className}`} />
      ))}
    </div>
  )
}

interface QueryViewProps<T> {
  query: { data: T | undefined; error: string | null }
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}

/** Renders data, or the right placeholder: offline, error, or loading. */
export function QueryView<T>({ query, skeleton, children }: QueryViewProps<T>) {
  const connection = useEngineState()

  if (query.data !== undefined) {
    return <>{children(query.data)}</>
  }
  if (connection.phase !== 'connected') {
    return (
      <EmptyState icon={<WifiSlash className="size-5" />} title="Waiting for the engine">
        StageCue reconnects on its own as soon as the engine is reachable. Check that the engine is
        running, or change its address under Connection.
      </EmptyState>
    )
  }
  if (query.error) {
    return <InlineError message={query.error} />
  }
  return <>{skeleton ?? <SkeletonRows />}</>
}
