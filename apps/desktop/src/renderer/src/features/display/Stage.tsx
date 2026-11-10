import type { CueView, DisplaySettings } from '@stagecue/arrangement'
import { Band } from './Band'

/** A 16:9 picture of the screen: lyrics placeholder with the band over it. */
export function Stage({ view, settings }: { view: CueView; settings: DisplaySettings }) {
  const empty = !view.current && !view.next
  return (
    <div className="@container relative aspect-video overflow-hidden rounded-lg bg-[oklch(0.12_0.005_165)] ring-1 ring-line-soft">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1.2cqw] px-[10cqw] text-center">
        <p className="text-[3.2cqw] leading-tight font-semibold text-white/25">
          Lyrics from ProPresenter
        </p>
        <p className="text-[3.2cqw] leading-tight font-semibold text-white/25">
          stay where the operator puts them
        </p>
      </div>
      <Band view={view} settings={settings} />
      {empty ? (
        <p className="absolute inset-x-0 top-[6cqw] text-center text-sm text-faint">
          Nothing on screen. The band appears when Ableton plays past a marker.
        </p>
      ) : null}
    </div>
  )
}
