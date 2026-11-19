import { describe, expect, it } from 'vitest'
import { isGitHubUrl, isNewer, pickAsset, readRelease } from './updates'

const assets = [
  { name: 'StageCue-0.1.1-arm64.dmg', url: 'https://github.com/x/y/arm.dmg' },
  { name: 'StageCue-0.1.1.dmg', url: 'https://github.com/x/y/intel.dmg' },
  { name: 'StageCue-Setup-0.1.1.exe', url: 'https://github.com/x/y/setup.exe' },
  { name: 'StageCue-Ableton-0.1.0.pkg', url: 'https://github.com/x/y/device.pkg' },
  { name: 'StageCue-Ableton-0.1.0.exe', url: 'https://github.com/x/y/device.exe' },
]

describe('isNewer', () => {
  it('compares each part as a number', () => {
    expect(isNewer('0.1.1', '0.1.0')).toBe(true)
    expect(isNewer('v0.1.10', '0.1.9')).toBe(true)
    expect(isNewer('0.2.0', '0.10.0')).toBe(false)
    expect(isNewer('0.1.0', '0.1.0')).toBe(false)
  })

  it('ignores versions it cannot read', () => {
    expect(isNewer('0.2.0-beta', '0.1.0')).toBe(false)
    expect(isNewer('latest', '0.1.0')).toBe(false)
  })
})

describe('pickAsset', () => {
  it('picks the app for this Mac, never the Ableton device', () => {
    expect(pickAsset(assets, 'darwin', 'arm64')?.name).toBe('StageCue-0.1.1-arm64.dmg')
    expect(pickAsset(assets, 'darwin', 'x64')?.name).toBe('StageCue-0.1.1.dmg')
    expect(pickAsset(assets, 'win32', 'x64')?.name).toBe('StageCue-Setup-0.1.1.exe')
  })

  it('finds nothing when the release has no app for this computer', () => {
    expect(pickAsset(assets.slice(3), 'win32', 'x64')).toBeNull()
    expect(pickAsset(assets.slice(0, 1), 'darwin', 'x64')).toBeNull()
  })
})

describe('readRelease', () => {
  it('reads what GitHub sends', () => {
    const release = readRelease({
      tag_name: 'v0.1.1',
      html_url: 'https://github.com/x/y/releases/tag/v0.1.1',
      draft: false,
      prerelease: false,
      assets: [{ name: 'a.dmg', browser_download_url: 'https://github.com/a.dmg' }, { junk: 1 }],
    })
    expect(release).toEqual({
      version: '0.1.1',
      pageUrl: 'https://github.com/x/y/releases/tag/v0.1.1',
      assets: [{ name: 'a.dmg', url: 'https://github.com/a.dmg' }],
    })
  })

  it('skips drafts, test releases and odd answers', () => {
    expect(readRelease({ tag_name: 'v1.0.0', html_url: 'u', prerelease: true })).toBeNull()
    expect(readRelease({ message: 'Not Found' })).toBeNull()
    expect(readRelease(null)).toBeNull()
  })
})

describe('isGitHubUrl', () => {
  it('only allows https links on github.com', () => {
    expect(isGitHubUrl('https://github.com/nyator/stageCue/releases/download/v1/a.dmg')).toBe(true)
    expect(isGitHubUrl('http://github.com/a')).toBe(false)
    expect(isGitHubUrl('https://github.com.evil.example/a')).toBe(false)
    expect(isGitHubUrl('file:///etc/passwd')).toBe(false)
  })
})
