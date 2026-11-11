import { createRequire } from 'node:module'
import type { Sender } from '@stagetimerio/grandiose'

/*
 * Sends the output frames as an NDI source through @stagetimerio/grandiose, a
 * native module built against the NDI SDK at install time. The module is loaded
 * at runtime inside try, so a computer where it did not build reports NDI as
 * unavailable instead of crashing the app.
 *
 * A new frame goes out the moment Chromium paints it, so nothing waits for a
 * timer tick. The off-screen window only paints when something changes, but
 * receivers expect a continuous stream, so a timer resends the latest frame
 * whenever no new one has gone out for a frame's time.
 */

export interface Frame {
  width: number
  height: number
  /** Pixels in BGRA order, 4 bytes each, rows top to bottom, alpha premultiplied (Chromium's format). */
  bgra: Buffer
}

export interface FrameSender {
  /** Sends the frame now (or as soon as the previous one has gone). */
  send(frame: Frame): void
  setFrameRate(frameRate: number): void
  receivers(): number
  close(): Promise<void>
}

export type SenderResult = { ok: true; sender: FrameSender } | { ok: false; reason: string }

// The module's typings leave out these runtime exports.
type Grandiose = typeof import('@stagetimerio/grandiose') & {
  version(): string
  isSupportedCPU(): boolean
  FOURCC_BGRA: number
  FORMAT_TYPE_PROGRESSIVE: number
}

function loadGrandiose(): Grandiose | string {
  try {
    const grandiose = createRequire(import.meta.url)('@stagetimerio/grandiose') as Grandiose
    if (!grandiose.isSupportedCPU()) return 'This computer’s processor is not supported by NDI.'
    return grandiose
  } catch (error) {
    console.error('[ndi] Could not load the NDI module:', error)
    return 'The NDI module is not installed on this computer. Run pnpm install with the build tools present.'
  }
}

/**
 * Chromium paints with premultiplied alpha; NDI's BGRA is straight alpha. Most
 * pixels are fully transparent or fully opaque and need no change, so only the
 * soft edges (anti-aliased text, the fading pulse) are divided back out.
 */
export function unpremultiply(bgra: Buffer): Buffer {
  // Read whole pixels at once: alpha is the top byte of each little-endian word,
  // so the transparent and opaque pixels (nearly all of them) cost one compare.
  const pixels =
    bgra.byteOffset % 4 === 0
      ? new Uint32Array(bgra.buffer, bgra.byteOffset, bgra.length >>> 2)
      : new Uint32Array(Uint8Array.from(bgra).buffer) // Unaligned: read alpha from a copy.
  for (let p = 0; p < pixels.length; p++) {
    const alpha = pixels[p]! >>> 24
    if (alpha === 0 || alpha === 255) continue
    const i = p << 2
    const scale = 255 / alpha
    bgra[i] = Math.min(255, Math.round(bgra[i]! * scale))
    bgra[i + 1] = Math.min(255, Math.round(bgra[i + 1]! * scale))
    bgra[i + 2] = Math.min(255, Math.round(bgra[i + 2]! * scale))
  }
  return bgra
}

export async function createNdiSender(name: string, frameRate: number): Promise<SenderResult> {
  const grandiose = loadGrandiose()
  if (typeof grandiose === 'string') return { ok: false, reason: grandiose }

  let sender: Sender
  try {
    // clockVideo off: this module paces frames itself, so a send never blocks the main process.
    sender = await grandiose.send({ name, clockVideo: false })
  } catch (error) {
    console.error('[ndi] Could not create the NDI sender:', error)
    return { ok: false, reason: 'NDI could not start a source on this computer.' }
  }

  let latest: Frame | null = null
  /** Whether latest has had its alpha converted. Only frames that go out are converted. */
  let converted = false
  let sending = false
  let pending = false
  let lastSentAt = 0
  let rate = frameRate

  // STAGECUE_OUTPUT_STATS=1 logs how many frames NDI accepted and how long each send took.
  const stats = process.env.STAGECUE_OUTPUT_STATS ? { sent: 0, sendMs: 0 } : null
  const statsTimer = stats
    ? setInterval(() => {
        console.log(
          `[ndi] ${(stats.sent / 5).toFixed(1)} frames/s sent, ${(stats.sendMs / Math.max(stats.sent, 1)).toFixed(1)} ms per send`,
        )
        stats.sent = 0
        stats.sendMs = 0
      }, 5_000)
    : null
  statsTimer?.unref()

  const pump = () => {
    // Never queue frames: if a send is still in flight, send the newest one when it ends.
    if (!latest) return
    if (sending) {
      pending = true
      return
    }
    const frame = latest
    if (!converted) {
      unpremultiply(frame.bgra)
      converted = true
    }
    sending = true
    pending = false
    lastSentAt = performance.now()
    const startedAt = lastSentAt
    sender
      .video({
        xres: frame.width,
        yres: frame.height,
        frameRateN: rate,
        frameRateD: 1,
        fourCC: grandiose.FOURCC_BGRA,
        pictureAspectRatio: frame.width / frame.height,
        frameFormatType: grandiose.FORMAT_TYPE_PROGRESSIVE,
        lineStrideBytes: frame.width * 4,
        data: frame.bgra,
      })
      .catch((error: unknown) => console.error('[ndi] Sending a frame failed:', error))
      .finally(() => {
        if (stats) {
          stats.sent += 1
          stats.sendMs += performance.now() - startedAt
        }
        sending = false
        if (pending) pump()
      })
  }

  // Keeps the stream steady while nothing changes on screen.
  let timer = setInterval(keepAlive, 1000 / rate)
  function keepAlive() {
    if (performance.now() - lastSentAt >= 1000 / rate - 2) pump()
  }

  return {
    ok: true,
    sender: {
      send(frame) {
        // Converted when it goes out: frames replaced before then cost nothing.
        latest = frame
        converted = false
        pump()
      },
      setFrameRate(next) {
        if (next === rate) return
        rate = next
        clearInterval(timer)
        timer = setInterval(keepAlive, 1000 / rate)
      },
      receivers: () => sender.connections(),
      async close() {
        clearInterval(timer)
        if (statsTimer) clearInterval(statsTimer)
        latest = null
        await sender.destroy()
      },
    },
  }
}
