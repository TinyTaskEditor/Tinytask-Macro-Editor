import { useCallback, useState } from 'react'

import { encodeRec, parseRec } from '../lib/recParser'

export interface EditorEvent {
  id: string
  message: number
  paramL: number
  paramH: number
  delay: number
  time: number
  hwnd: number
}

interface LoadResult {
  fileName?: string
  baseTime?: number
}

export interface RecEditorState {
  events: EditorEvent[]
  fileName?: string
  isDirty: boolean
  duration: number
  baseTime: number
  isLoading: boolean
  error?: string
  loadFile: (file: File) => Promise<LoadResult | undefined>
  mergeFile: (file: File) => Promise<void>
  updateDelay: (id: string, value: number) => void
  removeEvent: (id: string) => void
  insertEvents: (index: number, newEvents: Array<Partial<Pick<EditorEvent, 'delay'>> & Omit<EditorEvent, 'id' | 'time' | 'delay'>>, delayTotal: number) => void
  resetChanges: () => void
  exportRec: () => { blob: Blob; fileName: string } | undefined
  selectedIds: Set<string>
  selectedCount: number
  toggleSelection: (id: string, index: number, options?: { shift?: boolean; meta?: boolean }) => void
  selectAll: () => void
  clearSelection: () => void
  applyDelayToSelection: (value: number) => void
  addDelayToSelection: (delta: number) => void
  clampSmallDelays: (threshold: number) => void
  deleteSelected: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const UINT32_MAX = 0x1_0000_0000
const HISTORY_LIMIT = 50

const sanitizeDelay = (value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }

  return Math.min(Math.round(value), UINT32_MAX - 1)
}

const recomputeTimeline = (events: EditorEvent[]): EditorEvent[] => {
  let elapsed = 0

  return events.map((event, index) => {
    if (index === 0) {
      elapsed = 0
      return { ...event, delay: 0, time: 0 }
    }

    const delay = sanitizeDelay(event.delay)
    elapsed += delay

    return { ...event, delay, time: elapsed }
  })
}

const createEditorEvents = (events: ReturnType<typeof parseRec>['events']): EditorEvent[] => {
  return events.map((event, index) => ({
    id: `${index}-${event.time}-${event.message}-${event.paramL}-${event.paramH}`,
    message: event.message,
    paramL: event.paramL,
    paramH: event.paramH,
    delay: event.delay,
    time: event.time,
    hwnd: event.hwnd,
  }))
}

type EventMutationResult = {
  next: EditorEvent[]
  selectionOverride?: Set<string>
}

