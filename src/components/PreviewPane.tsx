import { forwardRef, memo, useEffect, useImperativeHandle, useMemo } from 'react'

import type { EditorEvent } from '../hooks/useRecEditor'
import { usePreview } from '../hooks/usePreview'
import { formatMessageLabel } from '../lib/messageCatalog'
import { describeVirtualKey } from '../lib/keyCodes'

const CANVAS_WIDTH = 360
const CANVAS_HEIGHT = 260
const CANVAS_PADDING = 24

const formatTimestamp = (milliseconds: number) => {
  const total = Math.max(0, Math.round(milliseconds))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1_000)
  const ms = total % 1_000

  const pad = (value: number, digits: number) => value.toString().padStart(digits, '0')

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(ms, 3)}`
}

export interface PreviewPaneStrings {
  title: string
  play: string
  pause: string
  keyboardTimeline: string
  mouseTimeline: string
  formatKeyStatusLabel: (message: number, baseLabel: string) => string
  formatKeyTooltip: (message: number, readableKey: string, code: number, baseLabel: string) => string
  formatMouseTooltip: (message: number, x: number, y: number) => string
}

interface PreviewPaneProps {
  events: EditorEvent[]
  duration: number
  focusEventId?: string
  onFocusEvent?: (id: string) => void
  onActiveEventChange?: (id: string | undefined) => void
  strings: PreviewPaneStrings
}

export interface PreviewPaneHandle {
  togglePlay: () => void
  pause: () => void
}

const PreviewPaneComponent = forwardRef<PreviewPaneHandle, PreviewPaneProps>(
  ({ events, duration, focusEventId, onFocusEvent, onActiveEventChange, strings }, ref) => {
  const {
    pathPoints,
    bounds,
    keyEvents,
      clickEvents,
    isPlaying,
    currentTime,
    duration: previewDuration,
    progress,
    togglePlay,
      pause,
    seek,
    focusEvent,
    activeEventId,
  } = usePreview(events, duration)

    useEffect(() => {
    if (focusEventId) {
      focusEvent(focusEventId)
    }
  }, [focusEvent, focusEventId])

  useEffect(() => {
    onActiveEventChange?.(activeEventId)
  }, [activeEventId, onActiveEventChange])

    useImperativeHandle(ref, () => ({ togglePlay, pause }), [togglePlay, pause])

  const { scaledPoints, pointer } = useMemo(() => {
    if (!pathPoints.length) {
      return {
        scaledPoints: [] as Array<{ id: string; time: number; x: number; y: number }>,
        pointer: {
          x: CANVAS_WIDTH / 2,
          y: CANVAS_HEIGHT / 2,
        },
      }
    }

    const spanX = Math.max(bounds.maxX - bounds.minX, 1)
    const spanY = Math.max(bounds.maxY - bounds.minY, 1)
    const drawWidth = CANVAS_WIDTH - CANVAS_PADDING * 2
    const drawHeight = CANVAS_HEIGHT - CANVAS_PADDING * 2

    const scaled = pathPoints.map((point) => {
      const relativeX = (point.x - bounds.minX) / spanX
      const relativeY = (point.y - bounds.minY) / spanY

      return {
        id: point.id,
        time: point.time,
        x: CANVAS_PADDING + relativeX * drawWidth,
        y: CANVAS_PADDING + relativeY * drawHeight,
      }
    })

    let cursor = scaled[0]
    for (const point of scaled) {
      if (point.time <= currentTime) {
        cursor = point
      } else {
        break
      }
    }

    return { scaledPoints: scaled, pointer: cursor }
  }, [pathPoints, bounds, currentTime])

  const polylinePoints = useMemo(() => scaledPoints.map((point) => `${point.x},${point.y}`).join(' '), [scaledPoints])

  const sliderValue = Math.round(progress * 1000)

  return (
    <section className="preview-pane" aria-label="Macro preview">
      <header className="preview-header">
        <h2>{strings.title}</h2>
        <div className="time-display">
          <span>{formatTimestamp(currentTime)}</span>
          <span> / </span>
          <span>{formatTimestamp(previewDuration)}</span>
        </div>
      </header>

      <div className="preview-canvas">
        <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} role="img" aria-label="Mouse path">
          <rect
            x={CANVAS_PADDING / 2}
            y={CANVAS_PADDING / 2}
            width={CANVAS_WIDTH - CANVAS_PADDING}
            height={CANVAS_HEIGHT - CANVAS_PADDING}
            rx={12}
            ry={12}
            className="preview-frame"
          />

          {scaledPoints.length > 0 && (
            <polyline points={polylinePoints} className="preview-path" />
          )}

          <circle cx={pointer.x} cy={pointer.y} r={7} className="preview-cursor" />
        </svg>
      </div>

      <div className="preview-controls">
        <button type="button" onClick={togglePlay}>
          {isPlaying ? strings.pause : strings.play}
        </button>
        <div className="preview-range">
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={sliderValue}
            onChange={(event) => {
              const next = Number(event.currentTarget.value) / 1000
              seek(next * previewDuration)
            }}
            aria-label="Playback position"
          />
        </div>
        {previewDuration > 0 && (
          <div className="marker-track">
            <div className="marker-layer keyboard-layer" aria-label={strings.keyboardTimeline}>
              {keyEvents.map((entry) => {
                const position = (entry.time / previewDuration) * 100
                const readableKey = describeVirtualKey(entry.code)
                const baseLabel = formatMessageLabel(entry.message)
                const statusLabel = strings.formatKeyStatusLabel(entry.message, baseLabel)
                const tooltip = strings.formatKeyTooltip(entry.message, readableKey, entry.code, statusLabel)
                return (
                  <div
                    key={entry.id}
                    className="marker key-marker"
                    style={{ left: `${position}%` }}
                    aria-label={tooltip}
                    data-tooltip={tooltip}
                    onClick={() => {
                      onFocusEvent?.(entry.id)
                      focusEvent(entry.id)
                    }}
                  />
                )
              })}
            </div>
            <div className="marker-layer mouse-layer" aria-label={strings.mouseTimeline}>
              {clickEvents.map((entry) => {
                const position = (entry.time / previewDuration) * 100
                const tooltip = strings.formatMouseTooltip(entry.message, entry.x, entry.y)
                return (
                  <div
                    key={entry.id}
                    className="marker mouse-marker"
                    style={{ left: `${position}%` }}
                    aria-label={tooltip}
                    data-tooltip={tooltip}
                    onClick={() => {
                      onFocusEvent?.(entry.id)
                      focusEvent(entry.id)
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
})

PreviewPaneComponent.displayName = 'PreviewPane'

export const PreviewPane = memo(PreviewPaneComponent)

