import { CircleNotch } from '@phosphor-icons/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,color,border-color,transform] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'

const variants: Record<Variant, string> = {
  primary: 'bg-cue text-cue-ink hover:bg-cue-strong',
  secondary: 'border border-line-soft bg-raised text-ink hover:border-line hover:bg-hover',
  ghost: 'text-muted hover:bg-raised hover:text-ink',
  danger: 'text-alert hover:bg-alert-wash',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: ReactNode
  size?: Size
  tone?: 'default' | 'danger'
}

/** A square button with an icon. label is its accessible name and tooltip. */
export function IconButton({
  label,
  icon,
  size = 'sm',
  tone = 'default',
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  const toneClass =
    tone === 'danger'
      ? 'text-faint hover:bg-alert-wash hover:text-alert'
      : 'text-faint hover:bg-raised hover:text-ink'
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`${base} ${toneClass} ${size === 'sm' ? 'size-8' : 'size-9'} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  )
}
