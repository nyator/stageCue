import { useRef, type ReactNode } from 'react'
import { useElementHeight } from '../../live/use-element-height'

export type TallyState = 'on' | 'held' | 'preview'

const TALLY: Record<TallyState, string> = {
  on: 'bg-cue text-cue-ink',
  held: 'bg-warn text-[oklch(0.22_0.04_80)]',
  preview: 'bg-raised text-muted ring-1 ring-line',
}

/** The narrowest the right-hand column may get. */
const ASIDE_MIN = '19rem'

/**
 * Two columns that fill the page without scrolling and without a gap: the
 * left holds a monitor at the largest 16:9 size the height allows, with what
 * goes above and below it at the same width; the right takes all the width
 * that is left, never less than 19rem.
 */
export function MonitorColumns({
  above,
  monitor,
  below,
  aside,
  className = '',
}: {
  above?: ReactNode
  monitor: ReactNode
  below?: ReactNode
  aside: ReactNode
  className?: string
}) {
  const aboveRef = useRef<HTMLDivElement>(null)
  const belowRef = useRef<HTMLDivElement>(null)
  // Everything in the left column that is not the picture. 4px absorbs rounding.
  const chrome = useElementHeight(aboveRef) + useElementHeight(belowRef) + 4

  return (
    <div className={`min-h-0 flex-1 [container-type:size] ${className}`}>
      <div
        className="grid h-full gap-8"
        style={{
          // Left: as wide as the space allows, but no wider than a 16:9 picture
          // (plus its 1rem frame) that fits the height. Right: the rest.
          gridTemplateColumns: `min(calc(100cqw - ${ASIDE_MIN} - 2rem), calc((100cqh - ${chrome}px - 1rem) * 16 / 9 + 1rem)) minmax(0, 1fr)`,
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        <div className="flex min-h-0 min-w-0 flex-col">
          <div ref={aboveRef} className="shrink-0">
            {above}
          </div>
          {monitor}
          <div ref={belowRef} className="flex shrink-0 flex-col gap-4 pt-4">
            {below}
          </div>
        </div>
        {aside}
      </div>
    </div>
  )
}

/**
 * A preview framed like a broadcast monitor: the picture, with a tally chip in
 * its corner saying whether this is what the room sees.
 */
export function Monitor({
  tally,
  label,
  caption,
  children,
}: {
  tally: TallyState
  label: string
  caption?: ReactNode
  children: ReactNode
}) {
  return (
    <figure className="min-w-0">
      <div className="relative rounded-xl bg-[oklch(0.13_0.008_165)] p-2 ring-1 ring-line-soft">
        {children}
        <span
          className={`absolute top-4 left-4 flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-xs leading-none font-medium transition-colors duration-200 ${TALLY[tally]}`}
        >
          {tally === 'on' ? (
            <span className="size-1.5 rounded-full bg-cue-ink" aria-hidden />
          ) : null}
          {label}
        </span>
      </div>
      {caption ? (
        <figcaption className="mt-3 text-xs leading-relaxed text-faint">{caption}</figcaption>
      ) : null}
    </figure>
  )
}
