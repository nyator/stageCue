import { describe, expect, it } from 'vitest'
import { unpremultiply } from './ndi'

describe('unpremultiply', () => {
  it('turns Chromium premultiplied BGRA into the straight alpha NDI expects', () => {
    const pixels = Buffer.from([
      // Half-transparent: colour channels are divided back out.
      64, 32, 16, 128,
      // Fully transparent and fully opaque pixels are left alone.
      0, 0, 0, 0, 10, 20, 30, 255,
      // Rounding never goes past 255.
      200, 200, 200, 199,
    ])
    expect([...unpremultiply(pixels)]).toEqual([
      128, 64, 32, 128, 0, 0, 0, 0, 10, 20, 30, 255, 255, 255, 255, 199,
    ])
  })
})
