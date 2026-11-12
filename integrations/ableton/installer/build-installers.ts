import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Builds the installers that put the StageCue device into Ableton:
 *
 *   release/StageCue-Ableton-<version>.pkg   macOS (pkgbuild + productbuild, built into macOS)
 *   release/StageCue-Ableton-<version>.exe   Windows (NSIS: `brew install makensis`, or
 *                                            `winget install NSIS.NSIS` on Windows)
 *
 * Each copies the four device files into the Ableton User Library of the person
 * installing it, found from Live's preferences. Run with
 * `pnpm --filter @stagecue/ableton build:installers`.
 *
 * Signing: set STAGECUE_INSTALLER_IDENTITY to a "Developer ID Installer: …"
 * certificate name to sign the .pkg. Without it, macOS asks people to allow
 * it in System Settings › Privacy & Security the first time.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const deviceFolder = path.resolve(here, '../device')
const releaseFolder = path.resolve(here, '../release')
const DEVICE_FILES = ['StageCue.amxd', 'stagecue-lom.js', 'stagecue-bridge.js', 'package.json']
const IDENTIFIER = 'com.stagecue.ableton-device'

const { version } = JSON.parse(readFileSync(path.resolve(here, '../package.json'), 'utf8')) as {
  version: string
}

function has(command: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function run(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: 'inherit' })
}

function buildMac(): string | null {
  if (process.platform !== 'darwin' || !has('pkgbuild') || !has('productbuild')) {
    console.log('Skipping the .pkg: it needs macOS (pkgbuild and productbuild).')
    return null
  }
  const work = mkdtempSync(path.join(tmpdir(), 'stagecue-pkg-'))
  try {
    // A scripts-only package: the device files travel beside postinstall, which copies them
    // into the User Library of whoever is logged in.
    const scripts = path.join(work, 'scripts')
    mkdirSync(scripts)
    copyFileSync(path.join(here, 'mac', 'postinstall'), path.join(scripts, 'postinstall'))
    chmodSync(path.join(scripts, 'postinstall'), 0o755)
    for (const file of DEVICE_FILES) {
      copyFileSync(path.join(deviceFolder, file), path.join(scripts, file))
    }
    const component = path.join(work, 'device.pkg')
    run('pkgbuild', [
      '--nopayload',
      '--scripts',
      scripts,
      '--identifier',
      IDENTIFIER,
      '--version',
      version,
      component,
    ])

    const resources = path.join(work, 'resources')
    mkdirSync(resources)
    for (const page of ['welcome.html', 'conclusion.html']) {
      copyFileSync(path.join(here, 'mac', page), path.join(resources, page))
    }
    const distribution = path.join(work, 'distribution.xml')
    writeFileSync(
      distribution,
      readFileSync(path.join(here, 'mac', 'distribution.xml'), 'utf8').replaceAll(
        '__VERSION__',
        version,
      ),
    )

    const out = path.join(releaseFolder, `StageCue-Ableton-${version}.pkg`)
    const identity = process.env.STAGECUE_INSTALLER_IDENTITY
    run('productbuild', [
      '--distribution',
      distribution,
      '--resources',
      resources,
      '--package-path',
      work,
      ...(identity ? ['--sign', identity] : []),
      out,
    ])
    return out
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

function buildWindows(): string | null {
  if (!has('makensis')) {
    console.log(
      'Skipping the .exe: install NSIS first (`brew install makensis`, or `winget install NSIS.NSIS`).',
    )
    return null
  }
  const out = path.join(releaseFolder, `StageCue-Ableton-${version}.exe`)
  run('makensis', [
    '-V2',
    `-DVERSION=${version}`,
    `-DOUTFILE=${out}`,
    `-DDEVICE=${deviceFolder}`,
    path.join(here, 'windows', 'StageCue-Ableton.nsi'),
  ])
  return out
}

mkdirSync(releaseFolder, { recursive: true })
const built = [buildMac(), buildWindows()].filter((file): file is string => file !== null)
console.log(built.length ? `\nBuilt:\n${built.map((file) => `  ${file}`).join('\n')}` : '')
