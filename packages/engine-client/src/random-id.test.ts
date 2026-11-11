import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomId } from './random-id.ts'

/** The shape the engine's z.uuid() accepts, for a version 4 UUID. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('makes UUIDs the engine accepts', () => {
    expect(randomId()).toMatch(UUID_V4)
  })

  it('still works on a plain http page, where crypto.randomUUID is missing', () => {
    // What Safari and TV browsers give a page opened at http://<engine address>.
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const ids = new Set(Array.from({ length: 50 }, () => randomId()))
    expect(ids.size).toBe(50)
    for (const id of ids) {
      expect(id).toMatch(UUID_V4)
    }
  })
})
