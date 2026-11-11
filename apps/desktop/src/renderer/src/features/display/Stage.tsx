import type { CueView, DisplaySettings } from '@stagecue/arrangement'
import { Band } from '@stagecue/display-ui'

/**
 * A 16:9 picture of the screen: lyrics placeholder with the band over it. When
 * the media team has hidden the band, the preview still shows it, faded, so
 * they can see what would come back when they show it again.
 */
export function Stage({
  view,
  settings,
  hidden = false,
}: {
  view: CueView
  settings: DisplaySettings
  hidden?: boolean
}) {
  const empty = !view.current && !view.next
  return (
    <div className="@container relative aspect-video overflow-hidden rounded-md bg-[oklch(0.1_0.004_165)]">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1.2cqw] px-[10cqw] text-center">
        <p className="text-[3.2cqw] leading-tight font-semibold text-white/25">
          Lyrics from ProPresenter
        </p>
        <p className="text-[3.2cqw] leading-tight font-semibold text-white/25">
          stay where the operator puts them
        </p>
      </div>
      <div
        className={`transition-[opacity,filter] duration-300 ease-out ${hidden ? 'opacity-25 grayscale' : ''}`}
      >
        <Band view={view} settings={settings} />
      </div>
      {hidden ? null : empty ? (
        <p className="absolute inset-x-0 top-[6cqw] text-center text-sm text-faint">
          Nothing on screen. The band appears when Ableton plays past a marker.
        </p>
      ) : null}
    </div>
  )
}
