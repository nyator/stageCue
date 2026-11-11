import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { OUTPUT_SOURCE_NAME, type OutputStatus } from '@stagecue/shared-types'
import { createNdiSender, type FrameSender } from './ndi'

type OutputSize = '1080p' | '4k'
/*
 * 60 frames a second at 1080p keeps the delay from the band changing to the
 * frame leaving at under 17 ms (measured on a MacBook). On the Windows PC the
 * app could not hand NDI more than about 30 a second, and aiming for 60 only
 * added load and repeated frames, so 1080p runs at 30 there (technical-design.md
 * §6.3). 4K has four times the pixels, so it runs at 30 everywhere.
 */
const HD_RATE = process.platform === 'win32' ? 30 : 60
const OUTPUT_DIMENSIONS: Record<
  OutputSize,
  { width: number; height: number; frameRate: number; label: string }
> = {
  '1080p': { width: 1920, height: 1080, frameRate: HD_RATE, label: '1080p' },
  '4k': { width: 3840, height: 2160, frameRate: 30, label: '4K' },
}

/*
 * How many times faster than NDI the off-screen window paints. On Windows,
 * Chromium delivered only about half the paints asked for (14 a second when
 * asked for 30), so it paints at twice the send rate there and only the paints
 * that are sent get copied (technical-design.md §6.2). On macOS paints arrived
 * at the rate asked for, measured at 60 fps.
 */
const PAINT_FACTOR = process.platform === 'win32' ? 2 : 1

interface OutputOptions {
  preload: string
  additionalArguments: string[]
  /** Loads the output page into the window. */
  load: (window: BrowserWindow) => Promise<void>
  /** Debug aid: write one rendered frame to this PNG path, then stop. */
  snapshotPath?: string | undefined
}

/**
 * Renders the arrangement band off screen at 1920×1080 at 60 fps (or 3840×2160
 * at 30) with a transparent background, and passes frames to the NDI sender.
 */
