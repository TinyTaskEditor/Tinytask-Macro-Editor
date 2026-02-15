import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import type { DropzoneOptions } from 'react-dropzone'

import { EventTable, type EventTableHandle, type EventTableStrings } from './components/EventTable'
import { PreviewPane, type PreviewPaneHandle, type PreviewPaneStrings } from './components/PreviewPane'
import { useRecEditor, type EditorEvent } from './hooks/useRecEditor'
import { MESSAGE_LABELS } from './lib/messageCatalog'
import { describeVirtualKey } from './lib/keyCodes'

import './App.css'

import ruFlag from './assets/flags/ru.svg'
import usFlag from './assets/flags/us.svg'

type ActionFilter = 'all' | 'keyboard' | 'mouseButtons'

type LocaleKey = 'en' | 'ru'

interface LocaleStrings {
  localeSwitcherLabel: string
  localeOptions: Record<LocaleKey, string>
  header: {
    title: string
    subtitle: string
  }
  dropzone: {
    idle: string
    active: string
    button: string
    loading: string
  }
  status: {
    parsing: string
    unknownMessages: (codes: string) => string
  }
  summary: {
    file: string
    events: string
    duration: string
    status: string
    modified: string
    original: string
  }
  actions: {
    undo: string
    redo: string
    reset: string
    download: string
    merge: string
  }
  filters: {
    options: { id: ActionFilter; label: string }[]
    keyboardLabel: string
    allKeysOption: string
  }
  search: {
    actionLabel: string
    actionPlaceholder: string
    actionButton: string
    actionInvalid: string
    actionMissing: string
    eventHidden: string
    macroEmpty: string
    eventNotFound: string
    timestampLabel: string
    timestampPlaceholder: string
    timestampButton: string
    timestampInvalid: string
    timestampLast: string
  }
  selection: {
    summary: (selectedCount: number, visibleSelectedCount: number, filterActive: boolean) => string
    buttons: {
      selectAll: string
      clearSelection: string
      deleteSelected: string
    }
    actions: {
      setDelayLabel: string
      setDelayPlaceholder: string
      deltaLabel: string
      deltaPlaceholder: string
      clampLabel: string
      clampPlaceholder: string
      apply: string
      clamp: string
    }
    insert: {
      title: string
      typeLabel: string
      typeOptions: Record<string, string>
      keyLabel: string
      delayLabel: string
      button: string
    }
  }
  preview: PreviewPaneStrings
  eventTable: EventTableStrings
}

const pluralizeRuEvents = (count: number): string => {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) {
    return 'действие'
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 'действия'
  }
  return 'действий'
}

const describeMouseAction = (message: number, locale: LocaleKey): string => {
  switch (message) {
    case 0x0201:
      return locale === 'ru' ? 'Левая кнопка: нажатие' : 'Left button down'
    case 0x0202:
      return locale === 'ru' ? 'Левая кнопка: отпускание' : 'Left button up'
    case 0x0204:
      return locale === 'ru' ? 'Правая кнопка: нажатие' : 'Right button down'
    case 0x0205:
      return locale === 'ru' ? 'Правая кнопка: отпускание' : 'Right button up'
    case 0x0207:
      return locale === 'ru' ? 'Средняя кнопка: нажатие' : 'Middle button down'
    case 0x0208:
      return locale === 'ru' ? 'Средняя кнопка: отпускание' : 'Middle button up'
    default:
      return locale === 'ru' ? 'Событие мыши' : 'Mouse event'
  }
}

const formatTimestamp = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds)) {
    return '--:--:--:---'
  }

  const sign = milliseconds < 0 ? '-' : ''
  const absolute = Math.abs(Math.trunc(milliseconds))
  const hours = Math.floor(absolute / 3_600_000)
  const minutes = Math.floor((absolute % 3_600_000) / 60_000)
  const seconds = Math.floor((absolute % 60_000) / 1_000)
  const millis = absolute % 1_000

  const hoursPart = hours.toString().padStart(2, '0')
  const minutesPart = minutes.toString().padStart(2, '0')
  const secondsPart = seconds.toString().padStart(2, '0')
  const millisPart = millis.toString().padStart(3, '0')

  return `${sign}${hoursPart}:${minutesPart}:${secondsPart}:${millisPart}`
}

