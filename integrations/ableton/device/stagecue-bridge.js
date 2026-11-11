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

// Settings survive Live restarts and are shared by every StageCue device on this computer.
const SETTINGS_FILE = path.join(os.homedir(), '.stagecue', 'ableton-device.json')
const settings = loadSettings()

let socket = null
let seq = 0
let retryMs = RETRY_MIN_MS
let retryTimer = null
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

function status(text) {
  Max.outlet('status', text)
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
  status(`Connecting to ${settings.host}…`)

  let ws
  try {
    ws = new WebSocket(url)
  } catch (error) {
    status(`Bad address: ${settings.host}`)
    Max.post(`StageCue: ${error.message}`)
    return
  }
  socket = ws

  ws.onopen = () => {
    if (socket !== ws) return
    seq = 0
    retryMs = RETRY_MIN_MS
    send('hello', { clientId: settings.clientId, role: 'daw_bridge', name: deviceName() })
    // Replay what the engine missed while disconnected.
    if (lastMarkers) send('daw.markers', lastMarkers)
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
      status(`Connected to ${settings.host}`)
    } else if (message.type === 'error') {
      Max.post(`StageCue engine rejected a message: ${message.payload?.message}`)
    }
  }

  ws.onclose = (event) => {
    if (socket !== ws) return
    socket = null
    if (event.code === 4000) {
      status('Engine uses a different protocol version. Update the device.')
      return
    }
    status(`Not connected to ${settings.host}. Retrying…`)
    retryTimer = setTimeout(connect, retryMs)
    retryMs = Math.min(RETRY_MAX_MS, retryMs * 2)
  }

  ws.onerror = () => {
    // A close event follows; reconnecting happens there.
  }
}

function reconnect() {
  const old = socket
  socket = null
  if (old) old.close()
  retryMs = RETRY_MIN_MS
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
})

Max.addHandler('transport', (json) => {
  try {
    lastTransport = JSON.parse(String(json))
  } catch {
    return
  }
  send('daw.transport', lastTransport)
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
  status('This Max has no built-in WebSocket. Use Max 9 (Live 12) or newer.')
} else {
  Max.outlet('host', settings.host)
  connect()
}
