import { VOCAL_PART_LABELS, type CueFrame, type DisplaySettings } from '@stagecue/arrangement'
import type { CSSProperties } from 'react'

interface ChoirDisplayProps {
  frame: CueFrame | null
  settings: DisplaySettings
}

/**
 * The arrangement band the choir reads. Sized in container units so it looks
 * the same in a small preview and on a projector.
 */
export function ChoirDisplay({ frame, settings }: ChoirDisplayProps) {
  if (!frame) return null

  const { current, next, pass, totalPasses } = frame
  const scale = settings.scale
  const size = (cqw: number): CSSProperties => ({ fontSize: `calc(${cqw}cqw * ${scale})` })
  const parts = current.vocalParts.map((part) => VOCAL_PART_LABELS[part]).join(' · ')

  return (
    <div
      className={`absolute inset-x-0 flex items-stretch justify-between gap-[3cqw] px-[3.5cqw] py-[2cqw] ${
        settings.position === 'top' ? 'top-0' : 'bottom-0'
      }`}
      style={{
        background: `color-mix(in srgb, ${settings.background} ${Math.round(settings.backgroundOpacity * 100)}%, transparent)`,
        color: settings.text,
      }}
    >
      <div className="flex min-w-0 flex-col justify-center gap-[0.6cqw]">
        <div
          className="font-bold tracking-[0.12em] uppercase"
          style={{ ...size(1.3), color: settings.accent }}
        >
          Now
        </div>
        <div
          className="truncate leading-none font-bold tracking-[-0.01em] uppercase"
          style={size(5)}
        >
          {current.name}
        </div>
        {settings.showVocalParts && parts ? (
          <div className="truncate font-semibold tracking-[0.04em] uppercase" style={size(1.9)}>
            {parts}
          </div>
        ) : null}
        {settings.showInstructions && current.instructions ? (
          <div className="truncate opacity-85" style={size(1.7)}>
            {current.instructions}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-center gap-[1cqw] text-right">
        {settings.showRepeat && totalPasses > 1 ? (
          <div
            className="font-bold tracking-[0.06em] uppercase"
            style={{ ...size(2.2), color: settings.accent }}
          >
            Repeat {pass} of {totalPasses}
          </div>
        ) : null}
        {settings.showNext ? (
          <div className="font-semibold tracking-[0.06em] uppercase" style={size(1.9)}>
            <span className="opacity-70">Next </span>
            {next ? next.name : 'End of song'}
          </div>
        ) : null}
      </div>
    </div>
  )
}
