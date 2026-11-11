/** Two or three choices side by side, one always chosen. A radio group to assistive technology. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelledBy,
  stretch = false,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  labelledBy: string
  stretch?: boolean
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const move = (step: number) => {
    const next = options[(index + step + options.length) % options.length]
    if (next) onChange(next.value)
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(1)
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(-1)
        else return
        event.preventDefault()
        const group = event.currentTarget
        requestAnimationFrame(() =>
          group.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(),
        )
      }}
      className={`relative grid rounded-lg bg-booth p-1 ring-1 ring-line-soft ${stretch ? 'w-full' : 'w-fit'}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* One thumb slides under the chosen option. */}
      <span
        className="absolute inset-y-1 left-1 rounded-md bg-raised ring-1 ring-line transition-transform duration-200 ease-[var(--ease-out-strong)] motion-reduce:transition-none"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
        aria-hidden
      />
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`relative h-7 rounded-md px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ${
              checked ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
