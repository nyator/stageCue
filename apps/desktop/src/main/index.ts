import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OutputController } from './output/output'
import { ScreenOutputs } from './screens'

const windowDirectory = path.dirname(fileURLToPath(import.meta.url))
const devServerUrl = process.env.ELECTRON_RENDERER_URL
const preload = path.join(windowDirectory, '../preload/index.cjs')
// Sandboxed preloads cannot read the OS, so pass what they need as arguments.
const additionalArguments = [`--stagecue-device-name=${os.hostname()}`]

function isAllowedNavigation(url: string): boolean {
  if (devServerUrl && url.startsWith(devServerUrl)) {
    return true
  }
  return url.startsWith('file:')
}

/** Loads one of the renderer pages: index.html (the app) or output.html (the NDI band). */
function loadPage(window: BrowserWindow, page: 'index' | 'output'): Promise<void> {
  if (devServerUrl) {
    return window.loadURL(page === 'index' ? devServerUrl : `${devServerUrl}/${page}.html`)
  }
  return window.loadFile(path.join(windowDirectory, `../renderer/${page}.html`))
}

// Created once the app is ready: the screen module needs it.
let screens: ScreenOutputs

const output = new OutputController({
  preload,
  additionalArguments,
  load: (window) => loadPage(window, 'output'),
  snapshotPath: process.env.STAGECUE_OUTPUT_SNAPSHOT,
})

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#121916',
    title: 'StageCue',
    webPreferences: {
      preload,
      additionalArguments,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  const blockUnexpectedNavigation = (event: { preventDefault: () => void }, url: string): void => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault()
    }
  }
  window.webContents.on('will-navigate', blockUnexpectedNavigation)
  window.webContents.on('will-redirect', blockUnexpectedNavigation)

  const stopForwarding = output.onStatus((status) => {
    if (!window.isDestroyed()) window.webContents.send('output:status', status)
  })
  const stopScreenUpdates = screens.onChange((list) => {
    if (!window.isDestroyed()) window.webContents.send('screens:changed', list)
  })
  window.on('closed', () => {
    stopForwarding()
    stopScreenUpdates()
    // Screen windows would otherwise keep the app running with no way to control them.
    screens.closeAll()
    if (process.platform !== 'darwin') app.quit()
  })

  void loadPage(window, 'index')
  return window
}

void app.whenReady().then(() => {
  app.setAppUserModelId('com.stagecue.desktop')

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  ipcMain.handle('output:status', () => output.status)

  screens = new ScreenOutputs()
  // The renderer is trusted, but check what crosses the bridge anyway.
  ipcMain.handle('screens:list', () => screens.list())
  ipcMain.handle('screens:open', (_event, screenId: unknown, pageUrl: unknown) =>
    typeof screenId === 'number' && typeof pageUrl === 'string'
      ? screens.open(screenId, pageUrl)
      : 'Invalid request.',
  )
  ipcMain.handle('screens:close', (_event, screenId: unknown) => {
    if (typeof screenId === 'number') screens.close(screenId)
  })

  createWindow()
  output.start().catch((error: unknown) => {
    console.error('[output] Failed to start', error)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  screens.closeAll()
  void output.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
