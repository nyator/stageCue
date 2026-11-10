import { contextBridge } from 'electron'
import type { DesktopBridge } from '@stagecue/shared-types'

const stagecue = {
  versions: {
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  },
} satisfies DesktopBridge

if (!process.contextIsolated) {
  throw new Error('StageCue requires Electron context isolation.')
}

contextBridge.exposeInMainWorld('stagecue', stagecue)
