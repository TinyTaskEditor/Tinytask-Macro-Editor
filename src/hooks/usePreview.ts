import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EditorEvent } from './useRecEditor'

const MOUSE_MESSAGES = new Set([0x0200, 0x0201, 0x0202, 0x0204, 0x0205, 0x0207, 0x0208])
const KEY_MESSAGES = new Set([0x0100, 0x0101, 0x0104, 0x0105])

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export interface PreviewPathPoint {
  id: string
  time: number
  x: number
  y: number
  message: number
}

export interface PreviewBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface PreviewKeyEvent {
  id: string
  time: number
  message: number
  code: number
}

export interface PreviewClickEvent {
  id: string
  time: number
  message: number
  x: number
  y: number
}

export interface PreviewState {
  pathPoints: PreviewPathPoint[]
  bounds: PreviewBounds
  keyEvents: PreviewKeyEvent[]
  clickEvents: PreviewClickEvent[]
  isPlaying: boolean
  currentTime: number
  duration: number
  progress: number
  activeEventId?: string
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (time: number) => void
  focusEvent: (id: string) => void
}

export const usePreview = (events: EditorEvent[], duration: number): PreviewState => {
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const rafRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number | null>(null)

  const pathData = useMemo(() => {
    const points: PreviewPathPoint[] = []
    const keys: PreviewKeyEvent[] = []
    const clicks: PreviewClickEvent[] = []

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    events.forEach((event) => {
      if (MOUSE_MESSAGES.has(event.message)) {
        const x = event.paramL
        const y = event.paramH

        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ id: event.id, time: event.time, x, y, message: event.message })
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)

          if (event.message === 0x0201 || event.message === 0x0202) {
            clicks.push({ id: event.id, time: event.time, message: event.message, x, y })
          }
        }
      } else if (KEY_MESSAGES.has(event.message)) {
        keys.push({ id: event.id, time: event.time, message: event.message, code: event.paramL })
      }
    })

    if (!points.length) {
      minX = 0
      maxX = 1
      minY = 0
      maxY = 1
    }

    return {
      points,
      bounds: {
        minX,
        maxX,
        minY,
        maxY,
      },
      keys,
      clicks,
    }
  }, [events])

  const eventTimeMap = useMemo(() => {
    const map = new Map<string, number>()
    events.forEach((event) => {
      map.set(event.id, event.time)
    })
    return map
  }, [events])

  const timelineEvents = useMemo(() => {
    if (!events.length) {
      return [] as Array<{ id: string; time: number }>
    }

    return [...events]
      .map((event) => ({ id: event.id, time: event.time }))
      .sort((a, b) => a.time - b.time)
  }, [events])

  useEffect(() => {
    setCurrentTime(0)
    setIsPlaying(false)
  }, [events])

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = null
      lastTimestampRef.current = null
      return
    }

    if (duration <= 0) {
      setIsPlaying(false)
      return
    }

    const step = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp
      }

      const delta = timestamp - lastTimestampRef.current
      lastTimestampRef.current = timestamp

      setCurrentTime((previous) => {
        const next = Math.min(previous + delta, duration)
        if (next >= duration) {
          setIsPlaying(false)
          return duration
        }
        return next
      })

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastTimestampRef.current = null
    }
  }, [isPlaying, duration])

  const play = useCallback(() => {
    if (duration > 0) {
      setIsPlaying(true)
    }
  }, [duration])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev)
  }, [])

  const seek = useCallback(
    (time: number) => {
      const target = clamp(time, 0, duration)
      setCurrentTime(target)
      setIsPlaying(false)
    },
    [duration],
  )

  const focusEvent = useCallback(
    (id: string) => {
      const target = eventTimeMap.get(id)
      if (target === undefined) {
        return
      }

      setCurrentTime(clamp(target, 0, duration))
      setIsPlaying(false)
    },
    [duration, eventTimeMap],
  )

  const progress = duration > 0 ? currentTime / duration : 0

  const activeEventId = useMemo(() => {
    if (!timelineEvents.length) {
      return undefined
    }

    let low = 0
    let high = timelineEvents.length - 1
    let candidateIndex = 0
    const target = currentTime

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const midTime = timelineEvents[mid].time

      if (midTime === target) {
        return timelineEvents[mid].id
      }

      if (midTime < target) {
        candidateIndex = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    return timelineEvents[candidateIndex]?.id
  }, [currentTime, timelineEvents])

  return {
    pathPoints: pathData.points,
    bounds: pathData.bounds,
    keyEvents: pathData.keys,
    clickEvents: pathData.clicks,
    isPlaying,
    currentTime,
    duration,
    progress,
    activeEventId,
    play,
    pause,
    togglePlay,
    seek,
    focusEvent,
  }
}

