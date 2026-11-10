import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import type { TimeSignature } from '@stagecue/arrangement'
import {
  DEFAULT_ENGINE_PORT,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ClientMessagePayload,
} from '@stagecue/event-protocol'
import { SAMPLE_SET } from './song.ts'

/*
 * Pretends to be the Ableton bridge: says hello as daw_bridge, sends the
 * markers, then plays through the song, reporting the playhead ten times a
 * second, the way the Max for Live device will. Space plays or stops,
 * arrow keys jump a bar, r restarts, q quits.
 */

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: `ws://127.0.0.1:${DEFAULT_ENGINE_PORT}` },
    tempo: { type: 'string', default: '96' },
  },
})

const tempo = Number(values.tempo)
if (!Number.isFinite(tempo) || tempo < 10 || tempo > 999) {
  console.error('--tempo must be a number between 10 and 999.')
  process.exit(1)
}

const timeSignature: TimeSignature = { numerator: 4, denominator: 4 }
const REPORT_INTERVAL_MS = 100
const PAUSE_AT_END_MS = 3_000
const clientId = randomUUID()

// The simulated DAW clock.
let playing = true
let beat = 0
let lastTick = performance.now()
let endedAt: number | null = null

let socket: WebSocket | null = null
let seq = 0

function send<T extends ClientMessage['type']>(type: T, payload: ClientMessagePayload<T>): void {
  if (socket?.readyState !== WebSocket.OPEN) return
  seq += 1
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, seq, sentAt: Date.now(), payload }))
}

const reportTransport = () => send('daw.transport', { playing, beat, tempo, timeSignature })

function currentMarker(): string {
  const marker = SAMPLE_SET.markers.filter((m) => m.beat <= beat).at(-1)
  return marker?.name ?? '(before the first marker)'
}

function status(): void {
  const bar = Math.floor(beat / timeSignature.numerator) + 1
  const beatInBar = Math.floor(beat % timeSignature.numerator) + 1
  const connection = socket?.readyState === WebSocket.OPEN ? 'connected' : 'connecting'
  process.stdout.write(
    `\r${playing ? '▶' : '■'} bar ${String(bar).padStart(3)}.${beatInBar}  ${currentMarker().padEnd(36)}  ${connection}   `,
  )
}

function connect(): void {
  const ws = new WebSocket(values.url!)
  socket = ws

  ws.addEventListener('open', () => {
    seq = 0
    send('hello', { clientId, role: 'daw_bridge', name: 'StageCue Simulator' })
    send('daw.markers', { project: SAMPLE_SET.project, markers: SAMPLE_SET.markers })
    reportTransport()
  })

  ws.addEventListener('message', (event) => {
    const result = parseServerMessage(String(event.data))
    if (result.ok && result.message.type === 'error') {
      console.error(`\nEngine rejected a message: ${result.message.payload.message}`)
    }
  })

  ws.addEventListener('close', () => {
    if (socket === ws) {
      socket = null
      setTimeout(connect, 1_000)
    }
  })

  ws.addEventListener('error', () => {
    // A close event follows; reconnecting happens there.
  })
}

function tick(): void {
  const now = performance.now()
  if (playing) {
    beat += ((now - lastTick) / 60_000) * tempo
    if (beat >= SAMPLE_SET.endBeat) {
      beat = SAMPLE_SET.endBeat
      playing = false
      endedAt = now
    }
  } else if (endedAt !== null && now - endedAt > PAUSE_AT_END_MS) {
    // Loop: jump back to the start and play again, like a rehearsal.
    beat = 0
    playing = true
    endedAt = null
  }
  lastTick = now
  reportTransport()
  status()
}

function control(key: string): void {
  const bar = timeSignature.numerator
  if (key === ' ') playing = !playing
  else if (key === 'r') beat = 0
  else if (key === '\u001b[C') beat = Math.min(SAMPLE_SET.endBeat, Math.floor(beat / bar + 1) * bar)
  else if (key === '\u001b[D') beat = Math.max(0, Math.ceil(beat / bar - 1) * bar)
  else if (key === 'q' || key === '\u0003') {
    console.log()
    process.exit(0)
  } else return
  endedAt = null
  lastTick = performance.now()
  reportTransport()
  status()
}

console.log(`StageCue simulator: ${tempo} BPM in 4/4, sending to ${values.url}`)
if (process.stdin.isTTY) {
  console.log('Space plays or stops · ← → jump a bar · r restarts · q quits')
  process.stdin.setRawMode(true)
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (key: string) => control(key))
}

connect()
setInterval(tick, REPORT_INTERVAL_MS)
