import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  installedFolder,
  installIntoUserLibrary,
  saveCopy,
  type InstallResult,
} from './ableton-device'
import { EngineProcess, shouldStartEngine } from './engine-process'
import { OutputController } from './output/output'
import { isGitHubUrl, UpdateChecker } from './updates'
import { ScreenOutputs } from './screens'

const windowDirectory = path.dirname(fileURLToPath(import.meta.url))
const devServerUrl = process.env.ELECTRON_RENDERER_URL
const preload = path.join(windowDirectory, '../preload/index.cjs')
// Sandboxed preloads cannot read the OS, so pass what they need as arguments.
const additionalArguments = [
  `--stagecue-device-name=${os.hostname()}`,
  `--stagecue-app-version=${app.getVersion()}`,
]

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

const engine = new EngineProcess()

// Looks for a newer StageCue on GitHub. Only in the installed app, or when asked for while
// developing; STAGECUE_UPDATE_REPO (development only) points it at another repository to test.
const updates = new UpdateChecker(
  app.getVersion(),
  (!app.isPackaged && process.env.STAGECUE_UPDATE_REPO) || undefined,
)
const checkForUpdates = app.isPackaged || process.env.STAGECUE_UPDATE_CHECK === '1'

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
  const stopUpdateNews = updates.onStatus((status) => {
    if (!window.isDestroyed()) window.webContents.send('update:status', status)
  })
  window.on('closed', () => {
    stopForwarding()
    stopScreenUpdates()
    stopUpdateNews()
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
  ipcMain.handle('update:status', () => updates.status)
  ipcMain.on('update:open', (_event, which: unknown) => {
    const status = updates.status
    if (status.state !== 'available') return
    const url = which === 'page' ? status.pageUrl : status.downloadUrl
    if (isGitHubUrl(url)) void shell.openExternal(url)
  })
  if (checkForUpdates) updates.start()
  ipcMain.on('output:size', (_event, size: unknown) => {
    if (size === '1080p' || size === '4k') output.setSize(size)
  })
  ipcMain.handle('ableton:install', () => installIntoUserLibrary())
  ipcMain.handle('ableton:save-copy', async (event): Promise<InstallResult | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Save the Ableton device',
      buttonLabel: 'Save here',
      properties: ['openDirectory', 'createDirectory'] as Array<
        'openDirectory' | 'createDirectory'
      >,
    }
    const choice = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    const folder = choice.filePaths[0]
    if (choice.canceled || !folder) return null
    const result = await saveCopy(folder)
    if (result.ok) shell.showItemInFolder(path.join(result.folder, 'StageCue.amxd'))
    return result
  })
  ipcMain.on('ableton:reveal', () => {
    void installedFolder().then((folder) =>
      shell.showItemInFolder(path.join(folder, 'StageCue.amxd')),
    )
  })

  if (shouldStartEngine()) engine.start()

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

app.on('will-quit', () => {
  updates.stop()
  engine.stop()
})

app.on('window-all-closed', () => {
  screens.closeAll()
  void output.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
