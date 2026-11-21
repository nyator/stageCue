import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { beatAt, smoothBeat } from '@stagecue/arrangement'
import { EngineConnection } from '@stagecue/engine-client'
import { CLEAN, openLink, type LinkProfile } from './link.ts'

/*
 * Network lab: plays poor Wi-Fi between the Ableton device and the engine, and
 * between the engine and a TV, and measures how far the screen strays from
 * Ableton's real playhead.
 *
 *   pretend Ableton ──(device link)──► engine ──(screen link)──► screen
 *
 * The pretend Ableton sends what the real device sends (the playhead every
 * 50 ms). The screen is the app's own engine client, with the same per-frame
 * estimate and smoothing as the band (useCueView). Everything runs on this
 * computer, so the true playhead is known exactly and the error can be measured
 * every frame.
 *
 * Run with `pnpm netlab` (all scenarios) or `pnpm netlab --only "Busy Wi-Fi"`.
 */

const { values } = parseArgs({
  // pnpm can pass a literal "--" through to the script.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    only: { type: 'string' },
    seconds: { type: 'string', default: '12' },
    port: { type: 'string', default: '7517' },
    /** Pretend the music computer's clock is this far off (ms), as two computers' clocks are. */
    'clock-offset': { type: 'string', default: '3700' },
  },
})

const TEMPO = 120
const REPORT_MS = 50
const FRAME_MS = 1000 / 60
const MS_PER_BEAT = 60_000 / TEMPO
const SECONDS = Number(values.seconds)
const ENGINE_PORT = Number(values.port)
const CLOCK_OFFSET = Number(values['clock-offset'])

interface Scenario {
  name: string
  device: LinkProfile
  screen: LinkProfile
  /** Cut the device's connection for this long, partway through. */
  dropMs?: number
  /** Cut the screen's connection for this long, partway through. */
  dropScreenMs?: number
}

const wifi = (delayMs: number, jitterMs: number, stallEveryMs = 0, stallMs = 0): LinkProfile => ({
  delayMs,
  jitterMs,
  stallEveryMs,
  stallMs,
})

