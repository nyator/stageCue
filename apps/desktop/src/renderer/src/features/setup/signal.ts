import type { ConnectedClient } from '@stagecue/event-protocol'
import type { OutputStatus, ScreenInfo } from '@stagecue/shared-types'

/*
 * The Setup page draws StageCue as a signal path: Ableton → engine → outputs.
 * This module decides what each box says. Pure, so the rules are tested apart
 * from the drawing.
 */

export const NODE_IDS = ['ableton', 'engine', 'propresenter', 'screens', 'browsers'] as const
export type NodeId = (typeof NODE_IDS)[number]

/** Ids that tie each box (a tab) to the panel below it. */
export const tabId = (id: NodeId): string => `setup-node-${id}`
export const PANEL_ID = 'setup-panel'

/** live: signal flowing now. ready: patched, nothing flowing. waiting: needs a step. */
export type Lamp = 'live' | 'ready' | 'waiting' | 'failing' | 'off'

export interface NodeState {
  lamp: Lamp
  /** One or two words beside the lamp, so colour is never the only signal. */
  status: string
  /** A short second line: what it is connected to, or what is missing. */
  detail: string
  /** The source and engine boxes are tall; this sits at their foot. */
  foot?: string
}

export interface SignalInput {
  engine:
    | { phase: 'connected'; clients: ConnectedClient[]; addresses: string[]; port: number }
    | { phase: 'connecting' | 'offline' }
  daw: { connected: boolean; name: string | null; project: string | null } | null
  /** Locators in the Live set, as last reported. */
  locators: number
  transport: { playing: boolean; tempo: number } | null
  output: OutputStatus | null
  screens: ScreenInfo[]
}

export interface Verdict {
  tone: 'ok' | 'warn' | 'bad'
  text: string
}

export interface SignalPath {
  nodes: Record<NodeId, NodeState>
  verdict: Verdict
  /** The box to open first: the first broken link, if any. */
  needsAttention: NodeId | null
}

/*
 * Display clients are told apart by the names StageCue gives them: the NDI
 * output page is “<computer> output” and attached screens end in “(attached)”
 * (see apps/desktop/src/main/screens.ts). Everything else is a browser.
 */
export function browserDisplays(clients: readonly ConnectedClient[]): ConnectedClient[] {
  return clients.filter(
    (client) =>
      client.role === 'display' &&
      !client.name.endsWith(' output') &&
      !client.name.endsWith('(attached)'),
  )
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function describeSignalPath(input: SignalInput): SignalPath {
  const engineUp = input.engine.phase === 'connected'
  const clients = input.engine.phase === 'connected' ? input.engine.clients : []

  const engine: NodeState =
    input.engine.phase === 'connected'
      ? {
          lamp: 'ready',
          status: 'Running',
          detail:
            input.engine.addresses.length > 0
              ? `${input.engine.addresses[0]}:${input.engine.port}`
              : 'This computer only',
          foot: `${count(input.engine.clients.length, 'connection')} now`,
        }
      : input.engine.phase === 'connecting'
        ? { lamp: 'waiting', status: 'Connecting', detail: 'Looking for the engine' }
        : { lamp: 'failing', status: 'Offline', detail: 'The engine is not running' }

  const daw = input.daw
  const source = daw?.project ?? daw?.name ?? 'Ableton'
  const locators =
    input.locators === 0 ? 'No locators yet' : `${count(input.locators, 'locator')} in the set`
  const abletonState: NodeState = !engineUp
    ? { lamp: 'off', status: 'Unknown', detail: 'Needs the engine' }
    : !daw?.connected
      ? { lamp: 'waiting', status: 'Not connected', detail: 'Waiting for the device' }
      : input.transport?.playing
        ? {
            lamp: 'live',
            status: 'Playing',
            detail: `${source} · ${Math.round(input.transport.tempo)} BPM`,
          }
        : { lamp: 'ready', status: 'Stopped', detail: source }
  const ableton: NodeState = daw?.connected ? { ...abletonState, foot: locators } : abletonState

  const output = input.output
  const propresenter: NodeState = !output
    ? { lamp: 'off', status: 'Checking', detail: 'NDI output' }
    : output.state === 'sending'
      ? output.receivers > 0
        ? { lamp: 'live', status: 'On air', detail: count(output.receivers, 'receiver') }
        : { lamp: 'ready', status: 'Ready', detail: 'No receiver yet' }
      : output.state === 'starting'
        ? { lamp: 'waiting', status: 'Starting', detail: 'NDI output' }
        : output.state === 'error'
          ? { lamp: 'failing', status: 'Error', detail: 'NDI could not start' }
          : { lamp: 'off', status: 'Not set up', detail: 'NDI is not available here' }

  const showing = input.screens.filter((screen) => screen.showing).length
  const screens: NodeState =
    showing > 0
      ? {
          lamp: 'live',
          status: 'Showing',
          detail: `${showing} of ${count(input.screens.length, 'screen')}`,
        }
      : input.screens.length <= 1
        ? { lamp: 'off', status: 'None', detail: 'Only this screen is connected' }
        : {
            lamp: 'off',
            status: 'Not showing',
            detail: `${count(input.screens.length, 'screen')} connected`,
          }

  const open = browserDisplays(clients)
  const browsers: NodeState = !engineUp
    ? { lamp: 'off', status: 'Unknown', detail: 'Needs the engine' }
    : open.length > 0
      ? { lamp: 'live', status: 'Open', detail: open.map((client) => client.name).join(', ') }
      : { lamp: 'off', status: 'None open', detail: 'Open the address on a TV' }

  const nodes = { ableton, engine, propresenter, screens, browsers }
  const liveOutputs = [propresenter, screens, browsers].filter(
    (node) => node.lamp === 'live',
  ).length

  let verdict: Verdict
  let needsAttention: NodeId | null = null
  if (input.engine.phase === 'offline') {
    verdict = { tone: 'bad', text: 'StageCue’s engine is not running' }
    needsAttention = 'engine'
  } else if (input.engine.phase === 'connecting') {
    verdict = { tone: 'warn', text: 'Connecting to StageCue’s engine…' }
    needsAttention = 'engine'
  } else if (!daw?.connected) {
    verdict = { tone: 'warn', text: 'Waiting for Ableton' }
    needsAttention = 'ableton'
  } else if (liveOutputs === 0) {
    verdict = { tone: 'warn', text: 'Ableton is connected, but nothing is showing the cue yet' }
  } else {
    verdict = {
      tone: 'ok',
      text: `Ready. Ableton is ${input.transport?.playing ? 'playing' : 'stopped'}, and the cue is on ${count(liveOutputs, 'output')}.`,
    }
  }

  return { nodes, verdict, needsAttention }
}