const createLocaleStrings = (locale: LocaleKey, formatNumber: (value: number) => string): LocaleStrings => {
  if (locale === 'ru') {
    return {
      localeSwitcherLabel: 'Выбор языка',
      localeOptions: {
        en: 'Английский',
        ru: 'Русский',
      },
      header: {
        title: 'Редактор макросов TinyTask',
        subtitle: 'Загрузите `.rec` файл TinyTask, скорректируйте задержки и приведите последовательность к нужному виду.',
      },
      dropzone: {
        idle: 'Перетащите .rec файл сюда или используйте кнопку ниже',
        active: 'Отпустите файл, чтобы загрузить',
        button: 'Выбрать файл',
        loading: 'Загрузка…',
      },
      status: {
        parsing: 'Разбор макроса…',
        unknownMessages: (codes) => `Обнаружены неизвестные коды сообщений: ${codes}`,
      },
      summary: {
        file: 'Файл',
        events: 'Действия',
        duration: 'Длительность',
        status: 'Статус',
        modified: 'Изменён',
        original: 'Исходный',
      },
      actions: {
        undo: 'Отменить',
        redo: 'Повторить',
        reset: 'Сбросить изменения',
        download: 'Скачать макрос',
        merge: 'Объединить',
      },
      filters: {
        options: [
          { id: 'all', label: 'Все действия' },
          { id: 'keyboard', label: 'Клавиатура' },
          { id: 'mouseButtons', label: 'Кнопки мыши' },
        ],
        keyboardLabel: 'Клавиша',
        allKeysOption: 'Все клавиши',
      },
      search: {
        actionLabel: 'Перейти к действию',
        actionPlaceholder: '№',
        actionButton: 'Найти',
        actionInvalid: 'Введите корректный номер действия',
        actionMissing: 'Действие с таким номером отсутствует',
        eventHidden: 'Событие скрыто выбранным фильтром',
        macroEmpty: 'Макрос пуст',
        eventNotFound: 'Событие не найдено',
        timestampLabel: 'Время (мм:сс или мс)',
        timestampPlaceholder: '00:30.500 или 30500',
        timestampButton: 'Найти',
        timestampInvalid: 'Введите время в формате мм:сс или миллисекунды',
        timestampLast: 'Показано последнее событие',
      },
      selection: {
        summary: (selectedCount, visibleSelectedCount, filterActive) => {
          if (!selectedCount) {
            return 'Нет выбранных действий'
          }
          const base = `Выбрано ${formatNumber(selectedCount)} ${pluralizeRuEvents(selectedCount)}`
          return filterActive ? `${base} (видимы: ${formatNumber(visibleSelectedCount)})` : base
        },
        buttons: {
          selectAll: 'Выделить все',
          clearSelection: 'Снять выделение',
          deleteSelected: 'Удалить выбранные',
        },
        actions: {
          setDelayLabel: 'Установить задержку (мс)',
          setDelayPlaceholder: 'например, 50',
          deltaLabel: 'Добавить/убрать (мс)',
          deltaPlaceholder: 'например, -10',
          clampLabel: 'Убрать дрожание ≤ (мс)',
          clampPlaceholder: 'например, 30',
          apply: 'Применить',
          clamp: 'Обнулить',
        },
        insert: {
          title: 'Добавить действие',
          typeLabel: 'Тип',
          typeOptions: {
            leftClick: 'ЛКМ',
            rightClick: 'ПКМ',
            keyPress: 'Клавиша',
          },
          keyLabel: 'Клавиша',
          delayLabel: 'Задержка',
          button: 'Добавить',
        },
      },
      preview: {
        title: 'Предпросмотр',
        play: 'Пуск',
        pause: 'Пауза',
        keyboardTimeline: 'Лента событий клавиатуры',
        mouseTimeline: 'Лента нажатий мыши',
        formatKeyStatusLabel: (message, baseLabel) => {
          if (message === 0x0100 || message === 0x0104) {
            return `${baseLabel} (нажатие)`
          }
          if (message === 0x0101 || message === 0x0105) {
            return `${baseLabel} (отпускание)`
          }
          return baseLabel
        },
        formatKeyTooltip: (_message, keyName, code, statusLabel) => `${statusLabel} · ${keyName} (код: ${code})`,
        formatMouseTooltip: (message, x, y) => `${describeMouseAction(message, 'ru')} · (${formatNumber(x)}, ${formatNumber(y)})`,
      },
      eventTable: {
        columns: {
          message: 'Сообщение',
          paramL: 'Параметр L',
          paramH: 'Параметр H',
          delay: 'Задержка (мс)',
          timestamp: 'Метка времени',
          actions: 'Действия',
        },
        selectAllLabel: 'Выделить все события',
        clearSelectionLabel: 'Снять выделение',
        selectEventAria: (index) => `Выбрать действие ${formatNumber(index)}`,
        deleteAction: 'Удалить',
        timestampMs: formatTimestamp,
        keyPressDetail: (keyName) => `Нажатие: ${keyName}`,
        keyReleaseDetail: (keyName) => `Отпускание: ${keyName}`,
        moveDetail: (x, y) => `Перемещение к (${formatNumber(x)}, ${formatNumber(y)})`,
        mouseActionDetail: (message, x, y) => `${describeMouseAction(message, 'ru')} · (${formatNumber(x)}, ${formatNumber(y)})`,
        wheelDetail: (value) => `Событие колеса (значение: ${formatNumber(value)})`,
        fallbackDetail: (paramL, paramH) => `Параметры L/H: ${formatNumber(paramL)}/${formatNumber(paramH)}`,
      },
    }
  }

  return {
    localeSwitcherLabel: 'Language',
    localeOptions: {
      en: 'English',
      ru: 'Russian',
    },
    header: {
      title: 'TinyTask Macro Editor',
      subtitle: 'Load a TinyTask `.rec` file, tweak delays, and curate the exact sequence you need.',
    },
    dropzone: {
      idle: 'Drag a .rec file here, or use the button below',
      active: 'Drop the .rec file to load it',
      button: 'Browse files',
      loading: 'Loading…',
    },
    status: {
      parsing: 'Parsing macro…',
      unknownMessages: (codes) => `Unknown message codes detected: ${codes}`,
    },
    summary: {
      file: 'File',
      events: 'Events',
      duration: 'Duration',
      status: 'Status',
      modified: 'Modified',
      original: 'Original',
    },
    actions: {
      undo: 'Undo',
      redo: 'Redo',
      reset: 'Reset changes',
      download: 'Download edited macro',
      merge: 'Merge',
    },
    filters: {
      options: [
        { id: 'all', label: 'All actions' },
        { id: 'keyboard', label: 'Keyboard' },
        { id: 'mouseButtons', label: 'Mouse buttons' },
      ],
      keyboardLabel: 'Key',
      allKeysOption: 'All keys',
    },
    search: {
      actionLabel: 'Go to action',
      actionPlaceholder: '#',
      actionButton: 'Find',
      actionInvalid: 'Enter a valid action number',
      actionMissing: 'No action with that number',
      eventHidden: 'The action is hidden by the current filter',
      macroEmpty: 'Macro is empty',
      eventNotFound: 'Event not found',
      timestampLabel: 'Timestamp (mm:ss or ms)',
      timestampPlaceholder: '00:30.500 or 30500',
      timestampButton: 'Find',
      timestampInvalid: 'Enter time as mm:ss or milliseconds',
      timestampLast: 'Showing the last event',
    },
    selection: {
      summary: (selectedCount, visibleSelectedCount, filterActive) => {
        if (!selectedCount) {
          return 'No events selected'
        }
        const noun = selectedCount === 1 ? 'event' : 'events'
        const base = `${formatNumber(selectedCount)} ${noun} selected`
        return filterActive ? `${base} (${formatNumber(visibleSelectedCount)} visible)` : base
      },
      buttons: {
        selectAll: 'Select all',
        clearSelection: 'Clear selection',
        deleteSelected: 'Delete selected',
      },
      actions: {
        setDelayLabel: 'Set delay (ms)',
        setDelayPlaceholder: 'e.g. 50',
        deltaLabel: 'Add/Subtract (ms)',
        deltaPlaceholder: 'e.g. -10',
        clampLabel: 'Clamp jitter ≤ (ms)',
        clampPlaceholder: 'e.g. 30',
        apply: 'Apply',
        clamp: 'Clamp',
      },
      insert: {
        title: 'Add Action',
        typeLabel: 'Type',
        typeOptions: {
          leftClick: 'LMB',
          rightClick: 'RMB',
          keyPress: 'Key',
        },
        keyLabel: 'Key',
        delayLabel: 'Delay',
        button: 'Add',
      },
    },
    preview: {
      title: 'Preview',
      play: 'Play',
      pause: 'Pause',
      keyboardTimeline: 'Keyboard events timeline',
      mouseTimeline: 'Mouse button timeline',
      formatKeyStatusLabel: (message, baseLabel) => {
        if (message === 0x0100 || message === 0x0104) {
          return `${baseLabel} (press)`
        }
        if (message === 0x0101 || message === 0x0105) {
          return `${baseLabel} (release)`
        }
        return baseLabel
      },
      formatKeyTooltip: (_message, keyName, code, statusLabel) => `${statusLabel} · ${keyName} (code: ${code})`,
      formatMouseTooltip: (message, x, y) => `${describeMouseAction(message, 'en')} · (${formatNumber(x)}, ${formatNumber(y)})`,
    },
    eventTable: {
      columns: {
        message: 'Message',
        paramL: 'Param L',
        paramH: 'Param H',
        delay: 'Delay (ms)',
        timestamp: 'Timestamp',
        actions: 'Actions',
      },
      selectAllLabel: 'Select all events',
      clearSelectionLabel: 'Clear selection',
      selectEventAria: (index) => `Select event ${formatNumber(index)}`,
      deleteAction: 'Delete',
      timestampMs: formatTimestamp,
      keyPressDetail: (keyName) => `Key press: ${keyName}`,
      keyReleaseDetail: (keyName) => `Key release: ${keyName}`,
      moveDetail: (x, y) => `Move to (${formatNumber(x)}, ${formatNumber(y)})`,
      mouseActionDetail: (message, x, y) => `${describeMouseAction(message, 'en')} at (${formatNumber(x)}, ${formatNumber(y)})`,
      wheelDetail: (value) => `Wheel event (raw value: ${formatNumber(value)})`,
      fallbackDetail: (paramL, paramH) => `Params L/H: ${formatNumber(paramL)}/${formatNumber(paramH)}`,
    },
  }
}

