/*
 * StageCue: reads Ableton's locators and transport through the Live Object Model
 * and hands them to stagecue-bridge.js (Node for Max), which talks to the engine.
 *
 * Runs in Max's classic [js] object, so this file is ES5: no let/const, no arrow
 * functions. Network I/O is not possible here; that is why the bridge exists.
 *
 * Outlet 0 sends:
 *   markers <json>    { markers: [{ name, beat }] }, on load and whenever locators change
 *   transport <json>  { playing, beat, tempo, timeSignature }, on any change and every
 *                     100 ms while playing (the rate the protocol asks for)
 */

autowatch = 1
inlets = 1
outlets = 1

var POLL_MS = 100

var song = null
var poll = null
var propertyObservers = []
var cueObservers = []
var cueListDirty = false
var markersDirty = false

var transport = {
  playing: false,
  beat: 0,
  tempo: 120,
  numerator: 4,
  denominator: 4,
  looping: false,
  loopStart: 0,
  loopLength: 0,
}

/** [live.thisdevice] bangs once the device is fully loaded; the LOM is not usable before. */
function bang() {
  start()
}

function start() {
  stop()
  song = new LiveAPI(null, 'live_set')
  if (!song || Number(song.id) === 0) {
    post('StageCue: live_set is not available yet\n')
    return
  }

  observe('is_playing', function (value) {
    transport.playing = Number(value[0]) === 1
    sendTransport()
  })
  observe('tempo', function (value) {
    transport.tempo = Number(value[0])
    sendTransport()
  })
  observe('signature_numerator', function (value) {
    transport.numerator = Number(value[0])
    sendTransport()
  })
  observe('signature_denominator', function (value) {
    transport.denominator = Number(value[0])
    sendTransport()
  })
  // The loop switch and region, so displays wrap at the loop end instead of
  // running on into the next section between reports.
  observe('loop', function (value) {
    transport.looping = Number(value[0]) === 1
    sendTransport()
  })
  observe('loop_start', function (value) {
    transport.loopStart = Number(value[0])
    sendTransport()
  })
  observe('loop_length', function (value) {
    transport.loopLength = Number(value[0])
    sendTransport()
  })
  // Fires when locators are added or deleted. Rebuilding happens in tick(), because
  // creating LiveAPI objects inside a notification is not reliable.
  observe('cue_points', function () {
    cueListDirty = true
  })

  cueListDirty = true
  poll = new Task(tick, this)
  poll.interval = POLL_MS
  poll.repeat()
}

function stop() {
  if (poll) {
    poll.cancel()
    poll = null
  }
  forget(propertyObservers)
  forget(cueObservers)
  propertyObservers = []
  cueObservers = []
}

/** Live calls this when the device is deleted. */
function notifydeleted() {
  stop()
}

function observe(property, onChange) {
  var api = new LiveAPI(function (args) {
    if (!args || args[0] !== property) return
    onChange(Array.prototype.slice.call(args, 1))
  }, 'live_set')
  api.property = property
  propertyObservers.push(api)
}

function forget(observers) {
  for (var i = 0; i < observers.length; i++) {
    observers[i].property = ''
  }
}

function tick() {
  if (!song) return

  if (cueListDirty) {
    cueListDirty = false
    rebuildCueObservers()
    markersDirty = true
  }
  if (markersDirty) {
    markersDirty = false
    sendMarkers()
  }

  var beat = readSongTime()
  if (transport.playing) {
    transport.beat = beat
    sendTransport()
  } else if (Math.abs(beat - transport.beat) > 0.0001) {
    // Stopped, but the playhead was moved: a click on the timeline, or "back to start".
    transport.beat = beat
    sendTransport()
  }
}

/** One LiveAPI per locator, watching its name and its position. */
function rebuildCueObservers() {
  forget(cueObservers)
  cueObservers = []

  var ids = idsFrom(song.get('cue_points'))
  for (var i = 0; i < ids.length; i++) {
    cueObservers.push(watchCue(ids[i], 'name'))
    cueObservers.push(watchCue(ids[i], 'time'))
  }
}

function watchCue(id, property) {
  var api = new LiveAPI(function (args) {
    if (args && args[0] === property) markersDirty = true
  }, 'id ' + id)
  api.property = property
  return api
}

function sendMarkers() {
  var markers = []
  // Every locator has two observers (name, time); read from the "name" ones.
  for (var i = 0; i < cueObservers.length; i += 2) {
    var cue = cueObservers[i]
    var beat = Number(cue.get('time')[0])
    if (!isFinite(beat) || beat < 0) continue
    markers.push({ name: String(cue.get('name').join(' ')).slice(0, 200), beat: beat })
  }
  markers.sort(function (a, b) {
    return a.beat - b.beat
  })
  outlet(0, 'markers', JSON.stringify({ markers: markers }))
}

function sendTransport() {
  if (!song) return
  transport.beat = readSongTime()
  var payload = {
    playing: transport.playing,
    beat: transport.beat,
    tempo: clamp(transport.tempo, 10, 999),
    timeSignature: {
      numerator: clamp(transport.numerator, 1, 32),
      denominator: transport.denominator,
    },
    loop:
      transport.looping && transport.loopLength > 0
        ? { start: transport.loopStart, end: transport.loopStart + transport.loopLength }
        : null,
  }
  outlet(0, 'transport', JSON.stringify(payload))
}

function readSongTime() {
  var beat = Number(song.get('current_song_time')[0])
  return isFinite(beat) && beat > 0 ? beat : 0
}

/** LiveAPI returns lists of ids as ["id", 3, "id", 7]. */
function idsFrom(list) {
  var ids = []
  for (var i = 0; i + 1 < list.length; i += 2) {
    if (list[i] === 'id' && Number(list[i + 1]) !== 0) ids.push(list[i + 1])
  }
  return ids
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
