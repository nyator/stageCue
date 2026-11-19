import { ArrowSquareOut, DownloadSimple, Sparkle } from '@phosphor-icons/react'
import { useUpdateStatus } from '../../live/use-update-status'
import { Button } from '../../ui/button'

/**
 * Shown on Setup when a newer StageCue has been published. The app does not
 * install it: Download opens the file in the browser, and the volunteer drags
 * the new StageCue into Applications as the first time.
 */
export function UpdateBanner() {
  const status = useUpdateStatus()
  if (status.state !== 'available') return null
  const bridge = window.stagecue

  return (
    <section
      role="status"
      className="enter mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-raised px-4 py-3 ring-1 ring-line-soft"
    >
      <Sparkle className="size-5 shrink-0 text-cue" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">StageCue {status.version} is ready</p>
        <p className="text-[13px] text-muted">
          You have {status.currentVersion}. Download it, quit StageCue, then drag the new StageCue
          into Applications and replace the old one. Your settings stay.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowSquareOut className="size-4" />}
          onClick={() => bridge?.openUpdate('page')}
        >
          What's new
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<DownloadSimple className="size-4" />}
          onClick={() => bridge?.openUpdate('download')}
        >
          Download
        </Button>
      </div>
    </section>
  )
}
