import { controlClass, controlSize } from './styles'
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

interface FieldProps {
  label: string
  hint?: string | undefined
  error?: string | null | undefined
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean
  className?: string
  children: (control: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: true
  }) => ReactNode
}

/** Label above, hint and error below, all wired to the control for assistive tech. */
export function Field({ label, hint, error, hideLabel, className = '', children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-[13px] font-medium text-muted'}>
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
      })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      className={`${controlClass} ${controlSize(className)} ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${controlClass} ${controlSize(className)} pr-8 ${className}`} {...props} />
  )
}

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${controlClass} w-full min-h-20 py-2 leading-normal ${className}`}
      {...props}
    />
  )
}

interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: number | null
  onValueChange: (value: number | null) => void
}

/** A number field that reports null when empty, never NaN. */
export function NumberInput({ value, onValueChange, className = '', ...props }: NumberInputProps) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value ?? ''}
      onChange={(event) => {
        const next = event.target.valueAsNumber
        onValueChange(Number.isFinite(next) ? next : null)
      }}
      className={`${controlClass} ${controlSize(className)} font-mono ${className}`}
      {...props}
    />
  )
}

interface SwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}

export function Switch({ label, checked, onChange, description }: SwitchProps) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="flex flex-col">
        <span className="text-sm text-ink">{label}</span>
        {description ? <span className="text-xs text-faint">{description}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${checked ? 'bg-cue' : 'bg-line'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-ink transition-transform duration-150 ease-out ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </div>
  )
}
