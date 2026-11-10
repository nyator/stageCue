export const STAGECUE_APP_NAME = 'StageCue' as const

export interface DesktopBridge {
  versions: {
    electron: string
    chrome: string
    node: string
  }
}
