import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge, DeviceCopyResult, OutputStatus } from '@stagecue/shared-types'

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
} satisfies DesktopBridge

if (!process.contextIsolated) {
  throw new Error('StageCue requires Electron context isolation.')
}

contextBridge.exposeInMainWorld('stagecue', stagecue)
