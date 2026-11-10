import { contextBridge } from 'electron'
import type { DesktopBridge } from '@stagecue/shared-types'

const DEVICE_NAME_FLAG = '--stagecue-device-name='
const deviceName =
  process.argv.find((arg) => arg.startsWith(DEVICE_NAME_FLAG))?.slice(DEVICE_NAME_FLAG.length) ??
  'StageCue Desktop'

const stagecue = {
  deviceName,
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
