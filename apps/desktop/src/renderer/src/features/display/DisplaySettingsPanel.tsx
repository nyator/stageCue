import { MAX_EARLY_MS, type DisplaySettings } from '@stagecue/arrangement'
import { useId } from 'react'
import { Switch } from '../../ui/field'
import { GroupLabel } from '../../ui/page'
import { Segmented } from '../../ui/segmented'

interface DisplaySettingsPanelProps {
  value: DisplaySettings
  onChange: (value: DisplaySettings) => void
}

const OUTPUT_SIZE_OPTIONS = [
  { value: '1080p', label: '1080p (HD)' },
  { value: '4k', label: '4K' },
] as const

const POSITIONS = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
] as const

/** The band's look, grouped the way a volunteer thinks about it: where, colours, size, what shows. */
export function DisplaySettingsPanel({ value, onChange }: DisplaySettingsPanelProps) {
  const set = <K extends keyof DisplaySettings>(key: K, next: DisplaySettings[K]) =>
    onChange({ ...value, [key]: next })
  const ids = {
    position: useId(),
    colours: useId(),
    size: useId(),
    show: useId(),
    output: useId(),
    outputSize: useId(),
  }

  return (
    <div className="flex flex-col divide-y divide-line-soft">
      <section className="pb-5">
        <GroupLabel as="span">
          <span id={ids.position}>Position</span>
        </GroupLabel>
        <Segmented
          labelledBy={ids.position}
          options={POSITIONS}
          value={value.position}
          onChange={(position) => set('position', position)}
          stretch
        />
      </section>

      <div role="group" aria-labelledby={ids.colours} className="py-5">
        <GroupLabel as="span">
          <span id={ids.colours}>Colours</span>
        </GroupLabel>
        <div className="flex flex-col gap-1">
          <ColorRow
            label="Background"
            value={value.background}
            onChange={(c) => set('background', c)}
          />
          <ColorRow label="Text" value={value.text} onChange={(c) => set('text', c)} />
          <ColorRow label="Highlight" value={value.accent} onChange={(c) => set('accent', c)} />
        </div>
      </div>

      <div role="group" aria-labelledby={ids.size} className="py-5">
        <GroupLabel as="span">
          <span id={ids.size}>Size and see-through</span>
        </GroupLabel>
        <div className="flex flex-col gap-5">
          <RangeRow
            label="Text size"
            min={0.75}
            max={1.5}
            step={0.05}
            value={value.scale}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set('scale', v)}
          />
          <RangeRow
            label="Background opacity"
            min={0}
            max={1}
            step={0.05}
            value={value.backgroundOpacity}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set('backgroundOpacity', v)}
          />
        </div>
      </div>

      <div role="group" aria-labelledby={ids.show} className="py-5">
        <GroupLabel as="span">
          <span id={ids.show}>Show</span>
        </GroupLabel>
        <div className="flex flex-col gap-3.5">
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
        </div>
      </div>
      <div role="group" aria-labelledby={ids.output} className="flex flex-col gap-5 pt-5">
        <GroupLabel as="span">
          <span id={ids.output}>ProPresenter output</span>
        </GroupLabel>
        <div className="-mt-2.5 flex flex-col gap-2">
          <span id={ids.outputSize} className="text-sm text-ink">
            Output size
          </span>
          <Segmented
            labelledBy={ids.outputSize}
            options={OUTPUT_SIZE_OPTIONS}
            value={value.outputSize}
            onChange={(size) => set('outputSize', size)}
            stretch
          />
          <p className="text-xs leading-relaxed text-faint">
            Match ProPresenter’s output. 4K is sharper on 4K screens but works the computer harder.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <RangeRow
            label="Show cues early"
            min={0}
            max={MAX_EARLY_MS}
            step={10}
            value={value.earlyMs}
            format={(v) => (v === 0 ? 'Off' : `${v} ms`)}
            onChange={(v) => set('earlyMs', v)}
          />
          <p className="text-xs leading-relaxed text-faint">
            If the screen changes after the music, slide this up until the 4, 3, 2, 1 lands on the
            beat. Most setups need 50 to 150 ms. Only the output to ProPresenter moves.
          </p>
        </div>
      </div>
    </div>
  )
}

/** A swatch that opens the system colour picker, with the hex value beside it. */
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
    <label
      htmlFor={id}
      className="group -mx-2 flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-raised"
    >
      <span className="relative size-7 shrink-0">
        <span
          className="absolute inset-0 rounded-full ring-1 ring-line ring-offset-2 ring-offset-panel transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-95"
          style={{ background: value }}
          aria-hidden
        />
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="peer absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
        />
        <span
          className="pointer-events-none absolute -inset-1 rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-cue"
          aria-hidden
        />
      </span>
      <span className="flex-1 text-sm text-ink">{label}</span>
      <span className="font-mono text-xs text-faint uppercase">{value}</span>
    </label>
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
        <label htmlFor={id} className="text-sm text-ink">
          {label}
        </label>
        <span className="font-mono text-xs text-muted tabular-nums">{format(value)}</span>
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
