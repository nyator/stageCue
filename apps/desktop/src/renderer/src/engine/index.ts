import { DEFAULT_ENGINE_PORT } from '@stagecue/event-protocol'
import { useSyncExternalStore } from 'react'
import { EngineConnection, type EngineConnectionState } from './engine-connection'

const CLIENT_ID_KEY = 'stagecue.clientId'
const ENGINE_URL_KEY = 'stagecue.engineUrl'

export const DEFAULT_ENGINE_URL = `ws://127.0.0.1:${DEFAULT_ENGINE_PORT}`

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable; the value then lasts for this session only.
  }
}

/** A stable per-install identity, so the engine can recognise this machine across restarts. */
function loadClientId(): string {
  const existing = readStorage(CLIENT_ID_KEY)
  if (existing) {
    return existing
  }
  const created = crypto.randomUUID()
  writeStorage(CLIENT_ID_KEY, created)
  return created
}

/** Returns an error message, or null if the address is usable. */
export function validateEngineUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return 'The address must start with ws:// or wss://.'
    }
    return url.hostname ? null : 'Enter a host name or IP address.'
  } catch {
    return 'Enter an address such as ws://192.168.1.20:7417.'
  }
}

export const engine = new EngineConnection(readStorage(ENGINE_URL_KEY) ?? DEFAULT_ENGINE_URL, {
  clientId: loadClientId(),
  role: 'desktop',
  name: (window.stagecue?.deviceName ?? 'StageCue Desktop').slice(0, 80),
})

export function changeEngineUrl(url: string): void {
  writeStorage(ENGINE_URL_KEY, url)
  engine.setUrl(url)
}

export function useEngineState(): EngineConnectionState {
  return useSyncExternalStore(engine.subscribe, engine.getState)
}

export { EngineRequestError } from './engine-connection'
export type { EngineConnectionState }

// During development, a hot reload of this module must not leave the old socket open.
import.meta.hot?.dispose(() => engine.stop())
