import { DEFAULT_ENGINE_PORT } from '@stagecue/event-protocol'
import { useSyncExternalStore } from 'react'
import { EngineConnection, type EngineConnectionState } from './engine-connection'

const CLIENT_ID_KEY = 'stagecue.clientId'

/** A stable per-install identity, so the engine can recognise this machine across restarts. */
function loadClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)
    if (existing) {
      return existing
    }
    const created = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

// Phase 2 replaces this fixed address with the connection settings screen.
export const engine = new EngineConnection(`ws://127.0.0.1:${DEFAULT_ENGINE_PORT}`, {
  clientId: loadClientId(),
  role: 'desktop',
  name: 'StageCue Desktop',
})

export function useEngineState(): EngineConnectionState {
  return useSyncExternalStore(engine.subscribe, engine.getState)
}

export type { EngineConnectionState }

// During development, a hot reload of this module must not leave the old socket open.
import.meta.hot?.dispose(() => engine.stop())
