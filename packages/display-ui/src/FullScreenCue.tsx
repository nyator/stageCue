import type { CueView, DisplaySettings } from '@stagecue/arrangement'
import type { CSSProperties } from 'react'

interface FullScreenCueProps {
  view: CueView
  settings: DisplaySettings
  /** A quiet note in the corner, such as “Waiting for Ableton”. Null for none. */
  status?: string | null
}

/** Brightest on the beat, fading before the next one. */
function pulse(phase: number): number {
  return (1 - phase) ** 3
}

const mix = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${Math.round(percent)}%, transparent)`

/**
 * The cue as the whole picture, for a TV or screen with no lyrics on it.
 * Sizes follow the smaller side of the screen (cqmin), so it reads the same in
 * landscape, portrait, or a small preview; long names shrink to fit the width.
 * Its parent must be a container (the `@container` class) that fills the screen.
 */
export function FullScreenCue({ view, settings, status = null }: FullScreenCueProps) {
  const { current, next, countdown, progress } = view
  const s = settings.scale
  const min = (value: number) => `calc(${value}cqmin * ${s})`
  const text = (value: number): CSSProperties => ({ fontSize: min(value) })

  const lead = current ?? next
  const leadIsNext = current === null && next !== null

  // Uppercase bold letters are about 0.62 em wide: fit the name to 92% of the width.
  const labelSize = lead
    ? `min(${min(17)}, ${(92 / Math.max(lead.label.length * 0.62, 1)).toFixed(2)}cqw)`
    : '0'

  const finalBeats = settings.showCountdown ? (countdown?.finalBeats ?? null) : null
  const bars = settings.showCountdown && countdown && finalBeats === null ? countdown.bars : null
  const strength = finalBeats !== null ? pulse(view.beatPhase) : 0
  const nextLabel = leadIsNext ? null : next?.label

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: settings.background, color: settings.text }}
    >
      {lead ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
          style={{ paddingInline: '6cqw', paddingBottom: min(4), gap: min(1.6) }}
        >
          {leadIsNext ? (
            <div
              className="font-bold tracking-[0.16em] uppercase"
              style={{ ...text(3.4), color: settings.accent }}
            >
              Coming up
            </div>
          ) : null}

          <div
            className="max-w-full leading-[0.95] font-extrabold tracking-[-0.01em] whitespace-nowrap uppercase"
            style={{ fontSize: labelSize, opacity: leadIsNext ? 0.7 : 1 }}
          >
            {lead.label}
          </div>

          {settings.showDetail ? (
            <div
              className="max-w-full truncate leading-tight font-medium"
              style={{ ...text(5.6), opacity: 0.82 }}
            >
              {/* A non-breaking space keeps the line's height when there is no extra line. */}
              {lead.detail ?? ' '}
            </div>
          ) : null}

          {settings.showNext || settings.showCountdown ? (
            <div
              className="flex items-center justify-center"
              style={{ height: min(14), gap: min(3), marginTop: min(3) }}
            >
              {settings.showNext && nextLabel ? (
                <>
                  <span
                    className="font-bold tracking-[0.16em] uppercase"
                    style={{ ...text(3.4), color: settings.accent }}
                  >
                    Next
                  </span>
                  <span className="font-semibold uppercase" style={text(7)}>
                    {nextLabel}
                  </span>
                </>
              ) : null}

              {bars !== null ? (
                <span className="font-medium tabular-nums" style={{ ...text(5), opacity: 0.72 }}>
                  {settings.showNext && nextLabel ? '· ' : ''}in {bars}{' '}
                  {bars === 1 ? 'bar' : 'bars'}
                </span>
              ) : null}

              {finalBeats !== null ? (
                <span
                  className="flex aspect-square items-center justify-center rounded-full font-bold tabular-nums"
                  style={{
                    ...text(7.5),
                    height: min(13),
                    color: settings.background,
                    background: settings.accent,
                    transform: `scale(${1 + 0.14 * strength})`,
                    boxShadow: `0 0 ${min(6 * strength)} ${mix(settings.accent, 70 * strength)}`,
                  }}
                >
                  {finalBeats}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {settings.showProgress && progress !== null && lead ? (
        <div
          className="absolute inset-x-0 bottom-0 overflow-hidden"
          style={{ height: min(1.8), background: mix(settings.text, 14) }}
          role="progressbar"
          aria-label="Progress through this section"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full w-full origin-left"
            style={{ background: settings.accent, transform: `scaleX(${progress})` }}
          />
        </div>
      ) : null}

      {status ? (
        <div
          className="absolute font-medium"
          style={{
            fontSize: 'max(12px, 2.2cqmin)',
            left: '3cqw',
            bottom: min(4),
            opacity: 0.45,
          }}
        >
          {status}
        </div>
      ) : null}
    </div>
  )
}
