import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { OUTPUT_SOURCE_NAME, type OutputStatus } from '@stagecue/shared-types'
import { createNdiSender, type FrameSender } from './ndi'

export const OUTPUT_WIDTH = 1920
export const OUTPUT_HEIGHT = 1080
const FRAME_RATE = 30
// Chromium delivers about half the frames an off-screen page draws, so capture at twice the NDI rate.
const PAINT_RATE = 60

interface OutputOptions {
  preload: string
  additionalArguments: string[]
  /** Loads the output page into the window. */
  load: (window: BrowserWindow) => Promise<void>
  /** Debug aid: write one rendered frame to this PNG path, then stop. */
  snapshotPath?: string | undefined
}

/**
 * Renders the arrangement band off screen at 1920×1080 with a transparent
 * background, and passes each frame to the NDI sender.
 */
export class OutputController {
  readonly #options: OutputOptions
  readonly #listeners = new Set<(status: OutputStatus) => void>()
  #window: BrowserWindow | null = null
  #sender: FrameSender | null = null
  #receiverPoll: ReturnType<typeof setInterval> | null = null
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

    const result = await createNdiSender(OUTPUT_SOURCE_NAME, FRAME_RATE)
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
     * The window paints at PAINT_RATE but frames go out at FRAME_RATE. Copying
     * every paint (8 MB each) churns so much memory that garbage collection
     * stalls this process and paints get dropped, so only paints that are sent
     * are copied. A paint's image cannot be kept and copied later: Electron
     * reuses its memory, and a late copy mixes frames (seen as the progress bar
     * jumping backwards). So a skipped paint only marks the picture as changed;
     * if no later paint arrives in time, the window is asked to paint again.
     */
    const frameMs = 1000 / FRAME_RATE
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
    this.#setStatus({
      state: 'sending',
      message: `Sending as the NDI source “${OUTPUT_SOURCE_NAME}”.`,
    })

    // Receivers come and go (ProPresenter starting, Studio Monitor opening): keep the count current.
    this.#receiverPoll = setInterval(() => {
      const receivers = this.#sender?.receivers() ?? 0
      if (receivers !== this.#status.receivers) this.#setStatus({ receivers })
    }, 1_000)
  }

  async stop(): Promise<void> {
    if (this.#receiverPoll) clearInterval(this.#receiverPoll)
    this.#receiverPoll = null
    this.#window?.destroy()
    this.#window = null
    await this.#sender?.close()
    this.#sender = null
  }

  #createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      show: false,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      frame: false,
      transparent: true,
      // Windows clamps windows to the screen size; the output must be exactly 1920×1080.
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
    window.setContentSize(OUTPUT_WIDTH, OUTPUT_HEIGHT)
    window.webContents.setFrameRate(PAINT_RATE)
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
