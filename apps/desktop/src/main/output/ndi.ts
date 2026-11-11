/*
 * Sends the band as an NDI video source through @stagetimerio/grandiose, a
 * native module built against the NDI SDK at install time (see
 * docs/technical-design.md §6). It is loaded at runtime, so a computer where it
 * failed to build reports NDI as unavailable instead of crashing the app.
 */

export interface Frame {
  width: number
  height: number
  /** Pixels in BGRA order, 4 bytes each, rows top to bottom. */
  bgra: Buffer
}

export interface FrameSender {
  /** Replaces the frame being sent. Cheap: the frame goes out on the next tick. */
  send(frame: Frame): void
  receivers(): number
  close(): Promise<void>
}

export type SenderResult = { ok: true; sender: FrameSender } | { ok: false; reason: string }

/*
 * The parts of the module StageCue uses. Its own type definitions use const
 * enums, which isolatedModules cannot import, so the constants are read from
 * the module at runtime instead.
 */
interface NdiSenderHandle {
  video(frame: {
    xres: number
    yres: number
    frameRateN: number
    frameRateD: number
    fourCC: number
    pictureAspectRatio: number
    frameFormatType: number
    lineStrideBytes: number
    data: Buffer
  }): Promise<void>
  connections(): number
  destroy(): Promise<void>
}

interface NdiModule {
  send(params: { name: string; clockVideo?: boolean }): Promise<NdiSenderHandle>
  FOURCC_BGRA: number
  FORMAT_TYPE_PROGRESSIVE: number
}

const NDI_MODULE = '@stagetimerio/grandiose'

async function loadNdi(): Promise<NdiModule | null> {
  try {
    const loaded = (await import(/* @vite-ignore */ NDI_MODULE)) as {
      default?: NdiModule
    } & Partial<NdiModule>
    const ndi = (loaded.default ?? loaded) as NdiModule
    return typeof ndi.send === 'function' ? ndi : null
  } catch (error) {
    console.warn('[output] NDI module not available', error)
    return null
  }
}

/**
 * Creates the NDI source. Frames go out as the output controller hands them
 * over, at its regular cadence, so there is a single clock (two independent
 * clocks drift and make frames repeat or skip, which shows as judder). When
 * nothing changes no frames arrive, so the newest one is re-sent to keep
 * receivers fed. A frame that arrives while one is being sent replaces any
 * waiting frame, so sends never queue up.
 */
export async function createNdiSender(
  sourceName: string,
  frameRate: number,
): Promise<SenderResult> {
  const ndi = await loadNdi()
  if (!ndi) {
    return {
      ok: false,
      reason:
        'NDI is not available on this computer, so nothing is sent to ProPresenter. The live preview still works.',
    }
  }

  let handle: NdiSenderHandle
  try {
    handle = await ndi.send({ name: sourceName, clockVideo: false })
  } catch (error) {
    console.error('[output] Could not create the NDI source', error)
    return {
      ok: false,
      reason: 'NDI could not start. Check that NDI Tools or the NDI runtime is installed.',
    }
  }

  const frameMs = 1000 / frameRate
  let latest: Frame | null = null
  let waiting: Frame | null = null
  let sending = false
  let lastSentAt = 0
  let closed = false
  let delivered = false

  const deliver = (frame: Frame): void => {
    sending = true
    lastSentAt = performance.now()
    handle
      .video({
        xres: frame.width,
        yres: frame.height,
        frameRateN: frameRate,
        frameRateD: 1,
        fourCC: ndi.FOURCC_BGRA,
        pictureAspectRatio: frame.width / frame.height,
        frameFormatType: ndi.FORMAT_TYPE_PROGRESSIVE,
        lineStrideBytes: frame.width * 4,
        data: frame.bgra,
      })
      .then(() => {
        if (!delivered) {
          delivered = true
          console.log(`[output] Sending to NDI as “${sourceName}” at ${frameRate} fps`)
        }
      })
      .catch((error: unknown) => {
        if (!closed) console.warn('[output] NDI frame was not sent', error)
      })
      .finally(() => {
        sending = false
        const next = waiting
        waiting = null
        if (next && !closed) deliver(next)
      })
  }

  // Keeps the signal alive while the picture is still.
  const keepAlive = setInterval(() => {
    if (closed || sending || !latest) return
    if (performance.now() - lastSentAt >= frameMs * 1.5) deliver(latest)
  }, frameMs)

  return {
    ok: true,
    sender: {
      send: (frame) => {
        latest = frame
        if (closed) return
        if (sending) waiting = frame
        else deliver(frame)
      },
      receivers: () => (closed ? 0 : handle.connections()),
      close: async () => {
        if (closed) return
        closed = true
        clearInterval(keepAlive)
        await handle.destroy()
      },
    },
  }
}
