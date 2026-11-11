import type { CueView, DisplaySettings } from '@stagecue/arrangement'
import type { CSSProperties } from 'react'

interface BandProps {
  view: CueView
  settings: DisplaySettings
}

/** Brightest on the beat, fading before the next one. */
function pulse(phase: number): number {
  return (1 - phase) ** 3
}

const mix = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${Math.round(percent)}%, transparent)`

/**
 * The arrangement band the choir reads over the lyrics: one centred column,
 * so the eye always returns to the same place. Every line keeps its space even
 * when empty, so the band never jumps as sections change. Sized in container
 * units, so it looks the same in a small preview and in the 1920×1080 output;
 * its parent must be a container (the `@container` class).
 */
export function Band({ view, settings }: BandProps) {
  const { current, next, countdown, progress } = view
  if (!current && !next) return null

  const size = (cqw: number): CSSProperties => ({
    fontSize: `calc(${cqw}cqw * ${settings.scale})`,
  })
  const space = (cqw: number) => `calc(${cqw}cqw * ${settings.scale})`

  // Before the first marker there is nothing current yet: lead with what is coming.
  const lead = current ?? next!
  const leadIsNext = current === null

  const finalBeats = settings.showCountdown ? (countdown?.finalBeats ?? null) : null
  const bars = settings.showCountdown && countdown && finalBeats === null ? countdown.bars : null
  const strength = finalBeats !== null ? pulse(view.beatPhase) : 0
  const showNextRow = settings.showNext || settings.showCountdown
  const nextLabel = leadIsNext ? null : next?.label

  return (
    <div
      className={`absolute inset-x-0 flex flex-col items-center text-center ${
        settings.position === 'top' ? 'top-0' : 'bottom-0'
      }`}
      style={{
        background: mix(settings.background, settings.backgroundOpacity * 100),
        color: settings.text,
        paddingTop: space(1.6),
        paddingBottom: space(settings.showProgress ? 2 : 1.6),
        paddingInline: space(4),
        gap: space(0.5),
      }}
    >
      {leadIsNext ? (
        <div
          className="font-bold tracking-[0.16em] uppercase"
          style={{ ...size(1.2), color: settings.accent }}
        >
          Coming up
        </div>
      ) : null}

      <div
        className="max-w-full truncate leading-[1] font-bold tracking-[-0.005em] uppercase"
        style={{ ...size(5), opacity: leadIsNext ? 0.7 : 1 }}
      >
        {lead.label}
      </div>

      {settings.showDetail ? (
        <div
          className="max-w-full truncate leading-tight font-medium"
          style={{ ...size(1.9), opacity: 0.82 }}
        >
          {/* A non-breaking space keeps the line's height when there is no extra line. */}
          {lead.detail ?? ' '}
        </div>
      ) : null}

      {showNextRow ? (
        <div
          className="flex items-center justify-center"
          style={{ height: space(4.4), gap: space(1.2), marginTop: space(0.4) }}
        >
          {settings.showNext && nextLabel ? (
            <>
              <span
                className="font-bold tracking-[0.16em] uppercase"
                style={{ ...size(1.2), color: settings.accent }}
              >
                Next
              </span>
              <span className="font-semibold uppercase" style={size(2.2)}>
                {nextLabel}
              </span>
            </>
          ) : null}

          {bars !== null ? (
            <span className="font-medium tabular-nums" style={{ ...size(1.8), opacity: 0.72 }}>
              {settings.showNext && nextLabel ? '· ' : ''}in {bars} {bars === 1 ? 'bar' : 'bars'}
            </span>
          ) : null}

          {finalBeats !== null ? (
            <span
              className="flex aspect-square items-center justify-center rounded-full font-bold tabular-nums"
              style={{
                ...size(2.6),
                height: space(4.2),
                color: settings.background,
                background: settings.accent,
                transform: `scale(${1 + 0.14 * strength})`,
                boxShadow: `0 0 ${space(2.4 * strength)} ${mix(settings.accent, 70 * strength)}`,
              }}
            >
              {finalBeats}
            </span>
          ) : null}
        </div>
      ) : null}

      {settings.showProgress && progress !== null ? (
        <div
          className="absolute inset-x-0 bottom-0 overflow-hidden"
          style={{ height: space(1.3), background: mix(settings.text, 14) }}
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
    </div>
  )
}