const SCENARIOS: Scenario[] = [
  { name: 'Same computer', device: CLEAN, screen: CLEAN },
  { name: 'Good Wi-Fi', device: wifi(4, 12), screen: wifi(4, 12) },
  { name: 'Busy Wi-Fi', device: wifi(20, 80), screen: wifi(20, 80) },
  { name: 'Power saving', device: wifi(4, 12, 1_000, 150), screen: CLEAN },
  { name: 'Lost packets', device: wifi(4, 12, 3_000, 400), screen: CLEAN },
  { name: 'Wi-Fi freezes 1.5 s', device: wifi(4, 12, 6_000, 1_500), screen: CLEAN },
  { name: 'TV on busy Wi-Fi', device: CLEAN, screen: wifi(20, 80, 3_000, 300) },
  { name: 'Wi-Fi drops 3 s', device: wifi(4, 12), screen: CLEAN, dropMs: 3_000 },
  { name: 'TV Wi-Fi drops 3 s', device: CLEAN, screen: wifi(4, 12), dropScreenMs: 3_000 },
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// The true playhead: Ableton playing from bar 1 at a steady tempo.
// ---------------------------------------------------------------------------

const startedAt = Date.now() + 1_000
const trueBeat = (now = Date.now()) => ((now - startedAt) / 60_000) * TEMPO

// ---------------------------------------------------------------------------
// Pretend Ableton device: the same messages as stagecue-bridge.js.
// ---------------------------------------------------------------------------

function startDevice(port: number): () => void {
  let socket: WebSocket | null = null
  let seq = 0
  let stopped = false
  const clientId = crypto.randomUUID()
  const send = (type: string, payload: unknown) => {
    if (socket?.readyState !== WebSocket.OPEN) return
    seq += 1
    // The music computer's own clock, which is never exactly the engine's.
    const sentAt = Date.now() + CLOCK_OFFSET
    socket.send(JSON.stringify({ v: 1, type, seq, sentAt, payload }))
  }
  const transport = () => ({
    playing: true,
    beat: trueBeat(),
    tempo: TEMPO,
    timeSignature: { numerator: 4, denominator: 4 },
    loop: null,
  })
  const connect = () => {
    if (stopped) return
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    socket = ws
    ws.onopen = () => {
      seq = 0
      send('hello', { clientId, role: 'daw_bridge', name: 'Netlab device' })
      send('daw.markers', {
        project: 'Netlab',
        markers: Array.from({ length: 64 }, (_, i) => ({ name: `Section ${i + 1}`, beat: i * 32 })),
      })
      send('daw.transport', transport())
    }
    // Like the device: try again a second after losing the engine.
    ws.onclose = () => {
      if (socket === ws) socket = null
      setTimeout(connect, 1_000)
    }
    ws.onerror = () => {}
  }
  connect()
  const timer = setInterval(() => send('daw.transport', transport()), REPORT_MS)
  return () => {
    stopped = true
    clearInterval(timer)
    socket?.close()
  }
}

// ---------------------------------------------------------------------------
// The screen: what the band would show, every frame.
// ---------------------------------------------------------------------------

interface Stats {
  frames: number
  /** Screen minus truth, ms. Negative is behind. */
  errors: number[]
  backwards: number
  longestFreezeMs: number
}

function watchScreen(connection: EngineConnection): { take(): Stats; reset(): void } {
  let shown: number | null = null
  let stats: Stats = { frames: 0, errors: [], backwards: 0, longestFreezeMs: 0 }
  let frozenSince: number | null = null
  let lastShown: number | null = null

  setInterval(() => {
    const live = connection.getLive()
    const transport = live?.state.transport
    if (!live || !transport) return
    const estimate = beatAt(transport, performance.now() - live.receivedAt)
    shown = transport.playing ? smoothBeat(shown, estimate) : transport.beat
    const now = performance.now()
    stats.frames += 1
    stats.errors.push((shown - trueBeat()) * MS_PER_BEAT)
    if (lastShown !== null && shown < lastShown - 1e-9) stats.backwards += 1
    if (lastShown !== null && Math.abs(shown - lastShown) < 1e-9) {
      frozenSince ??= now - FRAME_MS
      stats.longestFreezeMs = Math.max(stats.longestFreezeMs, now - frozenSince)
    } else {
      frozenSince = null
    }
    lastShown = shown
  }, FRAME_MS).unref()

  return {
    take: () => stats,
    reset: () => {
      stats = { frames: 0, errors: [], backwards: 0, longestFreezeMs: 0 }
      frozenSince = null
    },
  }
}

function summarize(stats: Stats) {
  const sorted = stats.errors.map(Math.abs).sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  return {
    typical: at(0.5),
    p95: at(0.95),
    worst: sorted.at(-1) ?? 0,
    backwards: stats.backwards,
    freeze: stats.longestFreezeMs,
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'stagecue-netlab-'))
  const engineEntry = path.resolve(import.meta.dirname, '../../../apps/engine/src/index.ts')
  const engine = spawn(process.execPath, [engineEntry], {
    cwd: path.dirname(path.dirname(engineEntry)),
    env: {
      ...process.env,
      STAGECUE_ENGINE_HOST: '127.0.0.1',
      STAGECUE_ENGINE_PORT: String(ENGINE_PORT),
      STAGECUE_DATA_DIR: dataDir,
      STAGECUE_LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const cleanup = () => {
    engine.kill()
    rmSync(dataDir, { recursive: true, force: true })
  }
  process.on('exit', cleanup)
  await sleep(1_500)

  const deviceLink = await openLink(ENGINE_PORT)
  const screenLink = await openLink(ENGINE_PORT)
  const stopDevice = startDevice(deviceLink.port)
  const screen = new EngineConnection(`ws://127.0.0.1:${screenLink.port}`, {
    clientId: crypto.randomUUID(),
    role: 'display',
    name: 'Netlab screen',
  })
  screen.start()
  const watch = watchScreen(screen)
  await sleep(2_000)

  const chosen = SCENARIOS.filter((s) => !values.only || s.name === values.only)
  const rows: string[][] = []
  for (const scenario of chosen) {
    deviceLink.setProfile(scenario.device)
    screenLink.setProfile(scenario.screen)
    await sleep(1_500) // let the new conditions take hold
    watch.reset()
    if (scenario.dropMs || scenario.dropScreenMs) {
      await sleep(3_000)
      if (scenario.dropMs) deviceLink.drop(scenario.dropMs)
      if (scenario.dropScreenMs) screenLink.drop(scenario.dropScreenMs)
      await sleep(SECONDS * 1_000 - 3_000)
    } else {
      await sleep(SECONDS * 1_000)
    }
    const s = summarize(watch.take())
    const ms = (n: number) => `${Math.round(n)} ms`
    rows.push([
      scenario.name,
      ms(s.typical),
      ms(s.p95),
      ms(s.worst),
      String(s.backwards),
      ms(s.freeze),
    ])
    console.log(`  ${scenario.name}: done`)
  }

  const head = ['Scenario', 'Typical error', '95% within', 'Worst', 'Steps back', 'Longest freeze']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ')
  console.log(`\n${line(head)}\n${widths.map((w) => '─'.repeat(w)).join('  ')}`)
  for (const row of rows) console.log(line(row))
  console.log(
    `\nError: how far the screen's playhead is from Ableton's, every frame (${Math.round(MS_PER_BEAT)} ms is one beat at ${TEMPO} BPM).`,
  )

  stopDevice()
  screen.stop()
  await deviceLink.close()
  await screenLink.close()
  cleanup()
  process.exit(0)
}

void main()
