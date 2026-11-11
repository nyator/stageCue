import { useEngineState, useLive } from '../../engine'
import { useOutputStatus } from '../../live/use-output-status'
import { useScreens } from '../../live/use-screens'
import { describeSignalPath, type SignalPath } from './signal'

/** The signal path as it is right now. Shared by Setup and the app's header. */
export function useSignalPath(): SignalPath {
  const state = useEngineState()
  const live = useLive()
  const output = useOutputStatus()
  const screens = useScreens()

  return describeSignalPath({
    engine:
      state.phase === 'connected'
        ? {
            phase: 'connected',
            clients: state.status.clients,
            addresses: state.status.addresses,
            port: state.status.port,
          }
        : { phase: state.phase === 'connecting' ? 'connecting' : 'offline' },
    daw: live?.state.daw ?? null,
    locators: live?.state.markers.length ?? 0,
    transport: live?.state.transport ?? null,
    output,
    screens,
  })
}
