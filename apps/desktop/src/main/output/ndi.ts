/*
 * NDI is not wired in yet. Sending needs the NDI SDK through a native module
 * (@stagetimerio/grandiose), which must be compiled on this computer with the
 * Visual Studio C++ build tools. Until that is installed and tested, this
 * reports NDI as unavailable rather than pretending to send.
 */

export interface Frame {
  width: number
  height: number
  /** Pixels in BGRA order, 4 bytes each, rows top to bottom. */
  bgra: Buffer
}

export interface FrameSender {
  send(frame: Frame): void
  receivers(): number
  close(): Promise<void>
}

export type SenderResult = { ok: true; sender: FrameSender } | { ok: false; reason: string }

export async function createNdiSender(): Promise<SenderResult> {
  return {
    ok: false,
    reason: 'NDI output is not set up on this computer yet. The live preview still works.',
  }
}
