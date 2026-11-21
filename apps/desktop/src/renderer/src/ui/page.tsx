import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'bad' | 'off'

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-cue',
  warn: 'bg-warn',
  bad: 'bg-alert',
  off: 'bg-line',
}

/**
 * Every page opens the same way: its name, then one sentence on whether it is
 * in order, as a polite live region. Actions, if any, sit at the right.
 */
export function PageHeader({
  title,
  status,
  tone,
  actions,
}: {
  title: string
  status: ReactNode
  tone: Tone
  actions?: ReactNode
}) {
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        <p role="status" aria-live="polite" className="flex items-center gap-2.5 text-sm text-ink">
          <span
            className={`size-2 shrink-0 translate-y-[-1px] rounded-full ${TONE_DOT[tone]}`}
            aria-hidden
          />
          {status}
        </p>
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

/** A small label over a group of facts or controls, in sentence case. */
export function GroupLabel({
  children,
  as: Tag = 'h3',
}: {
  children: ReactNode
  as?: 'h3' | 'legend' | 'span'
}) {
  return <Tag className="mb-2.5 block text-xs font-medium text-muted">{children}</Tag>
}
