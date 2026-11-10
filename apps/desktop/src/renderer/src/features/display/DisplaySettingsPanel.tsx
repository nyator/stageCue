import type { DisplaySettings } from '@stagecue/arrangement'
import { useId } from 'react'
import { Switch } from '../../ui/field'

interface DisplaySettingsPanelProps {
  value: DisplaySettings
  onChange: (value: DisplaySettings) => void
}

export function DisplaySettingsPanel({ value, onChange }: DisplaySettingsPanelProps) {
  const set = <K extends keyof DisplaySettings>(key: K, next: DisplaySettings[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-muted">Position</legend>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-raised p-1">
          {(['top', 'bottom'] as const).map((position) => (
            <button
              key={position}
              type="button"
              aria-pressed={value.position === position}
              onClick={() => set('position', position)}
              className={`h-7 rounded text-[13px] font-medium capitalize transition-colors duration-150 ${
                value.position === position ? 'bg-hover text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {position}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-[13px] font-medium text-muted">Colours</legend>
        <ColorRow
          label="Background"
          value={value.background}
          onChange={(c) => set('background', c)}
        />
        <ColorRow label="Text" value={value.text} onChange={(c) => set('text', c)} />
        <ColorRow label="Highlight" value={value.accent} onChange={(c) => set('accent', c)} />
      </fieldset>

      <RangeRow
        label="Background opacity"
        min={0}
        max={1}
        step={0.05}
        value={value.backgroundOpacity}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => set('backgroundOpacity', v)}
      />
      <RangeRow
        label="Text size"
        min={0.75}
        max={1.5}
        step={0.05}
        value={value.scale}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => set('scale', v)}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[13px] font-medium text-muted">Show</legend>
        <Switch
          label="Extra line"
          description="Text after | in the marker name"
          checked={value.showDetail}
          onChange={(v) => set('showDetail', v)}
        />
        <Switch
          label="Next section"
          checked={value.showNext}
          onChange={(v) => set('showNext', v)}
        />
        <Switch
          label="Countdown"
          description="Bars to go, then 4, 3, 2, 1 on the beat"
          checked={value.showCountdown}
          onChange={(v) => set('showCountdown', v)}
        />
        <Switch
          label="Progress bar"
          description="Fills across the band as the section nears its end"
          checked={value.showProgress}
          onChange={(v) => set('showProgress', v)}
        />
      </fieldset>
    </div>
  )
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs text-faint uppercase">{value}</span>
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-line-soft bg-raised p-0.5"
        />
      </span>
    </div>
  )
}

interface RangeRowProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  format: (value: number) => string
  onChange: (value: number) => void
}

function RangeRow({ label, min, max, step, value, format, onChange }: RangeRowProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
        </label>
        <span className="font-mono text-xs text-faint">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className="accent-[var(--color-cue)]"
      />
    </div>
  )
}
