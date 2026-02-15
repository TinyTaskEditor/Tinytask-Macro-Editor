const RECORD_BYTE_LENGTH = 20
const UINT32_SIZE = 4
const UINT32_MAX = 0x1_0000_0000

export interface TinyTaskEvent {
  /** Windows message identifier (e.g., WM_MOUSEMOVE = 0x0200). */
  message: number
  /** Low-order parameter. For mouse events this stores modifier/button state. */
  paramL: number
  /** High-order parameter. Typically encodes coordinates or key scan code. */
  paramH: number
  /** Timestamp in milliseconds since system start, normalised to begin at 0. */
  time: number
  /** Delay in milliseconds from the previous event (0 for the first event). */
  delay: number
  /** Window handle that received the original input. */
  hwnd: number
}

export interface ParseResult {
  events: TinyTaskEvent[]
  /** Raw timestamp of the first event as stored in the .rec file. */
  baseTime: number
  /** Unique window handles referenced by the recording (most files only use one). */
  hwnds: number[]
  /** Total duration in milliseconds based on the final event timestamp. */
  duration: number
}

export interface EncodeOptions {
  /**
   * Raw timestamp to seed the encoded file with. Defaults to the first event's delay.
   * Use the `baseTime` from {@link ParseResult} to preserve the original value.
   */
  baseTime?: number
}

export interface EncodableEvent {
  message: number
  paramL: number
  paramH: number
  delay: number
  hwnd: number
}

/** Normalises an ArrayBuffer-like value into an ArrayBuffer. */
function ensureArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input
  }

  const { buffer, byteOffset, byteLength } = input
  const view = new Uint8Array(buffer, byteOffset, byteLength)
  const clone = new Uint8Array(byteLength)
  clone.set(view)
  return clone.buffer
}

function diffUint32(current: number, previous: number): number {
  return (current - previous + UINT32_MAX) % UINT32_MAX
}

export function parseRec(
  source: ArrayBuffer | ArrayBufferView,
): ParseResult {
  const buffer = ensureArrayBuffer(source)

  if (buffer.byteLength === 0) {
    return { events: [], baseTime: 0, hwnds: [], duration: 0 }
  }

  if (buffer.byteLength % RECORD_BYTE_LENGTH !== 0) {
    throw new Error(
      `Unexpected .rec size: ${buffer.byteLength} bytes is not a multiple of ${RECORD_BYTE_LENGTH}.`,
    )
  }

  const view = new DataView(buffer)
  const events: TinyTaskEvent[] = []
  const hwndSet = new Set<number>()

  let previousAbsoluteTime = 0
  let baseTime = 0

  const recordCount = buffer.byteLength / RECORD_BYTE_LENGTH

  for (let index = 0; index < recordCount; index += 1) {
    const offset = index * RECORD_BYTE_LENGTH

    const message = view.getUint32(offset, true)
    const paramL = view.getUint32(offset + UINT32_SIZE, true)
    const paramH = view.getUint32(offset + UINT32_SIZE * 2, true)
    const absoluteTime = view.getUint32(offset + UINT32_SIZE * 3, true)
    const hwnd = view.getUint32(offset + UINT32_SIZE * 4, true)

    if (index === 0) {
      baseTime = absoluteTime
      previousAbsoluteTime = absoluteTime
      events.push({
        message,
        paramL,
        paramH,
        time: 0,
        delay: 0,
        hwnd,
      })
      hwndSet.add(hwnd)
      continue
    }

    const elapsed = diffUint32(absoluteTime, previousAbsoluteTime)
    previousAbsoluteTime = absoluteTime

    const previousEvent = events[events.length - 1]
    const time = previousEvent.time + elapsed

    events.push({
      message,
      paramL,
      paramH,
      time,
      delay: elapsed,
      hwnd,
    })

    hwndSet.add(hwnd)
  }

  const duration = events.length ? events[events.length - 1].time : 0

  return {
    events,
    baseTime,
    hwnds: [...hwndSet],
    duration,
  }
}

function toUint32(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  const normalised = Math.trunc(value)

  return ((normalised % UINT32_MAX) + UINT32_MAX) % UINT32_MAX
}

export function encodeRec(
  events: EncodableEvent[],
  options: EncodeOptions = {},
): ArrayBuffer {
  if (!Array.isArray(events) || events.length === 0) {
    return new ArrayBuffer(0)
  }

  const buffer = new ArrayBuffer(events.length * RECORD_BYTE_LENGTH)
  const view = new DataView(buffer)

  const baseTime = toUint32(options.baseTime ?? 0)
  let absoluteTime = baseTime

  events.forEach((event, index) => {
    if (index === 0) {
      absoluteTime = baseTime
    } else {
      const increment = Math.max(0, toUint32(event.delay))
      absoluteTime = (absoluteTime + increment) % UINT32_MAX
    }

    const offset = index * RECORD_BYTE_LENGTH

    view.setUint32(offset, toUint32(event.message), true)
    view.setUint32(offset + UINT32_SIZE, toUint32(event.paramL), true)
    view.setUint32(offset + UINT32_SIZE * 2, toUint32(event.paramH), true)
    view.setUint32(offset + UINT32_SIZE * 3, absoluteTime, true)
    view.setUint32(offset + UINT32_SIZE * 4, toUint32(event.hwnd), true)
  })

  return buffer
}

export function cloneAsEncodable(events: TinyTaskEvent[]): EncodableEvent[] {
  return events.map(({ message, paramL, paramH, delay, hwnd }) => ({
    message,
    paramL,
    paramH,
    delay,
    hwnd,
  }))
}

