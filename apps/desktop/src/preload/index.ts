import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopBridge,
  DeviceCopyResult,
  OutputStatus,
  ScreenInfo,
  UpdateStatus,
} from '@stagecue/shared-types'

const DEVICE_NAME_FLAG = '--stagecue-device-name='
const deviceName =
  process.argv.find((arg) => arg.startsWith(DEVICE_NAME_FLAG))?.slice(DEVICE_NAME_FLAG.length) ??
  'StageCue Desktop'

const APP_VERSION_FLAG = '--stagecue-app-version='
const appVersion =
  process.argv.find((arg) => arg.startsWith(APP_VERSION_FLAG))?.slice(APP_VERSION_FLAG.length) ??
  '0.0.0'

const stagecue = {
  deviceName,
  appVersion,
  getUpdateStatus: () => ipcRenderer.invoke('update:status') as Promise<UpdateStatus>,
  onUpdateStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status)
    ipcRenderer.on('update:status', handler)
    return () => {
      ipcRenderer.removeListener('update:status', handler)
    }
  },
  openUpdate: (which) => ipcRenderer.send('update:open', which),
  versions: {
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  },
  getOutputStatus: () => ipcRenderer.invoke('output:status') as Promise<OutputStatus>,
  setOutputSize: (size) => ipcRenderer.send('output:size', size),
  installAbletonDevice: () => ipcRenderer.invoke('ableton:install') as Promise<DeviceCopyResult>,
  saveAbletonDevice: () =>
    ipcRenderer.invoke('ableton:save-copy') as Promise<DeviceCopyResult | null>,
  revealAbletonDevice: () => ipcRenderer.send('ableton:reveal'),
  onOutputStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: OutputStatus) => listener(status)
    ipcRenderer.on('output:status', handler)
    return () => {
      ipcRenderer.removeListener('output:status', handler)
    }
  },
  listScreens: () => ipcRenderer.invoke('screens:list') as Promise<ScreenInfo[]>,
  showOnScreen: (screenId, pageUrl) =>
    ipcRenderer.invoke('screens:open', screenId, pageUrl) as Promise<string | null>,
  stopScreen: (screenId) => ipcRenderer.invoke('screens:close', screenId) as Promise<void>,
  onScreensChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, screens: ScreenInfo[]) => listener(screens)
    ipcRenderer.on('screens:changed', handler)
    return () => {
      ipcRenderer.removeListener('screens:changed', handler)
    }
  },
} satisfies DesktopBridge

if (!process.contextIsolated) {
  throw new Error('StageCue requires Electron context isolation.')
}

contextBridge.exposeInMainWorld('stagecue', stagecue)
