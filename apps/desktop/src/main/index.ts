import { app, BrowserWindow, session, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const windowDirectory = path.dirname(fileURLToPath(import.meta.url))
const devServerUrl = process.env.ELECTRON_RENDERER_URL

function isAllowedNavigation(url: string): boolean {
  if (devServerUrl && url.startsWith(devServerUrl)) {
    return true
  }

  return url.startsWith('file:')
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#121916',
    title: 'StageCue',
    webPreferences: {
      preload: path.join(windowDirectory, '../preload/index.cjs'),
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

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
    return
  }

  void window.loadFile(path.join(windowDirectory, '../renderer/index.html'))
}

void app.whenReady().then(() => {
  app.setAppUserModelId('com.stagecue.desktop')

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
