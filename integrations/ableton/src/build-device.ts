import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/*
 * Builds device/StageCue.amxd, a Max for Live audio effect that passes audio
 * through untouched and runs the two StageCue scripts beside it.
 *
 * An .amxd is a small binary header followed by the Max patcher JSON:
 *   "ampf" u32le(4) <type>  "meta" u32le(4) u32le(0)  "ptch" u32le(length) <json>\0
 * where <type> is "aaaa" for an audio effect. This matches the
 * "Max Audio Effect.amxd" template that ships with Live 12 Suite.
 *
 * Run with `pnpm --filter @stagecue/ableton build:device`.
 */

type Box = Record<string, unknown> & { id: string }

const boxes: Box[] = []
const lines: Array<[string, number, string, number]> = []

function box(id: string, fields: Record<string, unknown>): string {
  boxes.push({ id, fontname: 'Arial Bold', fontsize: 10, ...fields })
  return id
}

function newobj(id: string, text: string, rect: number[], ins: number, outs: string[]) {
  return box(id, {
    maxclass: 'newobj',
    text,
    numinlets: ins,
    numoutlets: outs.length,
    outlettype: outs,
    patching_rect: rect,
  })
}

function connect(from: string, outlet: number, to: string, inlet: number) {
  lines.push([from, outlet, to, inlet])
}

// Audio passes straight through, so the device can sit on any track, master included.
const plugin = newobj('obj-plugin', 'plugin~', [400, 20, 53, 20], 2, ['signal', 'signal'])
const plugout = newobj('obj-plugout', 'plugout~', [400, 120, 53, 20], 2, ['signal', 'signal'])
connect(plugin, 0, plugout, 0)
connect(plugin, 1, plugout, 1)

// Live Object Model → bridge.
const device = newobj('obj-device', 'live.thisdevice', [20, 20, 85, 20], 1, ['bang', 'int', 'int'])
const lom = newobj('obj-lom', 'js stagecue-lom.js', [20, 60, 110, 20], 1, [''])
const bridge = newobj(
  'obj-bridge',
  'node.script stagecue-bridge.js @autostart 1 @watch 1',
  [20, 140, 290, 20],
  1,
  ['', ''],
)
connect(device, 0, lom, 0)
connect(lom, 0, bridge, 0)

// Manual restart, for the editor.
const restart = box('obj-restart', {
  maxclass: 'message',
  text: 'script restart',
  numinlets: 2,
  numoutlets: 1,
  outlettype: [''],
  patching_rect: [160, 100, 80, 20],
})
connect(restart, 0, bridge, 0)

// Bridge → display.
const route = newobj('obj-route', 'route status host', [20, 180, 100, 20], 1, ['', '', ''])
const setStatus = newobj('obj-set-status', 'prepend set', [20, 220, 70, 20], 1, [''])
const setHost = newobj('obj-set-host', 'prepend set', [180, 220, 70, 20], 1, [''])
connect(bridge, 0, route, 0)
connect(route, 0, setStatus, 0)
connect(route, 1, setHost, 0)

// Presentation: what you see on the device in Live.
box('obj-title', {
  maxclass: 'comment',
  text: 'StageCue',
  fontsize: 14,
  numinlets: 1,
  numoutlets: 0,
  patching_rect: [20, 300, 120, 22],
  presentation: 1,
  presentation_rect: [8, 6, 120, 22],
})
box('obj-label', {
  maxclass: 'comment',
  text: 'Engine address (type it, then press Return)',
  numinlets: 1,
  numoutlets: 0,
  patching_rect: [20, 330, 240, 18],
  presentation: 1,
  presentation_rect: [8, 34, 260, 18],
})
const hostField = box('obj-host', {
  maxclass: 'textedit',
  text: '',
  keymode: 1,
  lines: 1,
  numinlets: 1,
  numoutlets: 4,
  outlettype: ['', 'int', '', ''],
  parameter_enable: 0,
  patching_rect: [180, 260, 200, 22],
  presentation: 1,
  presentation_rect: [8, 54, 220, 22],
})
const statusText = box('obj-status', {
  maxclass: 'comment',
  text: 'Starting…',
  linecount: 2,
  numinlets: 1,
  numoutlets: 0,
  patching_rect: [20, 260, 150, 30],
  presentation: 1,
  presentation_linecount: 2,
  presentation_rect: [8, 86, 260, 32],
})
const prependHost = newobj('obj-prepend-host', 'prepend host', [180, 300, 75, 20], 1, [''])
connect(setStatus, 0, statusText, 0)
connect(setHost, 0, hostField, 0)
connect(hostField, 0, prependHost, 0)
connect(prependHost, 0, bridge, 0)

const patcher = {
  patcher: {
    fileversion: 1,
    appversion: { major: 9, minor: 1, revision: 0, architecture: 'x64', modernui: 1 },
    classnamespace: 'box',
    rect: [100, 100, 520, 380],
    openrect: [0, 0, 280, 169],
    bglocked: 0,
    openinpresentation: 1,
    default_fontsize: 10,
    default_fontface: 0,
    default_fontname: 'Arial Bold',
    gridonopen: 1,
    gridsize: [8, 8],
    gridsnaponopen: 1,
    objectsnaponopen: 1,
    statusbarvisible: 2,
    toolbarvisible: 1,
    devicewidth: 280,
    description: 'Sends Ableton locators and the playhead to StageCue.',
    digest: '',
    tags: '',
    style: '',
    subpatcher_template: '',
    boxes: boxes.map((b) => ({ box: b })),
    lines: lines.map(([from, outlet, to, inlet]) => ({
      patchline: { source: [from, outlet], destination: [to, inlet] },
    })),
    dependency_cache: [],
    latency: 0,
    project: {
      version: 1,
      creationdate: 3590052493,
      modificationdate: 3590052493,
      viewrect: [0, 0, 300, 500],
      autoorganize: 1,
      hideprojectwindow: 1,
      showdependencies: 1,
      autolocalize: 0,
      contents: { patchers: {} },
      layout: {},
      searchpath: {},
      detailsvisible: 0,
      amxdtype: 1633771873, // "aaaa": audio effect
      readonly: 0,
      devpathtype: 0,
      devpath: '.',
      sortmode: 0,
      viewmode: 0,
    },
    autosave: 0,
  },
}

export function buildAmxd(): Buffer {
  const json = Buffer.from(`${JSON.stringify(patcher, null, '\t')}\n\0`, 'utf8')
  const u32 = (n: number) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n)
    return b
  }
  return Buffer.concat([
    Buffer.from('ampf'),
    u32(4),
    Buffer.from('aaaa'),
    Buffer.from('meta'),
    u32(4),
    u32(0),
    Buffer.from('ptch'),
    u32(json.length),
    json,
  ])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('../device/StageCue.amxd', import.meta.url))
  writeFileSync(out, buildAmxd())
  console.log(`Wrote ${out}`)
}
