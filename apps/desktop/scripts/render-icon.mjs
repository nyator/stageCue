/* global console, setTimeout */
/*
 * Renders build/icon.svg to build/icon.png (1024 × 1024, transparent corners) with
 * Electron's own Chromium, so the app's oklch colours come out exactly as in the
 * app. electron-builder makes the macOS and Windows icons from that PNG.
 *
 * Run with `pnpm --filter @stagecue/desktop icon`.
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const buildDir = path.resolve(import.meta.dirname, '../build')
const svg = readFileSync(path.join(buildDir, 'icon.svg'), 'utf8')
const SIZE = 1024

app.dock?.hide()
// Not a top-level await: Electron fires "ready" only after this module has finished loading.
void app
  .whenReady()
  .then(render)
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })

async function render() {
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: { offscreen: { useSharedTexture: false }, zoomFactor: 1 },
  })
  const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`
  // Off-screen windows hand over each painted frame; keep the first full-size one.
  const frame = new Promise((resolve) => {
    window.webContents.on('paint', (_event, _dirty, image) => {
      if (image.getSize().width >= SIZE) resolve(image)
    })
  })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  window.webContents.invalidate()
  const image = await Promise.race([
    frame,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Nothing was painted')), 10_000)),
  ])
  const png = image.resize({ width: SIZE, height: SIZE, quality: 'best' }).toPNG()
  writeFileSync(path.join(buildDir, 'icon.png'), png)
  console.log(`Wrote ${path.join(buildDir, 'icon.png')} (${image.getSize().width} px painted)`)
  app.quit()
}
