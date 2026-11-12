import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/*
 * Lists what is inside an .amxd: its chunks and, for a frozen device, every embedded
 * file. Used to check that a frozen StageCue.amxd carries both scripts and
 * package.json, so it works as one file.
 *
 * Layout from Ableton's reader (github.com/Ableton/maxdevtools, maxdiff/amxd_textconv.py
 * and freezing_utils.py):
 *   top level   tag(4) u32le(size) data, repeated: ampf, meta, ptch (and ciph if encrypted)
 *   frozen ptch "mx@c" ... u64be(offset of footer) at bytes 8–16, then the files,
 *               then the footer, all offsets measured from the "mx@c"
 *   footer      "dlst" u32be(size), then "dire" u32be(size) entries
 *   entry       fields tag(4) u32be(size incl. 8-byte header) data:
 *               type, fnam (NUL padded), sz32, of32, vers, flag (u32be), mdat (HFS+ seconds)
 *
 * Run with `pnpm --filter @stagecue/ableton inspect:device [file]`.
 */

export interface EmbeddedFile {
  name: string
  type: string
  offset: number
  size: number
  flag: number | null
  vers: number | null
  modified: Date | null
  data: Buffer
}

export interface AmxdContents {
  deviceType: string
  meta: Buffer | null
  frozen: boolean
  encrypted: boolean
  /** The main patcher JSON (unfrozen), or the first embedded file (frozen). */
  patcher: unknown
  files: EmbeddedFile[]
  /** Frozen only: the 16-byte container header, for comparing with what Max writes. */
  containerHeader: Buffer | null
}

const HFS_TO_UNIX_SECONDS = 2_082_844_800

export function readAmxd(file: Buffer): AmxdContents {
  const result: AmxdContents = {
    deviceType: '',
    meta: null,
    frozen: false,
    encrypted: false,
    patcher: null,
    files: [],
    containerHeader: null,
  }
  let at = 0
  while (at + 8 <= file.length) {
    const tag = file.toString('latin1', at, at + 4)
    const size = file.readUInt32LE(at + 4)
    const data = file.subarray(at + 8, at + 8 + size)
    at += 8 + size
    if (tag === 'ampf') result.deviceType = data.toString('latin1')
    else if (tag === 'meta') result.meta = Buffer.from(data)
    else if (tag === 'ciph') result.encrypted = true
    else if (tag === 'ptch' && !result.encrypted) readPatch(data, result)
    else if (tag !== 'ptch') throw new Error(`Unknown chunk "${tag}" at byte ${at - 8 - size}`)
  }
  return result
}

function readPatch(data: Buffer, result: AmxdContents): void {
  if (data.toString('latin1', 0, 4) !== 'mx@c') {
    result.patcher = parseJson(data)
    return
  }
  result.frozen = true
  result.containerHeader = Buffer.from(data.subarray(0, 16))
  const footerAt = Number(data.readBigUInt64BE(8))
  const footer = data.subarray(footerAt)
  if (footer.toString('latin1', 0, 4) !== 'dlst') throw new Error('Frozen footer not found')
  let at = 8
  while (footer.toString('latin1', at, at + 4) === 'dire') {
    const size = footer.readUInt32BE(at + 4)
    const fields = readFields(footer.subarray(at + 8, at + size))
    const offset = (fields.of32 as number | undefined) ?? 0
    const length = (fields.sz32 as number | undefined) ?? 0
    result.files.push({
      name: (fields.fnam as string | undefined) ?? '',
      type: (fields.type as string | undefined) ?? '',
      offset,
      size: length,
      flag: (fields.flag as number | undefined) ?? null,
      vers: (fields.vers as number | undefined) ?? null,
      modified:
        typeof fields.mdat === 'number'
          ? new Date((fields.mdat - HFS_TO_UNIX_SECONDS) * 1000)
          : null,
      data: Buffer.from(data.subarray(offset, offset + length)),
    })
    at += size
  }
  const main = result.files[0]
  if (main) result.patcher = parseJson(main.data)
}

function readFields(data: Buffer): Record<string, string | number> {
  const fields: Record<string, string | number> = {}
  let at = 0
  while (at + 8 <= data.length) {
    const tag = data.toString('latin1', at, at + 4)
    const size = data.readUInt32BE(at + 4)
    const value = data.subarray(at + 8, at + size)
    fields[tag] =
      tag === 'type' || tag === 'fnam'
        ? value.toString('latin1').replace(/\0+$/, '')
        : value.length === 4
          ? value.readUInt32BE(0)
          : value.length === 8
            ? Number(value.readBigUInt64BE(0))
            : value.toString('hex')
    if (size < 8) break
    at += size
  }
  return fields
}

/** Max has written patchers with a trailing NUL or trailing garbage: cut at the last brace. */
function parseJson(data: Buffer): unknown {
  const text = data.toString('utf8')
  const end = text.lastIndexOf('}')
  try {
    return JSON.parse(text.slice(0, end + 1))
  } catch {
    return null
  }
}

/** The scripts a patcher's objects load by name, e.g. `js stagecue-lom.js`. */
export function scriptsUsed(patcher: unknown): string[] {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const text = record.text
      if (typeof text === 'string') {
        const match = /^(?:js|node\.script|v8)\s+(\S+\.(?:js|cjs|mjs))/.exec(text)
        if (match?.[1]) found.add(match[1])
      }
      Object.values(record).forEach(walk)
    }
  }
  walk(patcher)
  return [...found]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? fileURLToPath(new URL('../device/StageCue.amxd', import.meta.url))
  const contents = readAmxd(readFileSync(path))
  console.log(path)
  console.log(`  device type  ${contents.deviceType}`)
  console.log(`  meta         ${contents.meta?.toString('hex') ?? '(none)'}`)
  console.log(`  frozen       ${contents.frozen ? 'yes' : 'no'}`)
  if (contents.encrypted) console.log('  encrypted    yes')
  if (contents.containerHeader) {
    console.log(`  mx@c header  ${contents.containerHeader.toString('hex')}`)
  }
  for (const file of contents.files) {
    const extra = [
      `type ${file.type}`,
      `flag ${file.flag ?? '-'}`,
      `vers ${file.vers ?? '-'}`,
      `at ${file.offset}`,
    ].join(', ')
    console.log(`  embedded     ${file.name}  ${file.size} bytes  (${extra})`)
  }
  const scripts = scriptsUsed(contents.patcher)
  const embedded = new Set(contents.files.map((file) => file.name))
  for (const script of scripts) {
    const state = !contents.frozen
      ? 'loaded from the folder'
      : embedded.has(script)
        ? 'embedded'
        : 'MISSING'
    console.log(`  script       ${script}: ${state}`)
  }
  if (contents.frozen) {
    // package.json only matters inside this repo (the root says "type": "module"); reported, not required.
    console.log(`  package.json ${embedded.has('package.json') ? 'embedded' : 'not embedded'}`)
    const ok = scripts.length > 0 && scripts.every((script) => embedded.has(script))
    console.log(ok ? '  One file: yes' : '  One file: no, a script is missing (see above)')
    if (!ok) process.exitCode = 1
  }
}
