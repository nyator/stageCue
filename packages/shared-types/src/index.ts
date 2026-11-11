export const STAGECUE_APP_NAME = 'StageCue' as const

/** The NDI source name ProPresenter operators will see. */
export const OUTPUT_SOURCE_NAME = 'StageCue' as const

export interface OutputStatus {
  /** unavailable: this computer cannot send NDI yet. sending: frames are going out. */
  state: 'starting' | 'unavailable' | 'sending' | 'error'
  sourceName: string
  /** A sentence for the operator. */
  message: string
  /** How many receivers (such as ProPresenter) are connected. */
  receivers: number
}

/** A screen attached to this computer (HDMI, or an AirPlay display). */
export interface ScreenInfo {
  id: number
  label: string
  /** Pixels. */
  width: number
  height: number
  /** The screen the StageCue window is normally on. */
  primary: boolean
  /** Whether the cue is showing on it now. */
  showing: boolean
}

/** What the preload exposes to pages as window.stagecue. */
export interface DesktopBridge {
  /** This computer's name, so operators can tell StageCue machines apart. */
  deviceName: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
  getOutputStatus(): Promise<OutputStatus>
  /** The output page reports the saved output size, so the main process can resize the NDI picture. */
  setOutputSize(size: '1080p' | '4k'): void
  /** Returns a function that stops listening. */
  onOutputStatus(listener: (status: OutputStatus) => void): () => void
  listScreens(): Promise<ScreenInfo[]>
  /** Shows the cue full screen on an attached screen. Resolves to an error message, or null. */
  showOnScreen(screenId: number, pageUrl: string): Promise<string | null>
  stopScreen(screenId: number): Promise<void>
  /** Returns a function that stops listening. */
  onScreensChanged(listener: (screens: ScreenInfo[]) => void): () => void
  /** Copies the Ableton device into Live's User Library on this computer. */
  installAbletonDevice(): Promise<DeviceCopyResult>
  /** Asks for a folder and saves a copy of the Ableton device there. Null if cancelled. */
  saveAbletonDevice(): Promise<DeviceCopyResult | null>
  /** Shows the installed device in Finder or Explorer. */
  revealAbletonDevice(): void
}

export type DeviceCopyResult = { ok: true; folder: string } | { ok: false; reason: string }
