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
const route = newobj(
  'obj-route',
  'route status host refresh light section playstate locators',
  [20, 180, 330, 20],
  1,
  ['', '', '', '', '', '', '', ''],
)
connect(bridge, 0, route, 0)

// The bridge asks the Live side to resend everything when it starts or reconnects.
const refresh = box('obj-refresh', {
  maxclass: 'message',
  text: 'refresh',
  numinlets: 2,
  numoutlets: 1,
  outlettype: [''],
  patching_rect: [260, 60, 50, 20],
})
connect(route, 2, refresh, 0)
connect(refresh, 0, lom, 0)

// ---------------------------------------------------------------------------
// Presentation: what you see on the device in Live. 300 × 169, Live's device height.
// ---------------------------------------------------------------------------

const WIDTH = 300
const PAD = 12
type Rgba = [number, number, number, number]
const hex = (value: string, alpha = 1): Rgba => {
  const n = Number.parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha]
}
const COLOR = {
  panel: hex('#121615'),
  card: hex('#1b201f'),
  line: hex('#2a302e'),
  text: hex('#f2f5f3'),
  muted: hex('#8c9692'),
  faint: hex('#5f6864'),
  accent: hex('#5fd49a'),
}
const FONT = { regular: 'Ableton Sans Medium', bold: 'Ableton Sans Bold' }

let patchY = 300
/** Places a box in the presentation, and stacks it out of the way in the patcher. */
function shown(
  id: string,
  fields: Record<string, unknown>,
  rect: [number, number, number, number],
) {
  const result = box(id, {
    numinlets: 1,
    numoutlets: 0,
    ...fields,
    patching_rect: [420, patchY, rect[2], rect[3]],
    presentation: 1,
    presentation_rect: rect,
  })
  patchY += rect[3] + 6
  return result
}

function text(
  id: string,
  value: string,
  rect: [number, number, number, number],
  style: { size: number; color: Rgba; bold?: boolean; right?: boolean },
) {
  return shown(
    id,
    {
      maxclass: 'comment',
      text: value,
      fontname: style.bold ? FONT.bold : FONT.regular,
      fontsize: style.size,
      textcolor: style.color,
      textjustification: style.right ? 2 : 0,
      ignoreclick: 1,
    },
    rect,
  )
}

function panel(id: string, rect: [number, number, number, number], color: Rgba, rounded: number) {
  return shown(
    id,
    {
      maxclass: 'panel',
      mode: 0,
      bgcolor: color,
      border: 0,
      rounded,
      ignoreclick: 1,
      background: 1,
    },
    rect,
  )
}

// Backgrounds (the background layer sits behind everything else).
panel('obj-bg', [0, 0, WIDTH, 169], COLOR.panel, 0)
panel('obj-card', [PAD, 60, WIDTH - PAD * 2, 50], COLOR.card, 6)

// Title, with the accent mark.
panel('obj-mark', [PAD, 14, 4, 22], COLOR.accent, 2)
text('obj-title', 'StageCue', [PAD + 10, 10, 160, 22], { size: 16, color: COLOR.text, bold: true })
text('obj-subtitle', 'Sends your locators to the screen', [PAD + 10, 30, 220, 16], {
  size: 9.5,
  color: COLOR.muted,
})

// Status light and message, top right.
const light = shown(
  'obj-light',
  {
    maxclass: 'panel',
    mode: 0,
    bgcolor: hex('#f5b842'),
    border: 0,
    rounded: 8,
    ignoreclick: 1,
  },
  [WIDTH - PAD - 8, 17, 8, 8],
)
const statusText = text('obj-status', 'Starting…', [128, 12, WIDTH - PAD - 14 - 128, 18], {
  size: 9.5,
  color: COLOR.muted,
  right: true,
})

// The song, in a card: what Live is playing now, and how many locators it found.
const playState = text('obj-playstate', 'STOPPED', [PAD + 10, 66, 120, 14], {
  size: 8,
  color: COLOR.accent,
  bold: true,
})
const section = text('obj-section', 'No locators yet', [PAD + 10, 80, 176, 24], {
  size: 15,
  color: COLOR.text,
  bold: true,
})
const locators = text('obj-locators', '0 locators', [WIDTH - PAD - 10 - 80, 85, 80, 16], {
  size: 9.5,
  color: COLOR.muted,
  right: true,
})

// Where the StageCue app is. Left empty, the device finds StageCue on the network by itself;
// an address typed here (and Return) overrides that.
text('obj-address-label', 'STAGECUE ADDRESS', [PAD, 119, 140, 14], {
  size: 8,
  color: COLOR.faint,
  bold: true,
})
text('obj-address-hint', 'Empty finds it by itself', [WIDTH - PAD - 150, 119, 150, 14], {
  size: 8,
  color: COLOR.faint,
  right: true,
})
const hostField = shown(
  'obj-host',
  {
    maxclass: 'textedit',
    text: '',
    keymode: 1,
    lines: 1,
    numoutlets: 4,
    outlettype: ['', 'int', '', ''],
    parameter_enable: 0,
    fontname: FONT.regular,
    fontsize: 11,
    bgcolor: COLOR.card,
    textcolor: COLOR.text,
    bordercolor: COLOR.line,
    border: 1,
    rounded: 4,
    tabmode: 0,
  },
  [PAD, 134, WIDTH - PAD * 2, 22],
)

// Wiring for the display.
function setter(id: string, target: string, from: number, prefix = 'set') {
  const node = newobj(id, `prepend ${prefix}`, [20 + from * 60, 220, 70, 20], 1, [''])
  connect(route, from, node, 0)
  connect(node, 0, target, 0)
}
setter('obj-set-status', statusText, 0)
setter('obj-set-host', hostField, 1)
setter('obj-set-light', light, 3, 'bgcolor')
setter('obj-set-section', section, 4)
setter('obj-set-playstate', playState, 5)
setter('obj-set-locators', locators, 6)

const prependHost = newobj('obj-prepend-host', 'prepend host', [180, 300, 75, 20], 1, [''])
connect(hostField, 0, prependHost, 0)
connect(prependHost, 0, bridge, 0)

const patcher = {
  patcher: {
    fileversion: 1,
    appversion: { major: 9, minor: 1, revision: 0, architecture: 'x64', modernui: 1 },
    classnamespace: 'box',
    rect: [100, 100, 520, 380],
    openrect: [0, 0, WIDTH, 169],
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
    devicewidth: WIDTH,
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
