import { BrowserWindow, screen, type Display } from 'electron'
import type { ScreenInfo } from '@stagecue/shared-types'

/**
 * Shows the full-screen cue on screens attached to this computer: a TV on
 * HDMI, or an Apple TV used as a separate AirPlay display. Each window loads
 * the screen page the engine serves, the same page TVs open in a browser.
 */
export class ScreenOutputs {
  readonly #windows = new Map<number, BrowserWindow>()
  readonly #listeners = new Set<(screens: ScreenInfo[]) => void>()

  constructor() {
    const changed = () => this.#notify()
    screen.on('display-added', changed)
    screen.on('display-metrics-changed', changed)
    screen.on('display-removed', (_event, display) => {
      this.#windows.get(display.id)?.destroy()
      this.#windows.delete(display.id)
      this.#notify()
    })
  }

  onChange(listener: (screens: ScreenInfo[]) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #notify(): void {
    const screens = this.list()
    for (const listener of this.#listeners) listener(screens)
  }

  list(): ScreenInfo[] {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      label: display.label || `Screen ${index + 1}`,
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
      primary: display.id === primaryId,
      showing: this.#windows.has(display.id),
    }))
  }

  /** Opens (or reopens) the cue on a screen. Returns an error message, or null. */
  open(displayId: number, pageUrl: string): string | null {
    const display = screen.getAllDisplays().find((d) => d.id === displayId)
    if (!display) return 'That screen is no longer connected.'

    let url: URL
    try {
      url = new URL(pageUrl)
    } catch {
      return 'The screen page address is not valid.'
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return 'The screen page address must be a plain http address.'
    }
    url.searchParams.set('embedded', '1')
    url.searchParams.set('name', `${display.label || 'Screen'} (attached)`)

    this.#windows.get(displayId)?.destroy()
    const window = this.#createWindow(display, url.origin)
    this.#windows.set(displayId, window)
    window.on('closed', () => {
      if (this.#windows.get(displayId) === window) this.#windows.delete(displayId)
      this.#notify()
    })
    void window.loadURL(url.toString())
    this.#notify()
    return null
  }

  close(displayId: number): void {
    this.#windows.get(displayId)?.close()
  }

  closeAll(): void {
    for (const window of this.#windows.values()) window.destroy()
    this.#windows.clear()
  }

  #createWindow(display: Display, origin: string): BrowserWindow {
    const { x, y, width, height } = display.bounds
    const window = new BrowserWindow({
      x,
      y,
      width,
      height,
      show: false,
      frame: false,
      fullscreen: true,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      title: 'StageCue screen',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    })

    // Stay on the screen page; nothing it shows links anywhere.
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, target) => {
      // Compare parsed origins: a prefix check lets http://engine:7417@elsewhere/ through.
      let targetOrigin: string | null = null
      try {
        targetOrigin = new URL(target).origin
      } catch {
        // Not a URL: stay.
      }
      if (targetOrigin !== origin) event.preventDefault()
    })
    // Esc on the screen closes it, for whoever is standing at the TV.
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault()
        window.close()
      }
    })
    window.once('ready-to-show', () => {
      window.setBounds(display.bounds)
      window.setFullScreen(true)
      window.show()
    })
    return window
  }
}
