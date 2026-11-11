import { EngineConnection, randomId } from '@stagecue/engine-client'

const CLIENT_ID_KEY = 'stagecue.screen.clientId'

function loadClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)
    if (existing) return existing
    const created = randomId()
    localStorage.setItem(CLIENT_ID_KEY, created)
    return created
  } catch {
    // Some TV browsers block storage; the screen then gets a new id each load.
    return randomId()
  }
}

const params = new URLSearchParams(location.search)

/** Opened by the StageCue app on an attached screen, rather than in a browser. */
export const embedded = params.get('embedded') === '1'

/**
 * The page is served by the engine, so the engine is wherever the page came
 * from. `?name=Choir%20TV` names this screen in StageCue's device list.
 */
export const connection = new EngineConnection(
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`,
  {
    clientId: loadClientId(),
    role: 'display',
    name: (params.get('name')?.trim() || 'Screen').slice(0, 80),
  },
)