export const useRecEditor = (): RecEditorState => {
  const [events, setEvents] = useState<EditorEvent[]>([])
  const [initialEvents, setInitialEvents] = useState<EditorEvent[]>([])
  const [baseTime, setBaseTime] = useState(0)
  const [fileName, setFileName] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [isDirty, setIsDirty] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)
  const [history, setHistory] = useState<EditorEvent[][]>([])
  const [future, setFuture] = useState<EditorEvent[][]>([])

  const duration = events.length ? events[events.length - 1].time : 0

  const commitEvents = useCallback(
    (
      mutator: (current: EditorEvent[]) => EventMutationResult | null,
      options: { resetAnchor?: boolean; trackHistory?: boolean } = {},
    ) => {
      setEvents((previous) => {
        const mutation = mutator(previous)

        if (!mutation) {
          if (options.resetAnchor) {
            setSelectionAnchor(null)
          }
          return previous
        }

        const recomputed = recomputeTimeline(mutation.next)

        if (options.trackHistory !== false) {
          const snapshot = previous.map((event) => ({ ...event }))
          setHistory((prevHistory) => {
            const nextHistory = [...prevHistory, snapshot]
            if (nextHistory.length > HISTORY_LIMIT) {
              nextHistory.shift()
            }
            return nextHistory
          })
          setFuture([])
        }

        setIsDirty(true)

        const availableIds = new Set(recomputed.map((event) => event.id))

        setSelectedIds((prior) => {
          if (mutation.selectionOverride) {
            return new Set<string>(
              [...mutation.selectionOverride].filter((id) => availableIds.has(id)),
            )
          }

          const filtered = new Set<string>([...prior].filter((id) => availableIds.has(id)))
          return filtered.size === prior.size ? prior : filtered
        })

        if (options.resetAnchor || (mutation.selectionOverride && mutation.selectionOverride.size === 0)) {
          setSelectionAnchor(null)
        }

        return recomputed
      })
    },
    [],
  )

  const loadFile = useCallback<RecEditorState['loadFile']>(
    async (file) => {
      setError(undefined)
      setLoading(true)

      try {
        const arrayBuffer = await file.arrayBuffer()
        const parsed = parseRec(arrayBuffer)
        const editorEvents = recomputeTimeline(createEditorEvents(parsed.events))

        setEvents(editorEvents)
        setInitialEvents(editorEvents)
        setBaseTime(parsed.baseTime)
        setFileName(file.name)
        setIsDirty(false)
        setSelectedIds(new Set<string>())
        setSelectionAnchor(null)
        setHistory([])
        setFuture([])

        return { fileName: file.name, baseTime: parsed.baseTime }
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to parse .rec file')
      } finally {
        setLoading(false)
      }

      return undefined
    },
    [],
  )

  const updateDelay = useCallback<RecEditorState['updateDelay']>((id, value) => {
    const normalized = sanitizeDelay(value)

    commitEvents((current) => {
      let didChange = false

      const next = current.map((event) => {
        if (event.id !== id) {
          return event
        }

        if (event.delay === normalized) {
          return event
        }

        didChange = true
        return { ...event, delay: normalized }
      })

      if (!didChange) {
        return null
      }

      return { next }
    })
  }, [commitEvents])

  const removeEvent = useCallback<RecEditorState['removeEvent']>((id) => {
    commitEvents((current) => {
      if (!current.some((event) => event.id === id)) {
        return null
      }

      const next = current.filter((event) => event.id !== id)
      return { next }
    })
  }, [commitEvents])

  const resetChanges = useCallback(() => {
    if (!initialEvents.length) {
      return
    }

    // Clone to avoid sharing references with `initialEvents`
    const snapshot = initialEvents.map((event) => ({ ...event }))
    setEvents(recomputeTimeline(snapshot))
    setIsDirty(false)
    setSelectedIds(new Set<string>())
    setSelectionAnchor(null)
    setHistory([])
    setFuture([])
  }, [initialEvents])

  const exportRec = useCallback<RecEditorState['exportRec']>(() => {
    if (!events.length) {
      return undefined
    }

    try {
      const encoded = encodeRec(
        events.map(({ message, paramL, paramH, delay, hwnd }) => ({
          message,
          paramL,
          paramH,
          delay,
          hwnd,
        })),
        { baseTime },
      )

      const blob = new Blob([encoded], { type: 'application/octet-stream' })
      const safeName = (fileName ?? 'macro').replace(/\.rec$/i, '')

      return { blob, fileName: `${safeName}-edited.rec` }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to encode macro')
      return undefined
    }
  }, [events, baseTime, fileName])

  const toggleSelection = useCallback<RecEditorState['toggleSelection']>(
    (id, index, options) => {
      const shift = options?.shift ?? false
      const meta = options?.meta ?? false
      const anchor = selectionAnchor ?? index

      setSelectedIds((previous) => {
        if (shift && events.length) {
          const start = Math.max(0, Math.min(anchor, index))
          const end = Math.min(events.length - 1, Math.max(anchor, index))
          const next = meta ? new Set(previous) : new Set<string>()

          for (let cursor = start; cursor <= end; cursor += 1) {
            const entry = events[cursor]
            if (entry) {
              next.add(entry.id)
            }
          }

          if (selectionAnchor === null) {
            setSelectionAnchor(index)
          }

          return next
        }

        const next = new Set(previous)

        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }

        setSelectionAnchor(next.size ? index : null)
        return next
      })

    },
    [events, selectionAnchor],
  )

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(events.map((event) => event.id)))
    setSelectionAnchor(null)
  }, [events])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set<string>())
    setSelectionAnchor(null)
  }, [])

  const applyToSelection = useCallback(
    (updater: (event: EditorEvent, index: number) => EditorEvent | null) => {
      if (!selectedIds.size) {
        return
      }

      commitEvents((current) => {
        let didChange = false

        const next = current.map((event, index) => {
          if (!selectedIds.has(event.id)) {
            return event
          }

          const updated = updater(event, index)
          if (!updated) {
            return event
          }

          didChange = true
          return updated
        })

        if (!didChange) {
          return null
        }

        return { next }
      })
    },
    [commitEvents, selectedIds],
  )

  const applyDelayToSelection = useCallback<RecEditorState['applyDelayToSelection']>((value) => {
    const normalized = sanitizeDelay(value)

    applyToSelection((event) => {
      if (event.delay === normalized) {
        return null
      }

      return { ...event, delay: normalized }
    })
  }, [applyToSelection])

  const addDelayToSelection = useCallback<RecEditorState['addDelayToSelection']>((delta) => {
    const deltaRounded = Math.round(delta)

    applyToSelection((event) => {
      const nextDelay = sanitizeDelay(event.delay + deltaRounded)

      if (nextDelay === event.delay) {
        return null
      }

      return { ...event, delay: nextDelay }
    })
  }, [applyToSelection])

  const clampSmallDelays = useCallback<RecEditorState['clampSmallDelays']>((threshold) => {
    const limit = Math.max(0, Math.round(threshold))

    applyToSelection((event, index) => {
      if (index === 0) {
        return null
      }

      if (event.delay === 0 || event.delay >= limit) {
        return null
      }

      return { ...event, delay: 0 }
    })
  }, [applyToSelection])

  const deleteSelected = useCallback<RecEditorState['deleteSelected']>(() => {
    if (!selectedIds.size) {
      return
    }

    commitEvents(
      (current) => {
        const next = current.filter((event) => !selectedIds.has(event.id))
        if (next.length === current.length) {
          return null
        }

        return { next, selectionOverride: new Set() }
      },
      { resetAnchor: true },
    )
  }, [commitEvents, selectedIds])

  const insertEvents = useCallback<RecEditorState['insertEvents']>(
    (index, newEvents, delayTotal) => {
      commitEvents((current) => {
        const clampedIndex = Math.max(0, Math.min(index, current.length))
        const eventsToAdd: EditorEvent[] = newEvents.map((e, i) => ({
          ...e,
          id: `new-${Date.now()}-${i}-${Math.random()}`,
          time: 0, // Will be recomputed
          delay: i === 0 ? delayTotal : (e.delay ?? 0),
        }))

        const next = [
          ...current.slice(0, clampedIndex),
          ...eventsToAdd,
          ...current.slice(clampedIndex),
        ]

        return { next }
      })
    },
    [commitEvents],
  )

  const mergeFile = useCallback<RecEditorState['mergeFile']>(
    async (file) => {
      setError(undefined)
      setLoading(true)

      try {
        const arrayBuffer = await file.arrayBuffer()
        const parsed = parseRec(arrayBuffer)
        const newEvents = createEditorEvents(parsed.events)
        insertEvents(events.length, newEvents, 0)
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Failed to parse .rec file for merge')
      } finally {
        setLoading(false)
      }
    },
    [events.length, insertEvents],
  )

  const undo = useCallback<RecEditorState['undo']>(() => {
    setHistory((prevHistory) => {
      if (!prevHistory.length) {
        return prevHistory
      }

      const snapshot = prevHistory[prevHistory.length - 1].map((event) => ({ ...event }))

      setFuture((prevFuture) => {
        const next = [...prevFuture, events.map((event) => ({ ...event }))]
        if (next.length > HISTORY_LIMIT) {
          next.shift()
        }
        return next
      })

      setEvents(recomputeTimeline(snapshot))
      setSelectedIds(new Set<string>())
      setSelectionAnchor(null)
      setIsDirty(true)

      return prevHistory.slice(0, -1)
    })
  }, [events])

  const redo = useCallback<RecEditorState['redo']>(() => {
    setFuture((prevFuture) => {
      if (!prevFuture.length) {
        return prevFuture
      }

      const snapshot = prevFuture[prevFuture.length - 1].map((event) => ({ ...event }))

      setHistory((prevHistory) => {
        const next = [...prevHistory, events.map((event) => ({ ...event }))]
        if (next.length > HISTORY_LIMIT) {
          next.shift()
        }
        return next
      })

      setEvents(recomputeTimeline(snapshot))
      setSelectedIds(new Set<string>())
      setSelectionAnchor(null)
      setIsDirty(true)

      return prevFuture.slice(0, -1)
    })
  }, [events])

  const canUndo = history.length > 0
  const canRedo = future.length > 0

  return {
    events,
    fileName,
    isDirty,
    duration,
    baseTime,
    isLoading: loading,
    error,
    loadFile,
    mergeFile,
    updateDelay,
    removeEvent,
    insertEvents,
    resetChanges,
    exportRec,
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelection,
    selectAll,
    clearSelection,
    applyDelayToSelection,
    addDelayToSelection,
    clampSmallDelays,
    deleteSelected,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}

