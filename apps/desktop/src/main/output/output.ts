import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { OUTPUT_SOURCE_NAME, type OutputStatus } from '@stagecue/shared-types'
import { createNdiSender, type FrameSender } from './ndi'

export const OUTPUT_WIDTH = 1920
export const OUTPUT_HEIGHT = 1080
const FRAME_RATE = 30

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

    const result = await createNdiSender()
    if (!result.ok) {
      this.#setStatus({ state: 'unavailable', message: result.reason })
      return
    }

    this.#sender = result.sender
    const window = this.#createWindow()
    window.webContents.on('paint', (_event, _dirty, image) => {
      const size = image.getSize()
      this.#sender?.send({ width: size.width, height: size.height, bgra: image.toBitmap() })
    })
    await this.#options.load(window)
    this.#setStatus({ state: 'sending', message: `Sending as “${OUTPUT_SOURCE_NAME}”.` })
  }

  async stop(): Promise<void> {
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
    window.webContents.setFrameRate(FRAME_RATE)
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