export class OutputController {
  readonly #options: OutputOptions
  readonly #listeners = new Set<(status: OutputStatus) => void>()
  #window: BrowserWindow | null = null
  #sender: FrameSender | null = null
  #receiverTimer: ReturnType<typeof setInterval> | null = null
  #size: OutputSize = '1080p'
  #status: OutputStatus = {
    state: 'starting',
    sourceName: OUTPUT_SOURCE_NAME,
    message: 'Starting the output.',
    receivers: 0,
  }

  constructor(options: OutputOptions) {
    this.#options = options
  }

  get status(): OutputStatus {
    return this.#status
  }

  onStatus(listener: (status: OutputStatus) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #setStatus(patch: Partial<OutputStatus>): void {
    this.#status = { ...this.#status, ...patch }
    for (const listener of this.#listeners) listener(this.#status)
  }

  async start(): Promise<void> {
    if (this.#options.snapshotPath) {
      await this.#snapshot(this.#options.snapshotPath)
    }

    const result = await createNdiSender(
      OUTPUT_SOURCE_NAME,
      OUTPUT_DIMENSIONS[this.#size].frameRate,
    )
    if (!result.ok) {
      this.#setStatus({ state: 'unavailable', message: result.reason })
      return
    }

    this.#sender = result.sender
    const window = this.#createWindow()
    let painted = false
    // STAGECUE_OUTPUT_STATS=1 logs the paint rate and the time spent copying frames.
    const stats = process.env.STAGECUE_OUTPUT_STATS ? { paints: 0, sent: 0, copyMs: 0 } : null
    if (stats) {
      setInterval(() => {
        console.log(
          `[output] ${(stats.paints / 5).toFixed(1)} paints/s, ${(stats.sent / 5).toFixed(1)} frames/s copied, ${(stats.copyMs / Math.max(stats.sent, 1)).toFixed(1)} ms per copy`,
        )
        stats.paints = 0
        stats.copyMs = 0
        stats.sent = 0
      }, 5_000).unref()
    }

    /*
     * Copying every paint (8 MB each at 1080p) churns enough memory to stall
     * this process, so only paints that are sent are copied. A paint's image
     * cannot be kept and copied later: Electron reuses its memory, and a late
     * copy mixes frames (seen as the progress bar jumping backwards). So a
     * skipped paint only marks the picture as changed; if no later paint
     * arrives in time, the window is asked to paint again.
     */
    let lastSentAt = 0
    let changedSinceSend = false
    let flush: ReturnType<typeof setTimeout> | null = null

    window.webContents.on('paint', (_event, _dirty, image) => {
      if (!painted) {
        painted = true
        const size = image.getSize()
        console.log(`[output] First frame rendered: ${size.width}×${size.height}`)
      }
      if (stats) stats.paints += 1

      const frameMs = 1000 / OUTPUT_DIMENSIONS[this.#size].frameRate
      const sinceLast = performance.now() - lastSentAt
      if (sinceLast < frameMs * 0.9) {
        changedSinceSend = true
        flush ??= setTimeout(() => {
          flush = null
          if (changedSinceSend && !window.isDestroyed()) window.webContents.invalidate()
        }, frameMs - sinceLast)
        return
      }

      changedSinceSend = false
      lastSentAt = performance.now()
      const size = image.getSize()
      const started = performance.now()
      // Copied now, inside the paint event, while the image is valid.
      const bgra = image.toBitmap()
      if (stats) {
        stats.copyMs += performance.now() - started
        stats.sent += 1
      }
      this.#sender?.send({ width: size.width, height: size.height, bgra })
    })
    await this.#options.load(window)
    this.#setStatus({ state: 'sending', message: this.#sendingMessage(0), receivers: 0 })

    // NDI has no connection events; check for receivers (such as ProPresenter) every second.
    this.#receiverTimer = setInterval(() => {
      const receivers = this.#sender?.receivers() ?? 0
      if (receivers !== this.#status.receivers) {
        this.#setStatus({ receivers, message: this.#sendingMessage(receivers) })
      }
    }, 1_000)
  }

  /**
   * Resizes the picture. The band is laid out in container units, so it looks
   * the same at either size, with twice the detail at 4K. NDI receivers adapt
   * to the new size on the next frame.
   */
  setSize(size: OutputSize): void {
    if (size === this.#size) return
    this.#size = size
    const { width, height, frameRate } = OUTPUT_DIMENSIONS[size]
    this.#sender?.setFrameRate(frameRate)
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.webContents.setFrameRate(frameRate * PAINT_FACTOR)
      this.#window.setContentSize(width, height)
      this.#window.webContents.invalidate()
    }
    if (this.#status.state === 'sending') {
      this.#setStatus({ message: this.#sendingMessage(this.#status.receivers) })
    }
  }

  #sendingMessage(receivers: number): string {
    const source = `Sending “${OUTPUT_SOURCE_NAME}” in ${OUTPUT_DIMENSIONS[this.#size].label}.`
    if (receivers === 0) return `${source} No receiver connected yet.`
    return `${source} ${receivers} ${receivers === 1 ? 'receiver' : 'receivers'} connected.`
  }

  async stop(): Promise<void> {
    if (this.#receiverTimer) clearInterval(this.#receiverTimer)
    this.#receiverTimer = null
    this.#window?.destroy()
    this.#window = null
    await this.#sender?.close()
    this.#sender = null
  }

  #createWindow(): BrowserWindow {
    const { width, height, frameRate } = OUTPUT_DIMENSIONS[this.#size]
    const window = new BrowserWindow({
      show: false,
      width,
      height,
      frame: false,
      transparent: true,
      // Windows clamps windows to the screen size; the output must be exactly 1920×1080 or 3840×2160.
      enableLargerThanScreen: true,
      backgroundColor: '#00000000',
      webPreferences: {
        offscreen: true,
        preload: this.#options.preload,
        additionalArguments: this.#options.additionalArguments,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Keep rendering at full rate although the window is never shown.
        backgroundThrottling: false,
      },
    })
    window.setContentSize(width, height)
    window.webContents.setFrameRate(frameRate * PAINT_FACTOR)
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    this.#window = window
    return window
  }

  /** Renders the output page for a few seconds and saves one frame. */
  async #snapshot(target: string): Promise<void> {
    const window = this.#createWindow()
    try {
      await this.#options.load(window)
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      const image = await window.webContents.capturePage()
      await writeFile(path.resolve(target), image.toPNG())
      console.log(
        `[output] Saved a ${image.getSize().width}×${image.getSize().height} frame to ${target}`,
      )
    } finally {
      window.destroy()
      this.#window = null
    }
  }
}
