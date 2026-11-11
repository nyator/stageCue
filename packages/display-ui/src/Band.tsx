import type { CueView, DisplaySettings } from '@stagecue/arrangement'
import type { CSSProperties } from 'react'
import { changeIsNear } from './timing.ts'

interface BandProps {
  view: CueView
  settings: DisplaySettings
}

/** Brightest on the beat, fading before the next one. */
function pulse(phase: number): number {
  return (1 - phase) ** 3
}

/** Sizes, in percent of the output width (times Style → Text size). */
const NAME_CQW = 4.8
/** The extra line is the choir's instruction for the section: large and at full strength. */
const DETAIL_CQW = 3
const NEXT_CQW = 3.6
const LABEL_CQW = 1.5

const mix = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${Math.round(percent)}%, transparent)`

/**
 * The arrangement band the choir reads over the lyrics, in a glance mid-song.
 * Singers asked for less going on, so it shows one thing most of the time: the
 * section they are in, centred, with its instruction underneath. NEXT appears
 * at the right only in the last bars before a change (see timing.ts), with the
 * bars left, and the 4, 3, 2, 1 pulse in the final bar. The current section
 * never moves. See apps/desktop/DESIGN.md, "The band".
 *
 * Only what keeps time moves (the progress bar, the pulse, NEXT fading in), by
 * transform and opacity, so each frame is cheap to render for NDI.
 *
 * Sized in container units, so it looks the same in a small preview and in the
 * 1080p or 4K output; its parent must be a container (the `@container` class).
 */
export function Band({ view, settings }: BandProps) {
  const { current, next, countdown, progress } = view
  if (!current && !next) return null

  const space = (cqw: number) => `calc(${cqw}cqw * ${settings.scale})`
  const size = (cqw: number): CSSProperties => ({ fontSize: space(cqw) })

  // Before the first marker there is nothing current yet: lead with what is coming.
  const comingUp = current === null
  const lead = current ?? next!
  const detail = settings.showDetail ? lead.detail : null

  const following = comingUp || !settings.showNext ? null : next
  const near = following !== null && changeIsNear(view)
  const finalBeats = settings.showCountdown ? (countdown?.finalBeats ?? null) : null
  const bars = settings.showCountdown && countdown && finalBeats === null ? countdown.bars : null
  const strength = finalBeats !== null ? pulse(view.beatPhase) : 0

  return (
    <div
      className={`absolute inset-x-0 ${settings.position === 'top' ? 'top-0' : 'bottom-0'}`}
      style={{
        background: mix(settings.background, settings.backgroundOpacity * 100),
        color: settings.text,
        paddingTop: space(1.6),
        paddingBottom: space(settings.showProgress ? 2.2 : 1.6),
        paddingInline: space(3.6),
      }}
    >
      {/* Equal side columns keep the current section centred whatever NEXT says. */}
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', columnGap: space(3) }}
      >
        <span />

        <div className="flex min-w-0 flex-col items-center text-center" style={{ gap: space(0.4) }}>
          {comingUp ? <Label text="Coming up" color={settings.accent} size={size} /> : null}
          <div
            className="max-w-full truncate leading-[1] font-bold tracking-[-0.005em] uppercase"
            style={{ ...size(NAME_CQW), opacity: comingUp ? 0.7 : 1 }}
          >
            {lead.label}
          </div>
          {detail ? (
            <div
              className="max-w-full truncate leading-tight font-semibold"
              style={size(DETAIL_CQW)}
            >
              {detail}
            </div>
          ) : null}
        </div>

        {following ? (
          <div
            className="flex min-w-0 items-center justify-end"
            style={{
              gap: space(1.4),
              opacity: near ? 1 : 0,
              transition: 'opacity 400ms ease-out',
            }}
            aria-hidden={!near}
          >
            {finalBeats !== null ? (
              <span
                className="flex aspect-square shrink-0 items-center justify-center rounded-full font-bold tabular-nums"
                style={{
                  ...size(3),
                  height: space(4.8),
                  color: settings.background,
                  background: settings.accent,
                  // Scale only: a glow would repaint the band on every frame.
                  transform: `scale(${1 + 0.12 * strength})`,
                }}
              >
                {finalBeats}
              </span>
            ) : null}
            <div className="flex min-w-0 flex-col items-start" style={{ gap: space(0.4) }}>
              {/* Stays inside its column: a long NEXT name is cut short, never over NOW. */}
              <div
                className="flex items-baseline font-bold tracking-[0.16em] uppercase"
                style={{ ...size(LABEL_CQW), gap: space(0.8) }}
              >
                <span style={{ color: settings.accent }}>Next</span>
                {bars !== null ? (
                  <span style={{ opacity: 0.7 }}>
                    in {bars} {bars === 1 ? 'bar' : 'bars'}
                  </span>
                ) : null}
              </div>
              <div
                className="max-w-full truncate leading-[1] font-bold tracking-[-0.005em] uppercase"
                style={{ ...size(NEXT_CQW), opacity: 0.85 }}
              >
                {following.label}
              </div>
            </div>
          </div>
        ) : (
          <span />
        )}
      </div>

      {settings.showProgress && progress !== null ? (
        <div
          className="absolute inset-x-0 bottom-0 overflow-hidden"
          style={{ height: space(0.9), background: mix(settings.text, 14) }}
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

function Label({
  text,
  color,
  size,
}: {
  text: string
  color: string
  size: (cqw: number) => CSSProperties
}) {
  return (
    <div className="font-bold tracking-[0.16em] uppercase" style={{ ...size(LABEL_CQW), color }}>
      {text}
    </div>
  )
}
