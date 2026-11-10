import {
  SECTION_TYPE_LABELS,
  VOCAL_PART_LABELS,
  VOCAL_PARTS,
  type SectionType,
  type VocalPart,
} from '@stagecue/arrangement'
import { typeBackground, typeText } from './type-colors'

export function TypeSwatch({
  type,
  className = 'h-4 w-1',
}: {
  type: SectionType
  className?: string
}) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${typeBackground[type]} ${className}`}
      aria-hidden
    />
  )
}

export function TypeLabel({ type }: { type: SectionType }) {
  return (
    <span className={`text-xs font-medium ${typeText[type]}`}>{SECTION_TYPE_LABELS[type]}</span>
  )
}

interface VocalPartPickerProps {
  value: VocalPart[]
  onChange: (parts: VocalPart[]) => void
  label: string
}

/** Toggle chips, kept in canonical part order. */
export function VocalPartPicker({ value, onChange, label }: VocalPartPickerProps) {
  const toggle = (part: VocalPart) => {
    const next = value.includes(part) ? value.filter((p) => p !== part) : [...value, part]
    onChange(VOCAL_PARTS.filter((p) => next.includes(p)))
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {VOCAL_PARTS.map((part) => {
        const active = value.includes(part)
        return (
          <button
            key={part}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(part)}
            className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 ${
              active
                ? 'border-cue/50 bg-cue-wash text-cue'
                : 'border-line-soft text-muted hover:border-line hover:text-ink'
            }`}
          >
            {VOCAL_PART_LABELS[part]}
          </button>
        )
      })}
    </div>
  )
}