const LOCALE_OPTIONS: Array<{ key: LocaleKey; flag: string }> = [
  { key: 'ru', flag: ruFlag },
  { key: 'en', flag: usFlag },
]

const isKeyboardEvent = (message: number) => message === 0x0100 || message === 0x0101 || message === 0x0104 || message === 0x0105

const isMouseButtonEvent = (message: number) =>
  message === 0x0201 ||
  message === 0x0202 ||
  message === 0x0204 ||
  message === 0x0205 ||
  message === 0x0207 ||
  message === 0x0208

function App() {
  const {
    events,
    fileName,
    isDirty,
    duration,
    isLoading,
    error,
    loadFile,
    updateDelay,
    removeEvent,
    resetChanges,
    exportRec,
    selectedIds,
    selectedCount,
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
    insertEvents,
    mergeFile,
  } = useRecEditor()

  const [addType, setAddType] = useState<'leftClick' | 'rightClick' | 'keyPress'>('leftClick')
  const [addKey, setAddKey] = useState<number>(0x41) // 'A'
  const [addDelay, setAddDelay] = useState('500')

  const [locale, setLocale] = useState<LocaleKey>('ru')
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US'), [locale])
  const formatNumber = useCallback((value: number) => numberFormatter.format(value), [numberFormatter])
  const strings = useMemo(() => createLocaleStrings(locale, formatNumber), [locale, formatNumber])

  const [setDelayValue, setSetDelayValue] = useState('')
  const [deltaValue, setDeltaValue] = useState('')
  const [jitterValue, setJitterValue] = useState('50')
  const [actionQuery, setActionQuery] = useState('')
  const [timestampQuery, setTimestampQuery] = useState('')
  const [searchMessage, setSearchMessage] = useState<string>()
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [keyboardKeyFilter, setKeyboardKeyFilter] = useState<string>('all')
  const [activeEventId, setActiveEventId] = useState<string>()
  const [delaySortOrder, setDelaySortOrder] = useState<'none' | 'asc' | 'desc'>('none')
  const lastAutoScrollRef = useRef<{ id?: string; index?: number; visibleIndex?: number }>({})

  const availableKeyboardKeys = useMemo(() => {
    const keys = new Set<string>()
    events.forEach((event) => {
      if (isKeyboardEvent(event.message)) {
        keys.add(describeVirtualKey(event.paramL))
      }
    })
    const localeKey = locale === 'ru' ? 'ru' : 'en'
    return Array.from(keys).sort((a, b) => a.localeCompare(b, localeKey))
  }, [events, locale])

  const filteredRows = useMemo(() => {
    const rows = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => {
        if (actionFilter === 'keyboard') {
          if (!isKeyboardEvent(event.message)) {
            return false
          }
          if (keyboardKeyFilter !== 'all') {
            return describeVirtualKey(event.paramL) === keyboardKeyFilter
          }
          return true
        }
        if (actionFilter === 'mouseButtons') {
          return isMouseButtonEvent(event.message)
        }
        return true
      })

    if (delaySortOrder === 'asc') {
      rows.sort((a, b) => {
        if (a.event.delay === b.event.delay) {
          return a.index - b.index
        }
        return a.event.delay - b.event.delay
      })
    } else if (delaySortOrder === 'desc') {
      rows.sort((a, b) => {
        if (a.event.delay === b.event.delay) {
          return a.index - b.index
        }
        return b.event.delay - a.event.delay
      })
    }

    return rows
  }, [events, actionFilter, keyboardKeyFilter, delaySortOrder])

  const visibleEvents = useMemo(() => filteredRows.map((row) => row.event), [filteredRows])
  const visibleIndexes = useMemo(() => filteredRows.map((row) => row.index), [filteredRows])
  const visibleSelectedCount = useMemo(
    () => visibleEvents.reduce((count, event) => (selectedIds.has(event.id) ? count + 1 : count), 0),
    [visibleEvents, selectedIds],
  )

  const eventIndexById = useMemo(() => {
    const map = new Map<string, number>()
    events.forEach((event, index) => {
      map.set(event.id, index)
    })
    return map
  }, [events])

  const hasSelection = selectedCount > 0

  const primarySelectionId = useMemo(() => {
    const iterator = selectedIds.values().next()
    if (iterator.done) {
      return undefined
    }
    return iterator.value
  }, [selectedIds])

  const previewRef = useRef<PreviewPaneHandle>(null)
  const eventTableRef = useRef<EventTableHandle>(null)

  const parseNumberInput = useCallback((value: string) => {
    if (value.trim() === '') {
      return null
    }

    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }

    return null
  }, [])

  const handleApplySetDelay = useCallback(() => {
    const numeric = parseNumberInput(setDelayValue)
    if (numeric === null) {
      return
    }

    applyDelayToSelection(numeric)
  }, [applyDelayToSelection, parseNumberInput, setDelayValue])

  const handleApplyDelta = useCallback(() => {
    const numeric = parseNumberInput(deltaValue)
    if (numeric === null) {
      return
    }

    addDelayToSelection(numeric)
  }, [addDelayToSelection, deltaValue, parseNumberInput])

  const handleClampJitter = useCallback(() => {
    const numeric = parseNumberInput(jitterValue)
    if (numeric === null) {
      return
    }

    clampSmallDelays(numeric)
  }, [clampSmallDelays, jitterValue, parseNumberInput])

  const handleFilterChange = useCallback((value: ActionFilter) => {
    setActionFilter(value)
    setSearchMessage(undefined)
    if (value !== 'keyboard') {
      setKeyboardKeyFilter('all')
    }
  }, [])

  const handleKeyboardKeyChange = useCallback((value: string) => {
    setKeyboardKeyFilter(value)
    setSearchMessage(undefined)
  }, [])

  const handleAddAction = useCallback(() => {
    const delay = parseInt(addDelay, 10) || 0
    let eventsToAdd: Array<Omit<EditorEvent, 'id' | 'time' | 'delay'>> = []

    if (addType === 'leftClick') {
      eventsToAdd = [
        { message: 0x0201, paramL: 0, paramH: 0, hwnd: events[0]?.hwnd || 0 },
        { message: 0x0202, paramL: 0, paramH: 0, hwnd: events[0]?.hwnd || 0 },
      ]
    } else if (addType === 'rightClick') {
      eventsToAdd = [
        { message: 0x0204, paramL: 0, paramH: 0, hwnd: events[0]?.hwnd || 0 },
        { message: 0x0205, paramL: 0, paramH: 0, hwnd: events[0]?.hwnd || 0 },
      ]
    } else if (addType === 'keyPress') {
      eventsToAdd = [
        { message: 0x0100, paramL: addKey, paramH: 0, hwnd: events[0]?.hwnd || 0 },
        { message: 0x0101, paramL: addKey, paramH: 0, hwnd: events[0]?.hwnd || 0 },
      ]
    }

    // Insert at the end or after selection
    let insertIndex = events.length
    if (selectedIds.size > 0) {
      const selectedIndexes = Array.from(selectedIds)
        .map(id => eventIndexById.get(id))
        .filter((idx): idx is number => idx !== undefined)
      if (selectedIndexes.length > 0) {
        insertIndex = Math.max(...selectedIndexes) + 1
      }
    }

    insertEvents(insertIndex, eventsToAdd, delay)
  }, [addDelay, addType, addKey, events, insertEvents, selectedIds, eventIndexById])

  const handleKeyInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Capture the Windows Virtual Key code (which e.keyCode matches for most common keys)
    if (e.keyCode) {
      setAddKey(e.keyCode)
    }
  }, [])

  const handleToggleDelaySort = useCallback(() => {
    setDelaySortOrder((previous) => {
      if (previous === 'none') {
        return 'asc'
      }
      if (previous === 'asc') {
        return 'desc'
      }
      return 'none'
    })
  }, [])

  useEffect(() => {
    eventTableRef.current?.scrollToIndex(0, 'start')
  }, [delaySortOrder])

  useEffect(() => {
    if (keyboardKeyFilter !== 'all' && !availableKeyboardKeys.includes(keyboardKeyFilter)) {
      setKeyboardKeyFilter('all')
    }
  }, [keyboardKeyFilter, availableKeyboardKeys])

  useEffect(() => {
    setSearchMessage(undefined)
  }, [strings])

  useEffect(() => {
    if (!activeEventId) {
      return
    }

    if (!eventIndexById.has(activeEventId)) {
      setActiveEventId(undefined)
    }
  }, [activeEventId, eventIndexById])

  useEffect(() => {
    if (!activeEventId) {
      lastAutoScrollRef.current = {}
      return
    }

    const index = eventIndexById.get(activeEventId)
    if (index === undefined) {
      return
    }

    const visibleIndex = filteredRows.findIndex((row) => row.index === index)
    const last = lastAutoScrollRef.current

    if (
      last &&
      last.id === activeEventId &&
      last.index === index &&
      last.visibleIndex === visibleIndex
    ) {
      return
    }

    lastAutoScrollRef.current = { id: activeEventId, index, visibleIndex }

    if (visibleIndex !== -1) {
      eventTableRef.current?.scrollToIndex(visibleIndex, 'center')
    }
  }, [activeEventId, eventIndexById, filteredRows])

  const focusEventByIndex = useCallback(
    (index: number) => {
      if (!events.length) {
        setSearchMessage(strings.search.macroEmpty)
        return
      }

      const clamped = Math.max(0, Math.min(events.length - 1, index))
      const target = events[clamped]
      if (!target) {
        setSearchMessage(strings.search.eventNotFound)
        return
      }

      const visibleIndex = filteredRows.findIndex((row) => row.index === clamped)

      clearSelection()
      toggleSelection(target.id, clamped)

      if (visibleIndex === -1) {
        setSearchMessage(strings.search.eventHidden)
        return
      }

      eventTableRef.current?.scrollToIndex(visibleIndex, 'center')
      setSearchMessage(undefined)
    },
    [clearSelection, events, filteredRows, strings, toggleSelection],
  )

  const handleActionSearch = useCallback(() => {
    const numeric = parseInt(actionQuery, 10)
    if (!Number.isFinite(numeric)) {
      setSearchMessage(strings.search.actionInvalid)
      return
    }

    if (numeric < 1 || numeric > events.length) {
      setSearchMessage(strings.search.actionMissing)
      return
    }

    focusEventByIndex(numeric - 1)
  }, [actionQuery, events.length, focusEventByIndex, strings])

  const parseTimestamp = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    if (trimmed.includes(':')) {
      const [hPart, mPart, sPart] = (() => {
        const parts = trimmed.split(':')
        if (parts.length === 3) {
          return parts
        }
        if (parts.length === 2) {
          return ['0', parts[0], parts[1]]
        }
        return [] as string[]
      })()

      if (!hPart || !mPart || !sPart) {
        return null
      }

      const [secondsRaw, msRaw] = sPart.split('.')
      const hours = Number(hPart)
      const minutes = Number(mPart)
      const seconds = Number(secondsRaw)
      const milliseconds = msRaw ? Number(msRaw.padEnd(3, '0').slice(0, 3)) : 0

      if ([hours, minutes, seconds, milliseconds].some((num) => !Number.isFinite(num))) {
        return null
      }

      return (((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds)
    }

    const numeric = Number(trimmed)
    if (!Number.isFinite(numeric)) {
      return null
    }

    return numeric
  }, [])

  const handleTimestampSearch = useCallback(() => {
    const targetMs = parseTimestamp(timestampQuery)
    if (targetMs === null) {
      setSearchMessage(strings.search.timestampInvalid)
      return
    }

    if (!events.length) {
      setSearchMessage(strings.search.macroEmpty)
      return
    }

    const targetIndex = events.findIndex((event) => event.time >= targetMs)
    if (targetIndex === -1) {
      focusEventByIndex(events.length - 1)
      setSearchMessage(strings.search.timestampLast)
    } else {
      focusEventByIndex(targetIndex)
    }
  }, [events, focusEventByIndex, parseTimestamp, strings, timestampQuery])

  const handlePreviewFocus = useCallback(
    (id: string) => {
      const index = events.findIndex((event) => event.id === id)
      if (index !== -1) {
        focusEventByIndex(index)
      }
    },
    [events, focusEventByIndex],
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null
      if (activeElement) {
        const tag = activeElement.tagName
        const isEditable = activeElement.getAttribute('contenteditable') === 'true'
        if (isEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          return
        }
      }

      const key = event.key

      if ((key === 'z' || key === 'Z') && event.ctrlKey) {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if ((key === 'y' || key === 'Y') && event.ctrlKey) {
        event.preventDefault()
        redo()
        return
      }

      if ((key === 'a' || key === 'A') && event.ctrlKey) {
        event.preventDefault()
        selectAll()
        return
      }

      if (key === 'Delete') {
        event.preventDefault()
        deleteSelected()
        return
      }

      if ((key === '+' || key === '=') && hasSelection) {
        event.preventDefault()
        addDelayToSelection(10)
        return
      }

      if ((key === '-' || key === '_') && hasSelection) {
        event.preventDefault()
        addDelayToSelection(-10)
        return
      }

      if (key === ' ' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault()
        previewRef.current?.togglePlay()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addDelayToSelection, deleteSelected, hasSelection, redo, selectAll, undo])

  const handleDrop = useCallback<NonNullable<DropzoneOptions['onDrop']>>(
    async (acceptedFiles, _fileRejections, _event) => {
      if (!acceptedFiles.length) {
        return
      }

      await loadFile(acceptedFiles[0])
    },
    [loadFile],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/octet-stream': ['.rec'] },
    maxFiles: 1,
    multiple: false,
    noClick: true,
    onDrop: handleDrop,
  })

  const handleDownload = useCallback(async () => {
    const result = exportRec()
    if (!result) {
      return
    }

    const url = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.fileName
    anchor.click()

    URL.revokeObjectURL(url)
  }, [exportRec])

  const mergeInputRef = useRef<HTMLInputElement>(null)

  const handleMergeClick = useCallback(() => {
    mergeInputRef.current?.click()
  }, [])

  const handleMergeFileChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    async (event) => {
      const files = event.target.files
      if (!files || files.length === 0) {
        return
      }

      await mergeFile(files[0])

      // Reset input so the same file can be selected again if needed
      if (mergeInputRef.current) {
        mergeInputRef.current.value = ''
      }
    },
    [mergeFile],
  )

  const unsupportedMessages = useMemo(() => {
    const unique = new Set<number>()
    events.forEach((entry) => {
      if (!MESSAGE_LABELS[entry.message]) {
        unique.add(entry.message)
      }
    })
    return [...unique]
  }, [events])

  return (
    <div className="app">
      <header>
        <div className="locale-switcher" role="group" aria-label={strings.localeSwitcherLabel}>
          {LOCALE_OPTIONS.map((option) => {
            const isActive = option.key === locale
            return (
              <button
                key={option.key}
                type="button"
                className={`locale-button ${isActive ? 'active' : ''}`}
                onClick={() => setLocale(option.key)}
                aria-pressed={isActive}
                aria-label={strings.localeOptions[option.key]}
              >
                <img src={option.flag} alt={strings.localeOptions[option.key]} className="flag-icon" />
              </button>
            )
          })}
        </div>
        <div className="title-block">
          <h1>{strings.header.title}</h1>
          <p>{strings.header.subtitle}</p>
        </div>
      </header>

      <div {...getRootProps({ className: `dropzone ${isDragActive ? 'active' : ''}` })}>
        <input {...getInputProps()} />
        <p>{isDragActive ? strings.dropzone.active : strings.dropzone.idle}</p>
        <button type="button" onClick={open} disabled={isLoading}>
          {isLoading ? strings.dropzone.loading : strings.dropzone.button}
        </button>
      </div>

      {error && <div className="status error">{error}</div>}
      {isLoading && <div className="status">{strings.status.parsing}</div>}

      {events.length > 0 && (
        <>
          <section className="macro-summary">
            <div>
              <span className="label">{strings.summary.file}</span>
              <span className="value">{fileName}</span>
            </div>
            <div>
              <span className="label">{strings.summary.events}</span>
              <span className="value">{formatNumber(events.length)}</span>
            </div>
            <div>
              <span className="label">{strings.summary.duration}</span>
              <span className="value">{strings.eventTable.timestampMs(duration)}</span>
            </div>
            <div>
              <span className="label">{strings.summary.status}</span>
              <span className={`value ${isDirty ? 'dirty' : 'clean'}`}>
                {isDirty ? strings.summary.modified : strings.summary.original}
              </span>
            </div>
          </section>

          <div className="macro-actions">
            <button type="button" onClick={undo} disabled={!canUndo}>
              {strings.actions.undo}
            </button>
            <button type="button" onClick={redo} disabled={!canRedo}>
              {strings.actions.redo}
            </button>
            <button type="button" onClick={resetChanges} disabled={!isDirty}>
              {strings.actions.reset}
            </button>
            <button type="button" onClick={handleDownload} disabled={!events.length}>
              {strings.actions.download}
            </button>
            <button type="button" onClick={handleMergeClick} disabled={!events.length}>
              {strings.actions.merge}
            </button>
            <input
              type="file"
              ref={mergeInputRef}
              onChange={handleMergeFileChange}
              style={{ display: 'none' }}
              accept=".rec"
            />
          </div>

          {unsupportedMessages.length > 0 && (
            <div className="status warning">
              {strings.status.unknownMessages(
                unsupportedMessages.map((code) => `0x${code.toString(16).toUpperCase()}`).join(', '),
              )}
            </div>
          )}

          <PreviewPane
            ref={previewRef}
            events={events}
            duration={duration}
            focusEventId={primarySelectionId}
            onFocusEvent={handlePreviewFocus}
            onActiveEventChange={setActiveEventId}
            strings={strings.preview}
          />

          <section className="selection-toolbar">
            <div className="selection-summary">
              <span>{strings.selection.summary(selectedCount, visibleSelectedCount, actionFilter !== 'all')}</span>
              <div className="selection-buttons">
                <button type="button" onClick={selectAll} disabled={!events.length}>
                  {strings.selection.buttons.selectAll}
                </button>
                <button type="button" onClick={clearSelection} disabled={!hasSelection}>
                  {strings.selection.buttons.clearSelection}
                </button>
                <button type="button" onClick={deleteSelected} disabled={!hasSelection}>
                  {strings.selection.buttons.deleteSelected}
                </button>
              </div>
            </div>

            <div className="selection-actions">
              <div className="action-group">
                <label htmlFor="set-delay-input">{strings.selection.actions.setDelayLabel}</label>
                <div className="action-controls">
                  <input
                    id="set-delay-input"
                    type="number"
                    value={setDelayValue}
                    onChange={(event) => setSetDelayValue(event.target.value)}
                    placeholder={strings.selection.actions.setDelayPlaceholder}
                  />
                  <button type="button" onClick={handleApplySetDelay} disabled={!hasSelection}>
                    {strings.selection.actions.apply}
                  </button>
                </div>
              </div>

              <div className="action-group">
                <label htmlFor="delta-delay-input">{strings.selection.actions.deltaLabel}</label>
                <div className="action-controls">
                  <input
                    id="delta-delay-input"
                    type="number"
                    value={deltaValue}
                    onChange={(event) => setDeltaValue(event.target.value)}
                    placeholder={strings.selection.actions.deltaPlaceholder}
                  />
                  <button type="button" onClick={handleApplyDelta} disabled={!hasSelection}>
                    {strings.selection.actions.apply}
                  </button>
                </div>
              </div>

              <div className="action-group">
                <label htmlFor="jitter-threshold-input">{strings.selection.actions.clampLabel}</label>
                <div className="action-controls">
                  <input
                    id="jitter-threshold-input"
                    type="number"
                    value={jitterValue}
                    onChange={(event) => setJitterValue(event.target.value)}
                    placeholder={strings.selection.actions.clampPlaceholder}
                  />
                  <button type="button" onClick={handleClampJitter} disabled={!hasSelection}>
                    {strings.selection.actions.clamp}
                  </button>
                </div>
              </div>
            </div>
            <div className="selection-actions insert-actions">
              <span className="group-title">{strings.selection.insert.title}</span>
              <div className="action-group">
                <label htmlFor="add-type-select">{strings.selection.insert.typeLabel}</label>
                <select
                  id="add-type-select"
                  value={addType}
                  onChange={(e) => setAddType(e.target.value as any)}
                >
                  {Object.entries(strings.selection.insert.typeOptions).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {addType === 'keyPress' && (
                <div className="action-group">
                  <label htmlFor="add-key-input">{strings.selection.insert.keyLabel}</label>
                  <input
                    id="add-key-input"
                    type="text"
                    value={describeVirtualKey(addKey)}
                    onKeyDown={handleKeyInputKeyDown}
                    readOnly
                    placeholder="..."
                    autoComplete="off"
                  />
                  <span className="key-preview">Code: {addKey} (0x{addKey.toString(16).toUpperCase()})</span>
                </div>
              )}

              <div className="action-group">
                <label htmlFor="add-delay-input">{strings.selection.insert.delayLabel}</label>
                <input
                  id="add-delay-input"
                  type="number"
                  value={addDelay}
                  onChange={(e) => setAddDelay(e.target.value)}
                />
              </div>

              <button type="button" className="add-button" onClick={handleAddAction}>
                {strings.selection.insert.button}
              </button>
            </div>
          </section>

          <section className="search-toolbar">
            <div className="filter-buttons">
              {strings.filters.options.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={filter.id === actionFilter ? 'active' : ''}
                  onClick={() => handleFilterChange(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {actionFilter === 'keyboard' && (
              <div className="search-group">
                <label htmlFor="keyboard-filter">{strings.filters.keyboardLabel}</label>
                <select
                  id="keyboard-filter"
                  value={keyboardKeyFilter}
                  onChange={(event) => handleKeyboardKeyChange(event.target.value)}
                >
                  <option value="all">{strings.filters.allKeysOption}</option>
                  {availableKeyboardKeys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="search-group">
              <label htmlFor="search-action">{strings.search.actionLabel}</label>
              <div className="search-controls">
                <input
                  id="search-action"
                  type="number"
                  min={1}
                  value={actionQuery}
                  onChange={(event) => setActionQuery(event.target.value)}
                  placeholder={strings.search.actionPlaceholder}
                />
                <button type="button" onClick={handleActionSearch}>
                  {strings.search.actionButton}
                </button>
              </div>
            </div>
            <div className="search-group">
              <label htmlFor="search-timestamp">{strings.search.timestampLabel}</label>
              <div className="search-controls">
                <input
                  id="search-timestamp"
                  type="text"
                  value={timestampQuery}
                  onChange={(event) => setTimestampQuery(event.target.value)}
                  placeholder={strings.search.timestampPlaceholder}
                />
                <button type="button" onClick={handleTimestampSearch}>
                  {strings.search.timestampButton}
                </button>
              </div>
            </div>
            {searchMessage && <div className="search-message">{searchMessage}</div>}
          </section>

          <EventTable
            ref={eventTableRef}
            events={visibleEvents}
            sourceIndexes={visibleIndexes}
            selectedIds={selectedIds}
            visibleSelectedCount={visibleSelectedCount}
            onToggleSelection={toggleSelection}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onDelayChange={updateDelay}
            onDelete={removeEvent}
            strings={strings.eventTable}
            activeEventId={activeEventId}
            delaySortOrder={delaySortOrder}
            onToggleDelaySort={handleToggleDelaySort}
          />
        </>
      )}
    </div>
  )
}

export default App

