import { ArrowRight } from '@phosphor-icons/react'
import type { Cue, CueView, DisplaySettings } from '@stagecue/arrangement'
import type { CSSProperties, ReactNode } from 'react'

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
 * The arrangement band the choir reads over the lyrics. It reads left to right,
 * like one phrase: NOW, then the countdown where the arrow would be, then NEXT
 * at nearly the same size. Both names lean in towards the centre, so the eye
 * stays in one place and the countdown always sits in the middle of the screen.
 * When there is no next section to show, the current one sits alone, centred.
 *
 * Lines with nothing to say take no space. Sized in container units, so it looks
 * the same in a small preview and in the 1080p or 4K output; its parent must be
 * a container (the `@container` class).
 */
export function Band({ view, settings }: BandProps) {
  const { current, next, countdown, progress } = view
  if (!current && !next) return null

  const space = (cqw: number) => `calc(${cqw}cqw * ${settings.scale})`
  const size = (cqw: number): CSSProperties => ({ fontSize: space(cqw) })

  const finalBeats = settings.showCountdown ? (countdown?.finalBeats ?? null) : null
  const bars = settings.showCountdown && countdown && finalBeats === null ? countdown.bars : null
  const strength = finalBeats !== null ? pulse(view.beatPhase) : 0

  // Before the first marker there is nothing current yet: lead with what is coming.
  const comingUp = current === null
  const lead = current ?? next!
  const following = comingUp || !settings.showNext ? null : next
  const detail = (cue: Cue | null) => (settings.showDetail ? (cue?.detail ?? null) : null)

  const countdownMark: ReactNode =
    finalBeats !== null ? (
      <span
        className="flex aspect-square items-center justify-center rounded-full font-bold tabular-nums"
        style={{
          ...size(3.4),
          height: space(5.6),
          color: settings.background,
          background: settings.accent,
          transform: `scale(${1 + 0.14 * strength})`,
          boxShadow: `0 0 ${space(2.4 * strength)} ${mix(settings.accent, 70 * strength)}`,
        }}
      >
        {finalBeats}
      </span>
    ) : bars !== null ? (
      <span className="flex flex-col items-center leading-none">
        <span className="font-bold tabular-nums" style={size(3.6)}>
          {bars}
        </span>
        <span
          className="font-semibold tracking-[0.14em] uppercase"
          style={{ ...size(1.4), marginTop: space(0.4), opacity: 0.75 }}
        >
          {bars === 1 ? 'bar' : 'bars'}
        </span>
      </span>
    ) : null

  return (
    <div
      className={`absolute inset-x-0 ${settings.position === 'top' ? 'top-0' : 'bottom-0'}`}
      style={{
        background: mix(settings.background, settings.backgroundOpacity * 100),
        color: settings.text,
        paddingTop: space(1.4),
        paddingBottom: space(settings.showProgress ? 2.2 : 1.4),
        paddingInline: space(4),
      }}
    >
      {following ? (
        // Three columns on shared rows (heading, name, extra line), so NOW and
        // NEXT line up whether or not either section has an extra line.
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
            columnGap: space(2.4),
            rowGap: space(0.5),
          }}
        >
          <Heading
            text="Now"
            color={mix(settings.text, 62)}
            className="justify-self-end"
            size={size}
          />
          <span />
          <Heading text="Next" color={settings.accent} className="justify-self-start" size={size} />

          <Name text={lead.label} cqw={4.8} className="justify-self-end text-right" size={size} />
          <div
            className="flex items-center justify-center self-center"
            style={{ minWidth: space(7), height: space(5.6) }}
          >
            {countdownMark ?? (
              <ArrowRight
                aria-hidden
                weight="bold"
                style={{ width: space(3.4), height: space(3.4), opacity: 0.55 }}
              />
            )}
          </div>
          <Name text={following.label} cqw={4.2} className="justify-self-start" size={size} />

          {detail(lead) || detail(following) ? (
            <>
              <Detail text={detail(lead)} className="justify-self-end text-right" size={size} />
              <span />
              <Detail text={detail(following)} className="justify-self-start" size={size} />
            </>
          ) : null}
        </div>
      ) : (
        // Nothing to show next (the last section, Next switched off, or before the
        // first marker): one centred block, with the countdown underneath.
        <div className="flex flex-col items-center text-center">
          <Section
            heading={comingUp ? 'Coming up' : null}
            headingColor={settings.accent}
            label={lead.label}
            labelSize={4.8}
            detail={detail(lead)}
            align="center"
            dim={comingUp}
            size={size}
            space={space}
          />
          {countdownMark ? (
            <div className="flex items-center justify-center" style={{ marginTop: space(0.8) }}>
              {countdownMark}
            </div>
          ) : null}
        </div>
      )}

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

interface SectionProps {
  heading: string | null
  headingColor: string
  label: string
  labelSize: number
  detail: string | null
  align: 'left' | 'right' | 'center'
  dim?: boolean
  size: (cqw: number) => CSSProperties
  space: (cqw: number) => string
}

/** A small heading (NOW, NEXT), the section name, and its extra line if it has one. */
function Section({
  heading,
  headingColor,
  label,
  labelSize,
  detail,
  align,
  dim = false,
  size,
  space,
}: SectionProps) {
  const alignment =
    align === 'left'
      ? 'items-start text-left'
      : align === 'right'
        ? 'items-end text-right'
        : 'items-center text-center'
  return (
    <div className={`flex min-w-0 flex-col ${alignment}`} style={{ gap: space(0.5) }}>
      {heading ? (
        <div
          className="font-bold tracking-[0.18em] uppercase"
          style={{ ...size(1.6), color: headingColor }}
        >
          {heading}
        </div>
      ) : null}
      <div
        className="max-w-full truncate leading-[1] font-bold tracking-[-0.005em] uppercase"
        style={{ ...size(labelSize), opacity: dim ? 0.7 : 1 }}
      >
        {label}
      </div>
      {detail ? (
        <div
          className="max-w-full truncate leading-tight font-medium"
          style={{ ...size(1.9), opacity: 0.82 }}
        >
          {detail}
        </div>
      ) : null}
    </div>
  )
}

type Size = (cqw: number) => CSSProperties

function Heading({
  text,
  color,
  className,
  size,
}: {
  text: string
  color: string
  className: string
  size: Size
}) {
  return (
    <div
      className={`self-end font-bold tracking-[0.18em] uppercase ${className}`}
      style={{ ...size(1.6), color }}
    >
      {text}
    </div>
  )
}

/** Names sit on a shared baseline, so a smaller NEXT still lines up with NOW. */
function Name({
  text,
  cqw,
  className,
  size,
}: {
  text: string
  cqw: number
  className: string
  size: Size
}) {
  return (
    <div
      className={`max-w-full self-baseline truncate leading-[1] font-bold tracking-[-0.005em] uppercase ${className}`}
      style={size(cqw)}
    >
      {text}
    </div>
  )
}

function Detail({ text, className, size }: { text: string | null; className: string; size: Size }) {
  return (
    <div
      className={`max-w-full truncate leading-tight font-medium ${className}`}
      style={{ ...size(1.9), opacity: 0.82 }}
    >
      {text ?? '\u00a0'}
    </div>
  )
}
