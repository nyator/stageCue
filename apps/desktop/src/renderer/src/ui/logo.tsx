/**
 * StageCue's mark: the band itself, reduced to a tile. A bold bar for the
 * current section, a short one for what comes next, and a progress line two
 * thirds of the way along. The one hand-drawn icon the app allows.
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-cue" />
      <g className="fill-cue-ink">
        <rect x="8" y="8.5" width="16" height="5" rx="1.5" />
        <rect x="11.5" y="16" width="9" height="2.5" rx="1.25" opacity="0.6" />
        <rect x="6" y="23" width="20" height="2.5" rx="1.25" opacity="0.28" />
        <rect x="6" y="23" width="13.5" height="2.5" rx="1.25" />
      </g>
    </svg>
  )
}

/** The mark with the name beside it, as the app's header shows it. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
        Stage<span className="text-cue">Cue</span>
      </span>
    </span>
  )
}
