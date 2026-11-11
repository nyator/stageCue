/*
 * StageCue: the device's network side, running in Node for Max ([node.script]).
 *
 * Receives `markers <json>` and `transport <json>` from stagecue-lom.js, and
 * `host <address>` from the device's address field. Connects to the StageCue
 * engine as a daw_bridge, the same way integrations/simulator does, and
 * reconnects on its own. Sends `status <text>` and `host <address>` back to the
 * device for display.
 *
 * Uses Node's built-in WebSocket (Node 22, bundled with Max 9), so the device
 * needs no npm packages.
 */

const Max = require('max-api')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PROTOCOL_VERSION = 1
const DEFAULT_PORT = 7417
const DEFAULT_HOST = `127.0.0.1:${DEFAULT_PORT}`
const RETRY_MIN_MS = 1_000
const RETRY_MAX_MS = 5_000
/** A connection attempt that has not opened by now is given up and retried. */
const CONNECT_TIMEOUT_MS = 4_000
const WATCHDOG_MS = 2_000

// Settings survive Live restarts and are shared by every StageCue device on this computer.
const SETTINGS_FILE = path.join(os.homedir(), '.stagecue', 'ableton-device.json')
const settings = loadSettings()

let socket = null
let seq = 0
let retryMs = RETRY_MIN_MS
let retryTimer = null
let connectingSince = 0
/** Set when the engine refuses this device's protocol version: retrying cannot help. */
let incompatible = false
let lastMarkers = null
let lastTransport = null

function loadSettings() {
  let stored = {}
  try {
    stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
  } catch {
    // First run, or an unreadable file: start fresh.
  }
  const result = {
    clientId: isUuid(stored.clientId) ? stored.clientId : crypto.randomUUID(),
    host: typeof stored.host === 'string' && stored.host ? stored.host : DEFAULT_HOST,
  }
  saveSettings(result)
  return result
}

function saveSettings(value) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(value, null, 2))
  } catch (error) {
    Max.post(`StageCue: could not save settings: ${error.message}`)
  }
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
}

/** Accepts "192.168.1.20", "192.168.1.20:7417", or "ws://192.168.1.20:7417". */
function engineUrl(host) {
  const bare = host
    .trim()
    .replace(/^wss?:\/\//, '')
    .replace(/\/+$/, '')
  return `ws://${bare.includes(':') ? bare : `${bare}:${DEFAULT_PORT}`}`
}

function deviceName() {
  const machine = os.hostname().replace(/\.local$/, '')
  return `Ableton on ${machine}`.slice(0, 80)
}

// The status light on the device: connected, working on it, or needs attention.
const LIGHT = {
  ok: [0.37, 0.83, 0.6, 1],
  wait: [0.96, 0.72, 0.26, 1],
  error: [0.93, 0.36, 0.36, 1],
}

function status(text, light = 'wait') {
  Max.outlet('status', text)
  Max.outlet('light', ...LIGHT[light])
}

// What the device shows about the song: the section under the playhead, and
// whether Live is playing. Sent only when it changes.
let shownSection = null
let shownPlaying = null

function showSong() {
  const markers = lastMarkers ? lastMarkers.markers : []
  const beat = lastTransport ? lastTransport.beat : 0
  let section = markers.length ? 'Before the first locator' : 'No locators yet'
  for (const marker of markers) {
    if (marker.beat > beat + 1e-6) break
    const label = String(marker.name).split('|')[0].trim()
    section = label === '' || label === '-' ? 'Band cleared' : label
  }
  if (section !== shownSection) {
    shownSection = section
    Max.outlet('section', section)
  }
  const playing = Boolean(lastTransport && lastTransport.playing)
  if (playing !== shownPlaying) {
    shownPlaying = playing
    Max.outlet('playstate', playing ? 'PLAYING' : 'STOPPED')
  }
}

function send(type, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  seq += 1
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, seq, sentAt: Date.now(), payload }))
}

