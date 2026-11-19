import type { UpdateStatus } from '@stagecue/shared-types'

/*
 * Tells the media team when a newer StageCue is out. It only looks: it never
 * downloads or installs anything. The Setup page shows a banner, and the
 * Download button opens the file's page in the browser; the person installs it
 * the usual way (drag into Applications).
 *
 * Releases come from GitHub (`UPDATE_REPOSITORY`), the public website
 * repository, so no sign-in is needed. (For a private one GitHub
 * answers 404, and the check would quietly find nothing.)
 *
 * Fully automatic updates (download and install on restart) need the app
 * signed with an Apple Developer ID; see technical-design.md §10.
 */

/**
 * The website's repository: public, and its releases hold the installers that
 * the site's Download page lists. The code stays in the private repository.
 */
export const UPDATE_REPOSITORY = 'nyator/stagecue-site'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_AFTER_MS = 10_000

interface ReleaseAsset {
  name: string
  url: string
}

export interface Release {
  version: string
  pageUrl: string
  assets: ReleaseAsset[]
}

/** "v0.1.10" → [0, 1, 10]. Null for anything that is not a plain version. */
export function parseVersion(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!
  }
  return false
}

/**
 * The app's own installer for this computer, skipping the Ableton device
 * installers that sit in the same release (StageCue-Ableton-…).
 */
export function pickAsset(
  assets: readonly ReleaseAsset[],
  platform: NodeJS.Platform,
  arch: string,
): ReleaseAsset | null {
  const apps = assets.filter((asset) => !/ableton/i.test(asset.name))
  if (platform === 'darwin') {
    const dmgs = apps.filter((asset) => asset.name.toLowerCase().endsWith('.dmg'))
    const wantArm = arch === 'arm64'
    return dmgs.find((asset) => /arm64/i.test(asset.name) === wantArm) ?? null
  }
  if (platform === 'win32') {
    return apps.find((asset) => asset.name.toLowerCase().endsWith('.exe')) ?? null
  }
  return null
}

/** Reads GitHub's "latest release" answer, ignoring anything unexpected. */
export function readRelease(json: unknown): Release | null {
  if (!json || typeof json !== 'object') return null
  const data = json as Record<string, unknown>
  if (data.draft === true || data.prerelease === true) return null
  if (typeof data.tag_name !== 'string' || typeof data.html_url !== 'string') return null
  if (!parseVersion(data.tag_name)) return null
  const assets = Array.isArray(data.assets)
    ? data.assets.flatMap((asset: unknown) => {
        if (!asset || typeof asset !== 'object') return []
        const { name, browser_download_url: url } = asset as Record<string, unknown>
        return typeof name === 'string' && typeof url === 'string' ? [{ name, url }] : []
      })
    : []
  return { version: data.tag_name.replace(/^v/, ''), pageUrl: data.html_url, assets }
}

/** Only GitHub links are ever opened from an update. */
export function isGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com'
  } catch {
    return false
  }
}

export class UpdateChecker {
  readonly #currentVersion: string
  readonly #repository: string
  readonly #listeners = new Set<(status: UpdateStatus) => void>()
  #status: UpdateStatus = { state: 'idle' }
  #timers: ReturnType<typeof setTimeout>[] = []

  constructor(currentVersion: string, repository = UPDATE_REPOSITORY) {
    this.#currentVersion = currentVersion
    this.#repository = repository
  }

  get status(): UpdateStatus {
    return this.#status
  }

  onStatus(listener: (status: UpdateStatus) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  start(): void {
    this.#timers.push(setTimeout(() => void this.check(), FIRST_CHECK_AFTER_MS))
    this.#timers.push(setInterval(() => void this.check(), CHECK_EVERY_MS))
  }

  stop(): void {
    for (const timer of this.#timers) clearTimeout(timer)
    this.#timers = []
  }

  async check(): Promise<UpdateStatus> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.#repository}/releases/latest`,
        {
          headers: { accept: 'application/vnd.github+json', 'user-agent': 'StageCue' },
          signal: AbortSignal.timeout(15_000),
        },
      )
      // 404: no published release, or the repository is private. Nothing to offer.
      if (!response.ok) return this.#set({ state: 'idle' })
      const release = readRelease(await response.json())
      if (!release || !isNewer(release.version, this.#currentVersion)) {
        return this.#set({ state: 'idle' })
      }
      const asset = pickAsset(release.assets, process.platform, process.arch)
      return this.#set({
        state: 'available',
        version: release.version,
        currentVersion: this.#currentVersion,
        downloadUrl: asset?.url ?? release.pageUrl,
        pageUrl: release.pageUrl,
      })
    } catch {
      // Offline, or GitHub unreachable: try again next time, keep what we knew.
      return this.#status
    }
  }

  #set(status: UpdateStatus): UpdateStatus {
    this.#status = status
    for (const listener of this.#listeners) listener(status)
    return status
  }
}
