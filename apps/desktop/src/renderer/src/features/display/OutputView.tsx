import { DEFAULT_DISPLAY_SETTINGS } from '@stagecue/arrangement'
import { useEngineQuery } from '../../engine/hooks'
import { useCueView } from '../../live/use-cue-view'
import { Band } from '@stagecue/display-ui'

/** Rendered off screen at 1920×1080; the main process sends its frames out over NDI. */
export function OutputView() {
  const { view, live } = useCueView()
  const settings = useEngineQuery('settings.getDisplay', {}).data ?? DEFAULT_DISPLAY_SETTINGS
  return (
    <div className="@container relative h-full w-full">
      {live?.state.hidden ? null : <Band view={view} settings={settings} />}
    </div>
  )
}