function connect() {
  clearTimeout(retryTimer)
  retryTimer = null

  const url = engineUrl(settings.host)
  status('Connecting…')

  let ws
  try {
    ws = new WebSocket(url)
  } catch (error) {
    status('That address does not look right', 'error')
    Max.post(`StageCue: ${error.message}`)
    scheduleRetry()
    return
  }
  socket = ws
  connectingSince = Date.now()

  ws.onopen = () => {
    if (socket !== ws) return
    seq = 0
    retryMs = RETRY_MIN_MS
    send('hello', { clientId: settings.clientId, role: 'daw_bridge', name: deviceName() })
    // Replay what the engine missed while disconnected.
    if (lastMarkers) send('daw.markers', lastMarkers)
    // Ask the Live side for everything again: it may have sent the markers
    // before this script was running, and they only resend when locators change.
    Max.outlet('refresh')
    if (lastTransport) send('daw.transport', lastTransport)
  }

  ws.onmessage = (event) => {
    let message
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (message.type === 'welcome') {
      status('Connected to StageCue', 'ok')
    } else if (message.type === 'error') {
      Max.post(`StageCue engine rejected a message: ${message.payload?.message}`)
    }
  }

  ws.onclose = (event) => {
    if (socket !== ws) return
    socket = null
    if (event.code === 4000) {
      incompatible = true
      status('Update this device to match StageCue', 'error')
      return
    }
    status('StageCue not found. Retrying…', 'error')
    scheduleRetry()
  }

  ws.onerror = () => {
    // A close event follows; reconnecting happens there.
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(connect, retryMs)
  retryMs = Math.min(RETRY_MAX_MS, retryMs * 2)
}

function reconnect() {
  const old = socket
  socket = null
  if (old) old.close()
  retryMs = RETRY_MIN_MS
  incompatible = false
  connect()
}

/**
 * Belt and braces: whatever went wrong, never sit idle while disconnected. Gives
 * up on attempts that hang (a computer that went to sleep, a dropped Wi-Fi
 * link) and restarts the retry loop if it ever stopped.
 */
function watchdog() {
  if (incompatible || retryTimer) return
  if (socket && socket.readyState === WebSocket.OPEN) {
    // Connected but nothing from Live yet: the Live side may have been reloaded. Nudge it.
    if (!lastMarkers || !lastTransport) Max.outlet('refresh')
    return
  }
  // Connecting, closing, or closed without a retry lined up: give it a moment, then start over.
  if (socket && Date.now() - connectingSince < CONNECT_TIMEOUT_MS) return
  const stuck = socket
  socket = null
  if (stuck) stuck.close()
  status('StageCue not found. Retrying…', 'error')
  connect()
}

Max.addHandler('markers', (json) => {
  let parsed
  try {
    parsed = JSON.parse(String(json))
  } catch {
    return
  }
  lastMarkers = { project: null, markers: parsed.markers }
  send('daw.markers', lastMarkers)
  const count = parsed.markers.length
  Max.outlet('locators', count === 1 ? '1 locator' : `${count} locators`)
  showSong()
})

Max.addHandler('transport', (json) => {
  try {
    lastTransport = JSON.parse(String(json))
  } catch {
    return
  }
  send('daw.transport', lastTransport)
  showSong()
})

// From the address field. [textedit] may prefix its output with "text".
Max.addHandler('host', (...words) => {
  const parts = words.map(String)
  if (parts[0] === 'text') parts.shift()
  const host = parts.join('').trim()
  if (!host || host === settings.host) return
  settings.host = host
  saveSettings(settings)
  Max.outlet('host', host)
  reconnect()
})

if (typeof WebSocket === 'undefined') {
  status('Needs Live 12 or newer', 'error')
} else {
  Max.outlet('host', settings.host)
  Max.outlet('locators', '0 locators')
  showSong()
  Max.outlet('refresh')
  connect()
  setInterval(watchdog, WATCHDOG_MS)
}
