export const STAGECUE_APP_NAME = 'StageCue' as const

export interface DesktopBridge {
  /** This computer's name, so operators can tell StageCue machines apart. */
  deviceName: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
}
