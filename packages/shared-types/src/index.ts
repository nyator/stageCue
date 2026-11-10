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
  /** Returns a function that stops listening. */
  onOutputStatus(listener: (status: OutputStatus) => void): () => void
}
