import type { DeviceCopyResult } from '@stagecue/shared-types'
import { app } from 'electron'
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/*
 * Installs the StageCue Max for Live device, so nobody has to find the file.
 *
 * The device is several files that must stay together (the .amxd and the two
 * scripts it loads by name). Copied into Live's User Library, it shows up in
 * Live's browser under User Library and can be dragged onto a track like any
 * Ableton effect. "Save a copy" puts the same folder anywhere (a USB stick, a
 * shared drive) for a music computer that does not run StageCue.
 */

export const DEVICE_FILES = [
  'StageCue.amxd',
  'stagecue-lom.js',
  'stagecue-bridge.js',
  'package.json',
] as const
export const DEVICE_FOLDER = 'StageCue'
/** Where Live lists Max audio effects inside the User Library. */
const BROWSER_PATH = ['Presets', 'Audio Effects', 'Max Audio Effect'] as const

export type InstallResult = DeviceCopyResult

/** The device files: from the repository while developing, from the app's resources once packaged. */
function sourceFolder(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'ableton-device')
    : path.resolve(app.getAppPath(), '../../integrations/ableton/device')
}

/** Folders holding each installed Live version's preferences. */
function preferenceRoots(): string[] {
  if (process.platform === 'darwin') {
    return [path.join(os.homedir(), 'Library', 'Preferences', 'Ableton')]
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
    return [path.join(appData, 'Ableton')]
  }
  return []
}

/** Reads `<ProjectPath Value="…" />` from inside `<UserLibrary>` in Live's Library.cfg. */
export function userLibraryFromConfig(xml: string): string | null {
  const section = /<UserLibrary>([\s\S]*?)<\/UserLibrary>/.exec(xml)?.[1]
  const projectPath = section && /<ProjectPath Value="([^"]+)"/.exec(section)?.[1]
  const name = section && /<ProjectName Value="([^"]+)"/.exec(section)?.[1]
  if (!projectPath) return null
  const decoded = projectPath.replaceAll('&amp;', '&').replaceAll('&quot;', '"')
  return path.join(decoded, name ?? 'User Library')
}

/**
 * The User Library of the most recently used Live version, or Live's default
 * location if its preferences cannot be read.
 */
export async function findUserLibrary(): Promise<string> {
  let newest: { library: string; modified: number } | null = null
  for (const root of preferenceRoots()) {
    let versions: string[]
    try {
      versions = (await readdir(root)).filter((name) => name.startsWith('Live '))
    } catch {
      continue
    }
    for (const version of versions) {
      const candidates = [
        path.join(root, version, 'Library.cfg'),
        path.join(root, version, 'Preferences', 'Library.cfg'),
      ]
      for (const config of candidates) {
        try {
          const [xml, info] = await Promise.all([readFile(config, 'utf8'), stat(config)])
          const library = userLibraryFromConfig(xml)
          if (library && (!newest || info.mtimeMs > newest.modified)) {
            newest = { library, modified: info.mtimeMs }
          }
        } catch {
          // Not this layout, or unreadable: try the next.
        }
      }
    }
  }
  if (newest) return newest.library
  const documents = process.platform === 'win32' ? 'Documents' : 'Music'
  return path.join(os.homedir(), documents, 'Ableton', 'User Library')
}

async function copyDevice(target: string): Promise<InstallResult> {
  const source = sourceFolder()
  try {
    await mkdir(target, { recursive: true })
    for (const file of DEVICE_FILES) {
      await copyFile(path.join(source, file), path.join(target, file))
    }
    return { ok: true, folder: target }
  } catch (error) {
    console.error('[ableton] Could not copy the device:', error)
    return {
      ok: false,
      reason:
        error instanceof Error && 'code' in error && error.code === 'ENOENT'
          ? 'The device files are missing from this copy of StageCue.'
          : 'Could not copy the device. Check that the folder can be written to.',
    }
  }
}

/** Where the device goes inside Live's User Library. */
export async function installedFolder(): Promise<string> {
  return path.join(await findUserLibrary(), ...BROWSER_PATH, DEVICE_FOLDER)
}

/** Copies the device into Live's User Library, replacing an older copy. */
export async function installIntoUserLibrary(): Promise<InstallResult> {
  return copyDevice(await installedFolder())
}

/** Copies the device into a "StageCue" folder inside the chosen folder. */
export function saveCopy(parent: string): Promise<InstallResult> {
  return copyDevice(path.join(parent, DEVICE_FOLDER))
}
