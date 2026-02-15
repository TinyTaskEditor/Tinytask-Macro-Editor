import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

import { cloneAsEncodable, encodeRec, parseRec } from './recParser'

function loadFixture(): ArrayBuffer {
  const url = new URL('../../fixtures/anivers-farm.rec', import.meta.url)
  const buffer = readFileSync(url)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

describe('recParser', () => {
  test('parses TinyTask .rec recordings into events', () => {
    const data = loadFixture()
    const parsed = parseRec(data)

    expect(parsed.events.length).toBeGreaterThan(0)
    expect(parsed.baseTime).toBeGreaterThan(0)
    expect(parsed.hwnds).toHaveLength(1)

    const [first, second] = parsed.events

    expect(first).toMatchObject({
      message: 0x200,
      delay: 0,
      time: 0,
    })

    expect(second.delay).toBeGreaterThan(0)
    expect(second.time).toBe(first.time + second.delay)
  })

  test('re-encodes parsed events to the original binary', () => {
    const data = loadFixture()
    const parsed = parseRec(data)

    const cloned = cloneAsEncodable(parsed.events)
    const rebuilt = encodeRec(cloned, { baseTime: parsed.baseTime })

    expect(Buffer.from(rebuilt)).toEqual(Buffer.from(data))
  })
})

