import { DEFAULT_DISPLAY_SETTINGS } from '@stagecue/arrangement'
import { useEffect } from 'react'
import { useEngineQuery } from '../../engine/hooks'
import { useCueView } from '../../live/use-cue-view'
import { Band } from '@stagecue/display-ui'

/** Rendered off screen at 1920×1080 or 3840×2160; the main process sends its frames out over NDI. */
export function OutputView() {
  const settings = useEngineQuery('settings.getDisplay', {}).data ?? DEFAULT_DISPLAY_SETTINGS
  const { view, live } = useCueView(settings.earlyMs)
  const size = settings.outputSize
  useEffect(() => {
    window.stagecue?.setOutputSize(size)
  }, [size])
  return (
    <div className="@container relative h-full w-full">
      {live?.state.hidden ? null : <Band view={view} settings={settings} />}
    </div>
  )
}
