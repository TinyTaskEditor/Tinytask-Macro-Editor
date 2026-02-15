import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import type { EditorEvent } from '../hooks/useRecEditor'
import { MESSAGE_LABELS } from '../lib/messageCatalog'
import { describeVirtualKey } from '../lib/keyCodes'

const formatHex = (value: number) => `0x${value.toString(16).toUpperCase()}`

const formatMessage = (message: number) =>
  `${MESSAGE_LABELS[message] ?? 'UNKNOWN'} (${formatHex(message)})`

const formatParam = (value: number) => `${value} (${formatHex(value)})`

const formatTimestamp = (milliseconds: number) => {
  const total = Math.max(0, Math.round(milliseconds))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1_000)
  const ms = total % 1_000

  const pad = (value: number, digits: number) => value.toString().padStart(digits, '0')

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(ms, 3)}`
}

const ESTIMATED_ROW_HEIGHT = 56
const KEY_MESSAGES = new Set([0x0100, 0x0101, 0x0104, 0x0105])
const MOUSE_BUTTON_MESSAGES = new Set([0x0201, 0x0202, 0x0204, 0x0205, 0x0207, 0x0208])

export interface EventTableStrings {
  columns: {
    message: string
    paramL: string
    paramH: string
    delay: string
    timestamp: string
    actions: string
  }
  selectAllLabel: string
  clearSelectionLabel: string
  selectEventAria: (index: number) => string
  deleteAction: string
  timestampMs: (milliseconds: number) => string
  keyPressDetail: (keyName: string) => string
  keyReleaseDetail: (keyName: string) => string
  moveDetail: (x: number, y: number) => string
  mouseActionDetail: (message: number, x: number, y: number) => string
  wheelDetail: (value: number) => string
  fallbackDetail: (paramL: number, paramH: number) => string
}

const getEventDetail = (event: EditorEvent, strings: EventTableStrings): string => {
  if (KEY_MESSAGES.has(event.message)) {
    const keyName = describeVirtualKey(event.paramL)
    return event.message === 0x0100 || event.message === 0x0104
      ? strings.keyPressDetail(keyName)
      : strings.keyReleaseDetail(keyName)
  }

  if (event.message === 0x0200) {
    return strings.moveDetail(event.paramL, event.paramH)
  }

  if (MOUSE_BUTTON_MESSAGES.has(event.message)) {
    return strings.mouseActionDetail(event.message, event.paramL, event.paramH)
  }

  if (event.message === 0x020a) {
    return strings.wheelDetail(event.paramH)
  }

  return strings.fallbackDetail(event.paramL, event.paramH)
}

interface EventTableProps {
  events: EditorEvent[]
  sourceIndexes?: number[]
  selectedIds: Set<string>
  visibleSelectedCount: number
  onToggleSelection: (id: string, index: number, options?: { shift?: boolean; meta?: boolean }) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDelayChange: (id: string, value: number) => void
  onDelete: (id: string) => void
  strings: EventTableStrings
  activeEventId?: string
  delaySortOrder: 'none' | 'asc' | 'desc'
  onToggleDelaySort: () => void
}

export interface EventTableHandle {
  scrollToIndex: (index: number, align?: 'auto' | 'start' | 'center' | 'end') => void
}

const EventTableComponent = forwardRef<EventTableHandle, EventTableProps>(
  ({
    events,
    sourceIndexes,
    selectedIds,
    visibleSelectedCount,
    onToggleSelection,
    onSelectAll,
    onClearSelection,
    onDelayChange,
    onDelete,
    strings,
    activeEventId,
    delaySortOrder,
    onToggleDelaySort,
  },
  ref,
) => {
    const parentRef = useRef<HTMLDivElement>(null)
    const selectAllRef = useRef<HTMLInputElement>(null)

    const virtualizer = useVirtualizer({
      count: events.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => ESTIMATED_ROW_HEIGHT,
      overscan: 12,
    })

    const virtualItems = virtualizer.getVirtualItems()
    const allSelected = events.length > 0 && visibleSelectedCount === events.length
    const partiallySelected = visibleSelectedCount > 0 && visibleSelectedCount < events.length

    useEffect(() => {
      if (selectAllRef.current) {
        selectAllRef.current.indeterminate = partiallySelected
      }
    }, [partiallySelected])

    useImperativeHandle(
      ref,
      () => ({
        scrollToIndex: (index: number, align: 'auto' | 'start' | 'center' | 'end' = 'center') => {
          if (!Number.isFinite(index)) {
            return
          }

          const clamped = Math.max(0, Math.min(events.length - 1, Math.floor(index)))
          if (clamped < 0) {
            return
          }

          virtualizer.scrollToIndex(clamped, { align })
        },
      }),
      [events.length, virtualizer],
    )

    return (
      <div className="event-table" role="table" aria-rowcount={events.length}>
        <div className="event-table-header" role="row">
          <span role="columnheader" className="cell select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              aria-label={allSelected ? strings.clearSelectionLabel : strings.selectAllLabel}
              onChange={(event) => {
                if (event.currentTarget.checked) {
                  onSelectAll()
                } else {
                  onClearSelection()
                }
              }}
            />
          </span>
          <span role="columnheader">#</span>
          <span role="columnheader">{strings.columns.message}</span>
          <span role="columnheader">{strings.columns.paramL}</span>
          <span role="columnheader">{strings.columns.paramH}</span>
          <span
            role="columnheader"
            className="sortable-header"
            aria-sort={delaySortOrder === 'none' ? 'none' : delaySortOrder === 'asc' ? 'ascending' : 'descending'}
          >
            <button type="button" className="sort-button" onClick={onToggleDelaySort}>
              {strings.columns.delay}
              <span aria-hidden="true" className="sort-indicator">
                {delaySortOrder === 'asc' ? '▲' : delaySortOrder === 'desc' ? '▼' : '↕'}
              </span>
            </button>
          </span>
          <span role="columnheader">{strings.columns.timestamp}</span>
          <span role="columnheader">{strings.columns.actions}</span>
        </div>
        <div className="event-table-body" ref={parentRef} role="rowgroup">
          <div
            className="event-table-virtual-space"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualRow) => {
              const entry = events[virtualRow.index]

              if (!entry) {
                return null
              }

              const originalIndex = sourceIndexes ? sourceIndexes[virtualRow.index] : virtualRow.index
              const parityClass = virtualRow.index % 2 === 0 ? 'even' : 'odd'
              const isSelected = selectedIds.has(entry.id)
              const isActive = entry.id === activeEventId
              const timestamp = formatTimestamp(entry.time)
              const detail = getEventDetail(entry, strings)
              const messageLabel = formatMessage(entry.message)

              return (
                <div
                  key={entry.id}
                  data-index={virtualRow.index}
                  role="row"
                  className={`event-table-row ${parityClass} ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`.trim()}
                  ref={virtualizer.measureElement}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                  }}
                  aria-selected={isSelected}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="cell select" role="cell">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={strings.selectEventAria(originalIndex + 1)}
                      onChange={(event) => {
                        const nativeEvent = event.nativeEvent as MouseEvent
                        onToggleSelection(entry.id, originalIndex, {
                          shift: nativeEvent.shiftKey,
                          meta: nativeEvent.metaKey || nativeEvent.ctrlKey,
                        })
                      }}
                    />
                  </span>
                  <span className="cell index" role="cell">
                    {originalIndex + 1}
                  </span>
                  <span className="cell message" role="cell" title={detail}>
                    <span className="message-title">{messageLabel}</span>
                    <span className="message-detail">{detail}</span>
                  </span>
                  <span className="cell" role="cell">
                    {formatParam(entry.paramL)}
                  </span>
                  <span className="cell" role="cell">
                    {formatParam(entry.paramH)}
                  </span>
                  <span className="cell delay" role="cell">
                    <input
                      type="number"
                      min={0}
                      value={entry.delay}
                      onChange={(evt) =>
                        onDelayChange(entry.id, Number(evt.currentTarget.value))
                      }
                    />
                  </span>
                  <span className="cell" role="cell">
                    <span className="timestamp">
                      <strong>{timestamp}</strong>
                      <span className="ms">{strings.timestampMs(entry.time)}</span>
                    </span>
                  </span>
                  <span className="cell actions" role="cell">
                    <button type="button" onClick={() => onDelete(entry.id)}>
                      {strings.deleteAction}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  },
)

EventTableComponent.displayName = 'EventTable'

export const EventTable = memo(EventTableComponent)

