import type { SectionType } from '@stagecue/arrangement'
import { typeBackground } from '../../ui/type-colors'

export interface TimelineBlock {
  key: string
  name: string
  type: SectionType
  startBar: number
  endBar: number
  repeatCount: number
}

interface TimelineProps {
  blocks: TimelineBlock[]
  selectedKey?: string | null
  onSelect?: (key: string) => void
  /** Compact strips omit labels and the bar ruler. */
  compact?: boolean
  label: string
}

/** Proportional bar map of an arrangement. Repeats show as divided blocks. */
export function Timeline({ blocks, selectedKey, onSelect, compact = false, label }: TimelineProps) {
  const total = blocks.reduce((sum, block) => sum + block.endBar - block.startBar + 1, 0)
  if (total === 0) return null
  const first = blocks[0]!
  const last = blocks.at(-1)!

  return (
    <figure aria-label={label} className="m-0">
      <div className={`flex w-full gap-px overflow-hidden rounded-md ${compact ? 'h-2' : 'h-12'}`}>
        {blocks.map((block) => {
          const bars = block.endBar - block.startBar + 1
          const selected = block.key === selectedKey
          const className = `relative flex min-w-[3px] gap-0.5 overflow-hidden text-left transition-[opacity,filter] duration-150 ${
            selectedKey && !selected ? 'opacity-55 hover:opacity-90' : ''
          }`
          const segments = (
            <>
              {Array.from({ length: block.repeatCount }, (_, pass) => (
                <span
                  key={pass}
                  className={`h-full flex-1 ${typeBackground[block.type]}`}
                />
              ))}
              {!compact ? (
                <span className="absolute inset-x-1.5 top-1.5 truncate text-[11px] leading-tight font-semibold text-booth">
                  {block.name}
                  {block.repeatCount > 1 ? ` ×${block.repeatCount}` : ''}
                </span>
              ) : null}
              {selected && !compact ? (
                <span className="absolute inset-0 rounded-[3px] ring-2 ring-ink ring-inset" />
              ) : null}
            </>
          )
          return onSelect && !compact ? (
            <button
              key={block.key}
              type="button"
              title={`${block.name}, bars ${block.startBar} to ${block.endBar}`}
              aria-label={`${block.name}, bars ${block.startBar} to ${block.endBar}`}
              aria-pressed={selected}
              onClick={() => onSelect(block.key)}
              style={{ flexGrow: bars, flexBasis: 0 }}
              className={className}
            >
              {segments}
            </button>
          ) : (
            <span key={block.key} style={{ flexGrow: bars, flexBasis: 0 }} className={className}>
              {segments}
            </span>
          )
        })}
      </div>
      {!compact ? (
        <figcaption className="mt-1.5 flex justify-between font-mono text-[11px] text-faint">
          <span>Bar {first.startBar}</span>
          <span>Bar {last.endBar}</span>
        </figcaption>
      ) : null}
    </figure>
  )
}
