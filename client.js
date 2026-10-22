window.__ModuleLoader__.load({
  id: 'dsh-action-float',
  factory(require) {
    const React = require('react')
    const { useEffect, useRef, useState } = React
    const h = React.createElement

    const NS = 'dsh-action-float'
    const STORAGE_KEY = 'dsh.action-float.settings.v1'
    const MAX_ACTIVE_ROWS = 5
    const MAX_PENDING_ROWS = 24
    const RECENT_MS = 15_000
    // Stable mode: only the composer dock is used. The custom chat-node path
    // is disabled because it touched Conversation projections and could blank
    // the chat view.
    const USE_INLINE_CHAT_NODE = false
    const ANCHORED_DOCK = true
    const POSITIONS = ['top-right', 'top-left', 'bottom-right', 'above-composer']

    const DEFAULTS = Object.freeze({
      position: 'above-composer',
      fontSize: 12,
      dwellMs: 6000,
      speedMs: 1200,
    })

    const ZH = {
      settingsTitle: 'dsh-action-float',
      settingsDescription:
        'AI 修改文件或执行命令时，自动在当前对话回复区域上方或输入框上方选择更高的位置，显示真实操作与逐行 diff。最多同时 5 行；默认使用文字光晕和径向底衬，悬停显示完整文本框。',
      scope: '应用范围',
      scopeAll: '所有会话',
      scopeSession: '当前会话',
      noSession: '当前没有打开的会话',
      sessionShort: '会话 {id}',
      overridden: '此会话已有独立设置',
      position: '浮现位置',
      fixedPosition: '自动停在当前对话回复块顶部或输入框顶部上方（取更高者），不修改原页面排版。最多同时显示 5 行，悬停出现完整文本框。',
      posTopRight: '任务区右上',
      posTopLeft: '任务区左上',
      posBottomRight: '任务区右下',
      posAboveComposer: '输入框上方',
      fontSize: '字号',
      dwell: '停留时间',
      speed: '动画速度',
      seconds: '{n} 秒',
      milliseconds: '{n} 毫秒',
      preview: '预览',
      previewHint: '实际效果会缓慢上移并淡出，悬停暂停。',
      reset: '恢复默认',
      resetSession: '清除此会话设置',
      localOnly: '设置立即生效，仅保存在本机浏览器。',
      hint: '悬停暂停 · 点击查看完整内容',
      offline: '连接中断，正在重连…',
      detail: '操作详情',
      close: '关闭',
      loading: '加载中…',
      unavailable: '内容已失效，可能已超出会话缓存。',
      command: '命令',
      output: '输出',
      success: '成功',
      failed: '失败',
      running: '运行中',
      noOutput: '（无输出）',
      summaryRows: '其余 {n} 行已合并',
      queueSummary: '另有 {n} 行操作已折叠',
      added: '+{n}',
      removed: '−{n}',
      approx: '片段行号',
      truncated: '内容过长，已截断',
      diffTitle: '文件改动',
      commandTitle: '命令执行',
      openHint: '点击查看完整内容',
      more: '更多',
    }

    const EN = {
      settingsTitle: 'dsh-action-float',
      settingsDescription:
        'While the AI runs commands or edits files, it picks the higher of the current reply area and the composer, then shows real operations and line diffs there. Up to 5 rows; theme halo and radial scrim by default, full text box on hover.',
      scope: 'Scope',
      scopeAll: 'All sessions',
      scopeSession: 'This session',
      noSession: 'No session is open',
      sessionShort: 'Session {id}',
      overridden: 'This session has its own settings',
      position: 'Position',
      fixedPosition: 'Automatically sits above the higher of the current reply block and the composer, without changing page layout. Up to 5 rows; the full text box appears on hover.',
      posTopRight: 'Task area, top right',
      posTopLeft: 'Task area, top left',
      posBottomRight: 'Task area, bottom right',
      posAboveComposer: 'Above composer',
      fontSize: 'Font size',
      dwell: 'Dwell time',
      speed: 'Animation speed',
      seconds: '{n} s',
      milliseconds: '{n} ms',
      preview: 'Preview',
      previewHint: 'Rows drift upward and fade; hover pauses them.',
      reset: 'Reset',
      resetSession: 'Clear session override',
      localOnly: 'Changes apply immediately and stay in this browser.',
      hint: 'Hover to pause · click for full content',
      offline: 'Reconnecting…',
      detail: 'Action detail',
      close: 'Close',
      loading: 'Loading…',
      unavailable: 'Content is no longer available in this session cache.',
      command: 'Command',
      output: 'Output',
      success: 'Succeeded',
      failed: 'Failed',
      running: 'Running',
      noOutput: '(no output)',
      summaryRows: '{n} more lines folded',
      queueSummary: '{n} more queued lines folded',
      added: '+{n}',
      removed: '−{n}',
      approx: 'fragment lines',
      truncated: 'Content was truncated',
      diffTitle: 'File change',
      commandTitle: 'Command',
      openHint: 'Click for full content',
      more: 'more',
    }

    let translate = (key) => {
      if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')) {
        return ZH[key] ?? key
      }
      return EN[key] ?? key
    }
    let sessionsService

    function t(key) {
      return translate(key)
    }

    function tf(key, values) {
      return String(t(key)).replace(/\{(\w+)\}/g, (_, name) => {
        const value = values?.[name]
        return value === undefined ? `{${name}}` : String(value)
      })
    }

    function clampNumber(value, min, max, fallback) {
      const number = Number(value)
      if (!Number.isFinite(number)) return fallback
      return Math.min(max, Math.max(min, Math.round(number)))
    }

    function normalizeSettings(raw) {
      const input = raw && typeof raw === 'object' ? raw : {}
      return {
        position: POSITIONS.includes(input.position) ? input.position : DEFAULTS.position,
        fontSize: clampNumber(input.fontSize, 9, 20, DEFAULTS.fontSize),
        dwellMs: clampNumber(input.dwellMs, 2000, 15_000, DEFAULTS.dwellMs),
        speedMs: clampNumber(input.speedMs, 400, 4000, DEFAULTS.speedMs),
      }
    }

    function readStoredSettings() {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return null
        const raw = window.localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    }

    function makeStore() {
      const saved = readStoredSettings()
      const defaults = normalizeSettings(saved?.defaults ?? saved)
      const sessions = Object.create(null)
      if (saved?.sessions && typeof saved.sessions === 'object') {
        for (const [sessionId, value] of Object.entries(saved.sessions)) {
          if (typeof sessionId === 'string' && sessionId.length <= 200) {
            sessions[sessionId] = normalizeSettings(value)
          }
        }
      }
      return { v: 1, defaults, sessions }
    }

    let settingsStore = makeStore()
    const settingsListeners = new Set()

    function persistSettings() {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsStore))
      } catch {
        /* storage can be unavailable in private contexts */
      }
    }

    function emitSettings() {
      for (const listener of settingsListeners) {
        try {
          listener()
        } catch {
          /* a listener must not break the others */
        }
      }
    }

    function resolveSettings(sessionId) {
      const base = settingsStore.defaults
      const override =
        sessionId && Object.prototype.hasOwnProperty.call(settingsStore.sessions, sessionId)
          ? settingsStore.sessions[sessionId]
          : undefined
      return override ? { ...base, ...override } : { ...base }
    }

    function hasSessionOverride(sessionId) {
      return Boolean(
        sessionId && Object.prototype.hasOwnProperty.call(settingsStore.sessions, sessionId),
      )
    }

    function updateSettings(sessionId, patch) {
      if (sessionId) {
        settingsStore.sessions[sessionId] = {
          ...resolveSettings(sessionId),
          ...patch,
        }
        const keys = Object.keys(settingsStore.sessions)
        if (keys.length > 40) delete settingsStore.sessions[keys[0]]
      } else {
        settingsStore.defaults = { ...settingsStore.defaults, ...patch }
      }
      persistSettings()
      emitSettings()
    }

    function resetSettings(sessionId) {
      if (sessionId) delete settingsStore.sessions[sessionId]
      else settingsStore.defaults = { ...DEFAULTS }
      persistSettings()
      emitSettings()
    }

    function subscribeSettings(listener) {
      settingsListeners.add(listener)
      return () => settingsListeners.delete(listener)
    }

    function useSettings(sessionId) {
      const [value, setValue] = useState(() => resolveSettings(sessionId))
      useEffect(() => {
        setValue(resolveSettings(sessionId))
        return subscribeSettings(() => setValue(resolveSettings(sessionId)))
      }, [sessionId])
      return value
    }

    function currentSessionId() {
      try {
        const snapshot = sessionsService?.list?.getSnapshot?.()
        if (!snapshot?.byId) return undefined
        const found = Object.values(snapshot.byId).find(
          (entry) => (entry?.retainedBy?.mainView ?? 0) > 0,
        )
        return found?.id ? String(found.id) : undefined
      } catch {
        return undefined
      }
    }

    function apiUrl(path, query) {
      const base = new URL(`/action-float/${path}`, document.baseURI)
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null) base.searchParams.set(key, String(value))
      }
      return base.toString()
    }

    function formatDuration(ms) {
      if (!Number.isFinite(ms) || ms < 0) return ''
      if (ms < 1000) return `${Math.round(ms)}ms`
      const seconds = ms / 1000
      return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
    }

    function displayCommand(command) {
      return String(command ?? '')
        .replace(/\r?\n/g, ' ⏎ ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function durationSuffix(ms) {
      return Number.isFinite(ms) ? ` · ${formatDuration(ms)}` : ''
    }

    function markFor(unit) {
      if (unit.kind === 'command') {
        if (unit.phase === 'start') return '›'
        return unit.isError ? '!' : '✓'
      }
      if (unit.rowType === 'add') return '+'
      if (unit.rowType === 'del') return '−'
      return '…'
    }

    function toneFor(unit) {
      if (unit.kind === 'command') {
        if (unit.phase === 'start') return 'running'
        return unit.isError ? 'error' : 'ok'
      }
      if (unit.rowType === 'add') return 'add'
      if (unit.rowType === 'del') return 'del'
      return 'summary'
    }

    function commandUnit(event) {
      return {
        uid: `${event.id}:${event.phase}:${event.updatedAt ?? event.ts}`,
        eventId: event.id,
        kind: 'command',
        phase: event.phase,
        pinned: event.phase === 'start',
        command: event.command ?? '',
        title: event.title ?? '',
        description: event.description ?? '',
        cwd: event.cwd ?? '',
        isError: event.isError === true,
        exitCode: event.exitCode,
        durationMs: event.durationMs,
        ts: event.ts,
        detail: true,
      }
    }

    function diffUnit(event, row, index) {
      const line = row.type === 'del' ? row.oldLine : row.newLine
      return {
        uid: `${event.id}:row:${index}`,
        eventId: event.id,
        kind: 'diff',
        rowType: row.type,
        text: row.text,
        omitted: row.omitted ?? 0,
        name: event.name ?? '',
        path: event.path ?? '',
        approx: event.approx === true,
        oldLine: row.oldLine,
        newLine: row.newLine,
        line,
        added: event.added ?? 0,
        removed: event.removed ?? 0,
        ts: event.ts,
        pinned: false,
        detail: true,
      }
    }

    function overflowUnit(count) {
      return {
        uid: `overflow:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        eventId: '',
        kind: 'diff',
        rowType: 'summary',
        text: '',
        omitted: count,
        name: '',
        path: '',
        added: 0,
        removed: 0,
        ts: Date.now(),
        pinned: false,
        detail: false,
      }
    }

    function Row(props) {
      const { unit, settings, paused, onExpire, onOpen } = props
      const pinned = unit.pinned === true
      const total = Math.max(1200, settings.dwellMs + settings.speedMs)
      const [progress, setProgress] = useState(0)
      const pausedRef = useRef(paused)
      const expireRef = useRef(onExpire)
      pausedRef.current = paused
      expireRef.current = onExpire

      useEffect(() => {
        if (pinned) {
          setProgress(0)
          return undefined
        }
        let frame = 0
        let origin = performance.now()
        let pausedAt = 0
        let pausedFor = 0
        let done = false
        const tick = (now) => {
          if (pausedRef.current) {
            if (pausedAt === 0) pausedAt = now
            frame = window.requestAnimationFrame(tick)
            return
          }
          if (pausedAt !== 0) {
            pausedFor += now - pausedAt
            pausedAt = 0
          }
          const value = Math.min(1, Math.max(0, (now - origin - pausedFor) / total))
          setProgress(value)
          if (value >= 1) {
            if (!done) {
              done = true
              expireRef.current(unit.uid)
            }
            return
          }
          frame = window.requestAnimationFrame(tick)
        }
        setProgress(0)
        frame = window.requestAnimationFrame(tick)
        return () => window.cancelAnimationFrame(frame)
      }, [unit.uid, pinned, total])

      const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const fadeStart = Math.min(0.92, Math.max(0.15, settings.dwellMs / total))
      const fadeIn = Math.min(1, progress / 0.06)
      const fadeOut =
        progress <= fadeStart
          ? 1
          : Math.max(0, 1 - (progress - fadeStart) / (1 - fadeStart))
      const opacity = pinned ? 1 : Math.min(fadeIn, fadeOut)
      const offset = pinned || reduceMotion ? 0 : 6 - 22 * progress

      const tone = toneFor(unit)
      const mark = markFor(unit)
      let fileLabel = ''
      let code = ''
      let status = ''
      let title = ''

      if (unit.kind === 'command') {
        code = displayCommand(unit.command || unit.title)
        status =
          unit.phase === 'start'
            ? t('running')
            : `${unit.isError ? t('failed') : t('success')}${durationSuffix(unit.durationMs)}`
        title = unit.command || unit.title
      } else if (unit.rowType === 'summary') {
        code = tf(unit.eventId ? 'summaryRows' : 'queueSummary', { n: unit.omitted ?? 0 })
        status =
          unit.eventId && (unit.added || unit.removed)
            ? `${tf('added', { n: unit.added })} ${tf('removed', { n: unit.removed })}`
            : ''
      } else {
        const line = unit.line
        fileLabel = `${unit.approx ? '~' : ''}${unit.name || unit.path}${
          line ? `:${line}` : ''
        }`
        code = unit.text
        status = unit.approx ? t('approx') : ''
        title = `${unit.path}${line ? `:${line}` : ''}`
      }

      const aria = [unit.kind === 'command' ? t('commandTitle') : t('diffTitle'), fileLabel, code, status]
        .filter(Boolean)
        .join(' · ')

      return h(
        'button',
        {
          type: 'button',
          className: `dsh-af-row af-${tone}${pinned ? ' af-pinned' : ''}${
            props.hidden ? ' af-inline-hidden' : ''
          }`,
          style: {
            opacity,
            transform: `translate3d(0, ${offset.toFixed(2)}px, 0)`,
          },
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => {
            if (unit.detail && unit.eventId) onOpen(unit)
          },
          title: title || code,
          'aria-label': aria,
        },
        h(
          'span',
          { className: 'af-line' },
          h('span', { className: 'af-mark', 'aria-hidden': 'true' }, mark),
          fileLabel
            ? h('span', { className: 'af-file', title: unit.path }, fileLabel)
            : null,
          h('span', { className: unit.kind === 'command' ? 'af-cmd' : 'af-code' }, code),
          status ? h('span', { className: 'af-status' }, status) : null,
        ),
      )
    }

    function DetailPanel(props) {
      const { state, settings, onClose, panelRef } = props
      const panelStyle = { '--af-fs': `${settings.fontSize}px` }

      if (state.loading) {
        return h(
          'section',
          {
            className: 'dsh-af-detail',
            style: panelStyle,
            role: 'dialog',
            'aria-label': t('detail'),
            ref: panelRef,
          },
          h(
            'header',
            { className: 'af-dhead' },
            h('span', { className: 'af-dtitle' }, t('loading')),
            h(closeButton, { onClose }),
          ),
          h('div', { className: 'af-dbody' }, h('div', { className: 'af-empty' }, t('loading'))),
        )
      }

      if (state.error || !state.event) {
        return h(
          'section',
          {
            className: 'dsh-af-detail',
            style: panelStyle,
            role: 'dialog',
            'aria-label': t('detail'),
            ref: panelRef,
          },
          h(
            'header',
            { className: 'af-dhead' },
            h('span', { className: 'af-dtitle' }, t('unavailable')),
            h(closeButton, { onClose }),
          ),
          h('div', { className: 'af-dbody' }, h('div', { className: 'af-empty' }, t('unavailable'))),
        )
      }

      const event = state.event
      if (event.kind === 'command') {
        const status = event.isError ? t('failed') : t('success')
        return h(
          'section',
          {
            className: 'dsh-af-detail',
            style: panelStyle,
            role: 'dialog',
            'aria-label': t('detail'),
            ref: panelRef,
          },
          h(
            'header',
            { className: 'af-dhead' },
            h(
              'div',
              { className: 'af-dheadtext' },
              h('span', { className: 'af-dtitle' }, t('commandTitle')),
              h(
                'span',
                { className: `af-dmeta ${event.isError ? 'af-error-text' : 'af-ok-text'}` },
                `${status}${durationSuffix(event.durationMs)}${
                  event.exitCode !== null && event.exitCode !== undefined
                    ? ` · exit ${event.exitCode}`
                    : ''
                }`,
              ),
            ),
            h(closeButton, { onClose }),
          ),
          h(
            'div',
            { className: 'af-dbody' },
            h('pre', { className: 'af-pre af-pre-command' }, event.command || ''),
            h('div', { className: 'af-dlabel' }, t('output')),
            h('pre', { className: 'af-pre' }, event.output || t('noOutput')),
          ),
        )
      }

      return h(
        'section',
        {
          className: 'dsh-af-detail',
          style: panelStyle,
          role: 'dialog',
          'aria-label': t('detail'),
          ref: panelRef,
        },
        h(
          'header',
          { className: 'af-dhead' },
          h(
            'div',
            { className: 'af-dheadtext' },
            h('span', { className: 'af-dtitle', title: event.path }, `${event.name || event.path}`),
            h('span', { className: 'af-dpath', title: event.path }, event.path),
            h(
              'span',
              { className: 'af-dmeta' },
              h('span', { className: 'af-add-text' }, tf('added', { n: event.added ?? 0 })),
              ' ',
              h('span', { className: 'af-del-text' }, tf('removed', { n: event.removed ?? 0 })),
              event.truncated ? ` · ${t('truncated')}` : '',
            ),
          ),
          h(closeButton, { onClose }),
        ),
        h(
          'div',
          { className: 'af-dbody' },
          (event.rows ?? []).map((row, index) => {
            if (row.type === 'summary') {
              return h(
                'div',
                { className: 'af-dr af-dr-summary', key: `s${index}` },
                h('span', { className: 'af-dln' }, '…'),
                h('span', { className: 'af-dsign' }, ''),
                h('span', { className: 'af-dcode' }, tf('summaryRows', { n: row.omitted ?? 0 })),
              )
            }
            const number = row.type === 'del' ? row.oldLine : row.newLine
            return h(
              'div',
              { className: `af-dr af-${row.type === 'add' ? 'add' : 'del'}`, key: `r${index}` },
              h('span', { className: 'af-dln' }, number ?? ''),
              h('span', { className: 'af-dsign' }, row.type === 'add' ? '+' : '−'),
              h('span', { className: 'af-dcode' }, row.text ?? ''),
            )
          }),
        ),
      )
    }

    function closeButton(props) {
      return h(
        'button',
        {
          type: 'button',
          className: 'af-close',
          'aria-label': t('close'),
          title: t('close'),
          tabIndex: 0,
          onMouseDown: (event) => event.preventDefault(),
          onClick: props.onClose,
        },
        '×',
      )
    }

    function Overlay(props) {
      const inline = props.inline === true
      const anchored = props.anchored === true || (!inline && ANCHORED_DOCK)
      const collapseRows = props.collapseRows === true
      const sessionId = props.sessionId
        ? String(props.sessionId)
        : props.session?.id
          ? String(props.session.id)
          : undefined
      const settings = useSettings(sessionId)
      const [active, setActive] = useState([])
      const [pendingCount, setPendingCount] = useState(0)
      const [hover, setHover] = useState(false)
      const [detail, setDetail] = useState(null)
      const [connected, setConnected] = useState(true)
      const [anchorBox, setAnchorBox] = useState(null)
      const [composerBox, setComposerBox] = useState(null)
      const unitsRef = useRef(new Map())
      const pendingRef = useRef([])
      const seenRef = useRef(new Set())
      const panelRef = useRef(null)
      const sessionRef = useRef(sessionId)
      sessionRef.current = sessionId
      const detailRequest = useRef(0)

      const refreshActive = () => setActive(Array.from(unitsRef.current.values()))
      const bumpPending = () => setPendingCount(pendingRef.current.length)

      const findUnit = (eventId) => {
        for (const [uid, unit] of unitsRef.current) {
          if (unit.eventId === eventId) return { uid, unit }
        }
        return undefined
      }

      const pushUnit = (unit) => {
        if (unitsRef.current.size >= MAX_ACTIVE_ROWS) {
          let dropUid
          for (const [uid, candidate] of unitsRef.current) {
            if (!candidate.pinned) {
              dropUid = uid
              break
            }
          }
          if (dropUid === undefined) return false
          unitsRef.current.delete(dropUid)
        }
        unitsRef.current.set(unit.uid, unit)
        refreshActive()
        return true
      }

      const replaceCommand = (unit) => {
        const found = findUnit(unit.eventId)
        if (found) {
          unitsRef.current.set(found.uid, { ...unit, uid: found.uid })
          refreshActive()
          return
        }
        const pendingIndex = pendingRef.current.findIndex(
          (candidate) => candidate.kind === 'command' && candidate.eventId === unit.eventId,
        )
        if (pendingIndex !== -1) {
          pendingRef.current[pendingIndex] = unit
          bumpPending()
          return
        }
        pushUnit(unit)
      }

      const enqueueUnits = (units) => {
        if (units.length === 0) return
        pendingRef.current.push(...units)
        if (pendingRef.current.length > MAX_PENDING_ROWS) {
          const extra = pendingRef.current.length - MAX_PENDING_ROWS + 1
          pendingRef.current.splice(0, extra)
          pendingRef.current.push(overflowUnit(extra))
        }
        bumpPending()
      }

      const handleEvent = (event, fromSnapshot) => {
        if (!event || typeof event.id !== 'string') return
        if (event.kind === 'command') {
          const unit = commandUnit(event)
          if (event.phase === 'start') {
            replaceCommand(unit)
            return
          }
          const found = findUnit(event.id)
          if (found) {
            unitsRef.current.set(found.uid, { ...unit, uid: found.uid })
            refreshActive()
            return
          }
          if (fromSnapshot && Date.now() - event.ts > RECENT_MS) return
          replaceCommand(unit)
          return
        }
        if (event.kind !== 'diff') return
        if (seenRef.current.has(event.id)) return
        seenRef.current.add(event.id)
        if (seenRef.current.size > 300) {
          seenRef.current.delete(seenRef.current.values().next().value)
        }
        if (fromSnapshot && Date.now() - event.ts > RECENT_MS) return
        enqueueUnits((event.rows ?? []).map((row, index) => diffUnit(event, row, index)))
      }

      useEffect(() => {
        unitsRef.current.clear()
        pendingRef.current = []
        seenRef.current = new Set()
        detailRequest.current += 1
        setActive([])
        setPendingCount(0)
        setDetail(null)
        setHover(false)
        setConnected(true)
      }, [sessionId])

      useEffect(() => {
        if (!sessionId || typeof document === 'undefined') return undefined
        if (typeof EventSource === 'undefined') {
          setConnected(false)
          return undefined
        }
        let source = null
        let retryTimer = 0
        let attempt = 0
        let closed = false

        const schedule = () => {
          if (closed) return
          if (retryTimer !== 0) window.clearTimeout(retryTimer)
          const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempt, 4))
          attempt += 1
          retryTimer = window.setTimeout(open, delay)
        }

        const open = () => {
          if (closed) return
          retryTimer = 0
          let current
          try {
            current = new EventSource(apiUrl('events', { session: sessionId }))
          } catch {
            setConnected(false)
            schedule()
            return
          }
          source = current
          const onSnapshot = (message) => {
            try {
              const data = JSON.parse(message.data)
              setConnected(true)
              attempt = 0
              for (const event of data.events ?? []) handleEvent(event, true)
            } catch {
              /* malformed frames are ignored */
            }
          }
          const onAction = (message) => {
            try {
              const data = JSON.parse(message.data)
              if (data?.event) handleEvent(data.event, false)
            } catch {
              /* malformed frames are ignored */
            }
          }
          current.addEventListener('snapshot', onSnapshot)
          current.addEventListener('action', onAction)
          current.onopen = () => {
            if (closed) return
            setConnected(true)
          }
          current.onerror = () => {
            if (closed) return
            setConnected(false)
            try {
              current.close()
            } catch {
              /* already closed */
            }
            if (source === current) source = null
            schedule()
          }
        }

        open()
        return () => {
          closed = true
          if (retryTimer !== 0) window.clearTimeout(retryTimer)
          if (source !== null) {
            source.close()
            source = null
          }
        }
      }, [sessionId])

      useEffect(() => {
        if (active.length === 0) setHover(false)
      }, [active.length])

      useEffect(() => {
        if (active.length >= MAX_ACTIVE_ROWS || pendingCount === 0) return undefined
        const timer = window.setTimeout(() => {
          if (unitsRef.current.size >= MAX_ACTIVE_ROWS) return
          const next = pendingRef.current.shift()
          if (!next) return
          if (!pushUnit(next)) {
            pendingRef.current.unshift(next)
            bumpPending()
            return
          }
          bumpPending()
        }, Math.max(80, Math.min(260, Math.round(settings.speedMs / 8))))
        return () => window.clearTimeout(timer)
      }, [active.length, pendingCount, settings.speedMs])

      useEffect(() => {
        if (!detail) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') {
            detailRequest.current += 1
            setDetail(null)
            setHover(false)
          }
        }
        const onPointer = (event) => {
          if (panelRef.current && !panelRef.current.contains(event.target)) {
            detailRequest.current += 1
            setDetail(null)
            setHover(false)
          }
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPointer, true)
        return () => {
          document.removeEventListener('keydown', onKey)
          document.removeEventListener('pointerdown', onPointer, true)
        }
      }, [detail])

      useEffect(() => {
        return () => {
          detailRequest.current += 1
        }
      }, [])

      const removeUnit = (uid) => {
        if (!unitsRef.current.has(uid)) return
        unitsRef.current.delete(uid)
        refreshActive()
      }

      const openDetail = async (unit) => {
        if (!unit.eventId || !sessionId) return
        const request = detailRequest.current + 1
        detailRequest.current = request
        setDetail({ loading: true })
        try {
          const response = await fetch(apiUrl('detail', { session: sessionId, id: unit.eventId }), {
            cache: 'no-store',
            credentials: 'same-origin',
          })
          if (!response.ok) throw new Error(String(response.status))
          const event = await response.json()
          if (detailRequest.current === request && sessionRef.current === sessionId) {
            setDetail({ loading: false, event })
          }
        } catch {
          if (detailRequest.current === request && sessionRef.current === sessionId) {
            setDetail({ loading: false, error: true })
          }
        }
      }

      const open = Boolean(detail) || active.length > 0

      useEffect(() => {
        if (!anchored || !open || typeof document === 'undefined') return undefined
        const find = () => {
          try {
            let composerRect = null
            const card = document.querySelector('[data-composer-card]')
            if (card) {
              const rect = card.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) {
                composerRect = rect
                const next = {
                  left: Math.round(rect.left),
                  width: Math.round(rect.width),
                  top: Math.round(rect.top),
                }
                setComposerBox((current) => {
                  if (
                    current &&
                    Math.abs(current.left - next.left) < 1 &&
                    Math.abs(current.width - next.width) < 1 &&
                    Math.abs(current.top - next.top) < 1
                  ) {
                    return current
                  }
                  return next
                })
              }
            } else {
              setComposerBox(null)
            }

            const users = Array.from(
              document.querySelectorAll(
                '[data-chat-flow-kind="user"][data-chat-turn]',
              ),
            )
              .map((element) => {
                const rect = element.getBoundingClientRect()
                return {
                  element,
                  turn: Number(element.getAttribute('data-chat-turn')),
                  rect,
                }
              })
              .filter((entry) => entry.rect.width > 0 && entry.rect.height > 0)
            const user = users.reduce((best, entry) => {
              if (!Number.isFinite(entry.turn)) return best
              if (best === null) return entry
              return entry.turn > best.turn ? entry : best
            }, null)

            let replyBlock = null
            if (user) {
              replyBlock = Array.from(
                document.querySelectorAll('[data-chat-turn]'),
              )
                .map((element) => {
                  const rect = element.getBoundingClientRect()
                  return {
                    element,
                    turn: Number(element.getAttribute('data-chat-turn')),
                    kind: element.getAttribute('data-chat-flow-kind'),
                    rect,
                  }
                })
                .filter(
                  (entry) =>
                    entry.turn === user.turn &&
                    entry.kind !== 'user' &&
                    entry.rect.width > 0 &&
                    entry.rect.height > 0 &&
                    entry.rect.top >= user.rect.bottom + 1,
                )
                .sort((left, right) => left.rect.top - right.rect.top)[0]
            }

            const candidates = []
            if (replyBlock) candidates.push(replyBlock.rect.top)
            if (composerRect) candidates.push(composerRect.top)
            if (candidates.length === 0) {
              setAnchorBox(null)
              return
            }

            // Single placement rule: above the higher of the in-progress
            // reply's top edge and the composer's top edge.
            const anchorTop = Math.max(12, Math.min(...candidates))
            const frame = composerRect ?? replyBlock.rect ?? user.rect
            const next = {
              left: Math.round(frame.left),
              width: Math.round(frame.width),
              bottom: Math.round(window.innerHeight - anchorTop + 8),
            }
            setAnchorBox((current) => {
              if (
                current &&
                Math.abs(current.left - next.left) < 1 &&
                Math.abs(current.width - next.width) < 1 &&
                Math.abs((current.bottom ?? -1) - next.bottom) < 1
              ) {
                return current
              }
              return next
            })
          } catch {
            setAnchorBox(null)
            setComposerBox(null)
          }
        }
        find()
        const timer = window.setInterval(find, 250)
        window.addEventListener('resize', find)
        document.addEventListener('scroll', find, true)
        return () => {
          window.clearInterval(timer)
          window.removeEventListener('resize', find)
          document.removeEventListener('scroll', find, true)
        }
      }, [anchored, open])

      if (!open) return null

      const shellStyle = { '--af-fs': `${settings.fontSize}px` }
      if (anchored && anchorBox) {
        shellStyle.left = `${anchorBox.left}px`
        shellStyle.width = `${anchorBox.width}px`
        if (anchorBox.bottom !== undefined) {
          shellStyle.bottom = `${anchorBox.bottom}px`
          shellStyle.top = 'auto'
        } else {
          shellStyle.top = `${anchorBox.top}px`
          shellStyle.bottom = 'auto'
        }
        shellStyle.right = 'auto'
        shellStyle.transform = 'none'
      } else if (anchored) {
        // No current-turn gap is available: align exactly with the composer
        // card and sit just above it.
        if (composerBox) {
          shellStyle.left = `${composerBox.left}px`
          shellStyle.width = `${composerBox.width}px`
          shellStyle.bottom = `${window.innerHeight - composerBox.top + 8}px`
          shellStyle.top = 'auto'
          shellStyle.right = 'auto'
          shellStyle.transform = 'none'
        } else {
          shellStyle.left = '50%'
          shellStyle.width =
            'min(var(--dsh-composer-card-max-width, 760px), calc(100vw - 32px))'
          shellStyle.bottom = '128px'
          shellStyle.top = 'auto'
          shellStyle.right = 'auto'
          shellStyle.transform = 'translateX(-50%)'
        }
      }

      const shell = h(
        'div',
        {
          className: `dsh-action-float-shell${
            inline
              ? ' af-inline'
              : anchored
                ? ' af-inline af-anchored'
                : ` af-pos-${settings.position}`
          }`,
          style: shellStyle,
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
        },
        detail
          ? h(DetailPanel, {
              state: detail,
              settings,
              onClose: () => {
                detailRequest.current += 1
                setDetail(null)
                setHover(false)
              },
              panelRef,
            })
          : h(
              React.Fragment,
              null,
              active.map((unit, index) =>
                h(Row, {
                  key: unit.uid,
                  unit,
                  settings,
                  paused: hover || Boolean(detail),
                  hidden:
                    (inline || collapseRows) &&
                    !hover &&
                    index !== active.length - 1,
                  onExpire: removeUnit,
                  onOpen: openDetail,
                }),
              ),
              !inline && !anchored && hover
                ? h(
                    'div',
                    { className: 'af-hint', 'aria-hidden': 'true' },
                    t('hint'),
                  )
                : null,
              !connected
                ? h(
                    'div',
                    { className: 'af-offline', 'aria-hidden': 'true' },
                    t('offline'),
                  )
                : null,
            ),
      )
      if (inline) {
        return h('div', { className: 'dsh-action-float-anchor' }, shell)
      }
      return shell
    }

    function latestTurnOf(snapshot) {
      const items = snapshot?.navigation?.items?.() ?? []
      const nodes = snapshot?.nodes
      for (let index = items.length - 1; index >= 0 && index >= items.length - 6; index -= 1) {
        const key = items[index]?.anchorKey
        if (key === undefined) continue
        const node = nodes?.get ? nodes.get(key) : nodes?.[key]
        const location = node?.location
        if (location?.kind === 'turn' || location?.kind === 'step') {
          return location.turn.turn
        }
      }
      return undefined
    }

    function ActionFloatNode(props) {
      const turn = Number(props.node?.data?.turn)
      const latest = props.useChat ? props.useChat(latestTurnOf) : undefined
      if (!Number.isFinite(turn) || !props.useChat) return null
      if (Number(latest) !== turn) return null
      return h(Overlay, { sessionId: props.sessionId, inline: true })
    }

    function Segmented(props) {
      return h(
        'div',
        { className: 'af-seg', role: 'group', 'aria-label': props.label },
        props.options.map((option) =>
          h(
            'button',
            {
              type: 'button',
              key: option.value,
              disabled: option.disabled === true,
              'aria-pressed': props.value === option.value,
              onClick: () => props.onChange(option.value),
            },
            option.label,
          ),
        ),
      )
    }

    function Slider(props) {
      return h(
        'div',
        { className: 'af-slider-wrap' },
        h(
          'div',
          { className: 'af-label' },
          h('span', null, props.label),
          h('span', { className: 'af-value' }, props.format(props.value)),
        ),
        h('input', {
          className: 'af-range',
          type: 'range',
          min: props.min,
          max: props.max,
          step: props.step,
          value: props.value,
          'aria-label': props.label,
          onChange: (event) => props.onChange(Number(event.target.value)),
        }),
      )
    }

    function Preview(props) {
      const settings = props.settings
      return h(
        'div',
        { className: 'af-preview', style: { '--af-fs': `${settings.fontSize}px` } },
        h(
          'div',
          { className: 'af-prov af-add' },
          h('span', { className: 'af-mark' }, '+'),
          h('span', { className: 'af-file' }, 'app.ts:42'),
          h('span', { className: 'af-code' }, 'const answer = 42'),
        ),
        h(
          'div',
          { className: 'af-prov af-del' },
          h('span', { className: 'af-mark' }, '−'),
          h('span', { className: 'af-file' }, 'app.ts:42'),
          h('span', { className: 'af-code' }, 'const answer = 41'),
        ),
        h(
          'div',
          { className: 'af-prov af-running' },
          h('span', { className: 'af-mark' }, '›'),
          h('span', { className: 'af-cmd' }, 'pwsh -Command "npm test"'),
          h('span', { className: 'af-status' }, t('running')),
        ),
        h(
          'div',
          { className: 'af-prov af-error' },
          h('span', { className: 'af-mark' }, '!'),
          h('span', { className: 'af-cmd' }, 'pwsh -Command "npm test"'),
          h('span', { className: 'af-status' }, t('failed')),
        ),
        h('div', { className: 'af-note' }, t('previewHint')),
      )
    }

    function Settings() {
      const [scope, setScope] = useState('all')
      const [sessionId, setSessionId] = useState(() => currentSessionId())
      const effectiveSession = scope === 'session' && sessionId ? sessionId : undefined
      const settings = useSettings(effectiveSession)

      useEffect(() => {
        const timer = window.setInterval(() => {
          setSessionId(currentSessionId())
        }, 1500)
        return () => window.clearInterval(timer)
      }, [])

      useEffect(() => {
        if (!sessionId && scope === 'session') setScope('all')
      }, [sessionId, scope])

      const update = (patch) => updateSettings(effectiveSession, patch)

      return h(
        'section',
        { className: 'dsh-action-float-settings' },
        h('h2', { className: 'af-h2' }, t('settingsTitle')),
        h('p', { className: 'af-desc' }, t('settingsDescription')),

        h(
          'div',
          { className: 'af-group' },
          h('div', { className: 'af-label' }, h('span', null, t('scope'))),
          h(Segmented, {
            label: t('scope'),
            value: scope,
            onChange: setScope,
            options: [
              { value: 'all', label: t('scopeAll') },
              {
                value: 'session',
                disabled: !sessionId,
                label: sessionId
                  ? `${t('scopeSession')} · ${String(sessionId).slice(-8)}`
                  : t('scopeSession'),
              },
            ],
          }),
          !sessionId
            ? h('p', { className: 'af-note' }, t('noSession'))
            : effectiveSession && hasSessionOverride(effectiveSession)
              ? h('p', { className: 'af-note' }, t('overridden'))
              : null,
        ),

        h(
          'div',
          { className: 'af-group' },
          h('div', { className: 'af-label' }, h('span', null, t('position'))),
          h('p', { className: 'af-note' }, t('fixedPosition')),
        ),

        h(
          'div',
          { className: 'af-group af-two' },
          h(Slider, {
            label: t('fontSize'),
            min: 9,
            max: 20,
            step: 1,
            value: settings.fontSize,
            format: (value) => `${value}px`,
            onChange: (value) => update({ fontSize: value }),
          }),
          h(Slider, {
            label: t('dwell'),
            min: 2000,
            max: 15_000,
            step: 500,
            value: settings.dwellMs,
            format: (value) => tf('seconds', { n: (value / 1000).toFixed(1).replace(/\.0$/, '') }),
            onChange: (value) => update({ dwellMs: value }),
          }),
        ),

        h(
          'div',
          { className: 'af-group' },
          h(Slider, {
            label: t('speed'),
            min: 400,
            max: 4000,
            step: 100,
            value: settings.speedMs,
            format: (value) => tf('milliseconds', { n: value }),
            onChange: (value) => update({ speedMs: value }),
          }),
        ),

        h(
          'div',
          { className: 'af-group' },
          h('div', { className: 'af-label' }, h('span', null, t('preview'))),
          h(Preview, { settings }),
        ),

        h(
          'div',
          { className: 'af-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'af-reset',
              onClick: () => resetSettings(effectiveSession),
            },
            effectiveSession ? t('resetSession') : t('reset'),
          ),
          h('span', { className: 'af-note' }, t('localOnly')),
        ),
      )
    }

    const CSS = `
      .dsh-action-float-shell {
        position: fixed;
        z-index: 45;
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: min(760px, calc(100vw - 32px));
        width: min(var(--dsh-composer-card-max-width, 760px), calc(100vw - 32px));
        max-height: 70vh;
        pointer-events: none;
        color: var(--dsw-alias-label-primary);
        font-family: inherit;
        --af-fs: 12px;
      }
      .dsh-action-float-anchor {
        position: relative;
        width: 100%;
        height: 0;
        margin: 0;
        padding: 0;
        overflow: visible;
        pointer-events: none;
      }
      .dsh-action-float-shell.af-inline {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        z-index: 10;
        width: 100%;
        max-height: none;
        margin: 0;
        align-items: stretch;
      }
      .dsh-action-float-shell.af-anchored {
        position: fixed;
        z-index: 45;
        max-height: 70vh;
      }
      .dsh-action-float-shell.af-inline .af-inline-hidden {
        display: none;
      }
      .dsh-action-float-shell.af-inline .dsh-af-row {
        width: 100%;
        min-height: 20px;
        padding: 0;
        border: 0;
        background: transparent;
        backdrop-filter: none;
        text-shadow: none;
      }
      .dsh-action-float-shell.af-inline .af-line {
        position: relative;
        isolation: isolate;
        display: flex;
        align-items: center;
        gap: 8px;
        width: max-content;
        max-width: 100%;
        min-height: 20px;
        box-sizing: border-box;
        padding: 2px 6px;
        overflow: hidden;
        border: 1px solid transparent;
        border-left: 3px solid transparent;
        border-radius: 9px;
        color: var(--dsw-alias-label-primary);
        font-size: var(--af-fs);
        line-height: 1.45;
        text-align: left;
        text-shadow:
          0 0 1px var(--dsw-alias-bg-base),
          0 1px 2px var(--dsw-alias-bg-base);
        transition: border-color 120ms ease, background-color 120ms ease;
      }
      .dsh-action-float-shell.af-inline .af-line::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        border-radius: inherit;
        background: radial-gradient(
          ellipse 74% 130% at 50% 50%,
          color-mix(in srgb, var(--dsw-alias-bg-base) 74%, transparent) 0%,
          color-mix(in srgb, var(--dsw-alias-bg-base) 48%, transparent) 42%,
          transparent 82%
        );
        backdrop-filter: blur(5px);
        -webkit-mask-image: radial-gradient(
          ellipse 74% 130% at 50% 50%,
          #000 0%,
          #000 44%,
          transparent 82%
        );
        mask-image: radial-gradient(
          ellipse 74% 130% at 50% 50%,
          #000 0%,
          #000 44%,
          transparent 82%
        );
      }
      .dsh-action-float-shell.af-inline .af-line::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        border-radius: inherit;
        background: radial-gradient(
          ellipse 74% 130% at 50% 50%,
          color-mix(in srgb, var(--dsw-alias-bg-base) 74%, transparent) 0%,
          color-mix(in srgb, var(--dsw-alias-bg-base) 48%, transparent) 42%,
          transparent 82%
        );
      }
      .dsh-action-float-shell.af-inline .af-line > * {
        position: relative;
        z-index: 1;
      }
      .dsh-action-float-shell.af-inline .dsh-af-row .af-file,
      .dsh-action-float-shell.af-inline .dsh-af-row .af-status,
      .dsh-action-float-shell.af-inline .dsh-af-row.af-summary .af-code {
        color: var(--dsw-alias-label-primary);
      }
      .dsh-action-float-shell.af-inline .dsh-af-row.af-running .af-status {
        color: var(--dsw-alias-brand-primary);
      }
      .dsh-action-float-shell.af-inline .dsh-af-row.af-ok .af-status {
        color: var(--dsw-alias-state-success-primary);
      }
      .dsh-action-float-shell.af-inline .dsh-af-row.af-error .af-status {
        color: var(--dsw-alias-state-warn-primary);
      }
      .dsh-action-float-shell.af-inline .dsh-af-row .af-code,
      .dsh-action-float-shell.af-inline .dsh-af-row .af-cmd {
        font-weight: 500;
      }
      .dsh-action-float-shell.af-inline:hover .af-line,
      .dsh-action-float-shell.af-inline .dsh-af-row:hover .af-line {
        border-color: var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-overlay);
        backdrop-filter: blur(12px);
      }
      .dsh-action-float-shell.af-inline:hover .af-line::before,
      .dsh-action-float-shell.af-inline .dsh-af-row:hover .af-line::before,
      .dsh-action-float-shell.af-inline:hover .af-line::after,
      .dsh-action-float-shell.af-inline .dsh-af-row:hover .af-line::after {
        opacity: 0;
      }
      .dsh-action-float-shell.af-inline:hover .dsh-af-row.af-add .af-line,
      .dsh-action-float-shell.af-inline .dsh-af-row.af-add:hover .af-line {
        border-left-color: var(--dsw-alias-state-success-primary);
      }
      .dsh-action-float-shell.af-inline:hover .dsh-af-row.af-del .af-line,
      .dsh-action-float-shell.af-inline .dsh-af-row.af-del:hover .af-line {
        border-left-color: var(--dsw-alias-state-error-primary);
      }
      .dsh-action-float-shell.af-inline:hover .dsh-af-row.af-running .af-line,
      .dsh-action-float-shell.af-inline .dsh-af-row.af-running:hover .af-line {
        border-left-color: var(--dsw-alias-brand-primary);
      }
      .dsh-action-float-shell.af-inline:hover .dsh-af-row.af-ok .af-line,
      .dsh-action-float-shell.af-inline .dsh-af-row.af-ok:hover .af-line {
        border-left-color: var(--dsw-alias-state-success-primary);
      }
      .dsh-action-float-shell.af-inline:hover .dsh-af-row.af-error .af-line,
      .dsh-action-float-shell.af-inline .dsh-af-row.af-error:hover .af-line {
        border-left-color: var(--dsw-alias-state-warn-primary);
      }
      .dsh-action-float-shell.af-inline:hover .dsh-af-row.af-summary .af-line,
      .dsh-action-float-shell.af-inline .dsh-af-row.af-summary:hover .af-line {
        border-left-color: var(--dsw-alias-border-l2);
      }
      .dsh-action-float-shell.af-inline .dsh-af-detail {
        width: 100%;
      }
      .dsh-action-float-shell.af-pos-top-right { top: 84px; right: 20px; align-items: flex-end; }
      .dsh-action-float-shell.af-pos-top-left { top: 84px; left: 20px; align-items: flex-start; }
      .dsh-action-float-shell.af-pos-bottom-right { bottom: 132px; right: 20px; align-items: flex-end; }
      .dsh-action-float-shell.af-pos-above-composer {
        bottom: 128px;
        left: 50%;
        transform: translateX(-50%);
        align-items: center;
      }

      .dsh-af-row {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 30px;
        padding: 6px 10px;
        box-sizing: border-box;
        border: 1px solid var(--dsw-alias-border-l1);
        border-left-width: 3px;
        border-radius: 9px;
        background: var(--dsw-alias-bg-overlay);
        background: color-mix(in srgb, var(--dsw-alias-bg-overlay) 92%, transparent);
        color: var(--dsw-alias-label-primary);
        font-family: inherit;
        font-size: var(--af-fs);
        line-height: 1.45;
        text-align: left;
        cursor: pointer;
        appearance: none;
        backdrop-filter: blur(12px);
        will-change: transform, opacity;
        transition: border-color 120ms ease, background-color 120ms ease;
      }
      .dsh-af-row:hover { border-color: var(--dsw-alias-border-l2); }
      .dsh-af-row:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 2px;
      }
      .dsh-af-row .af-mark {
        flex: 0 0 14px;
        font-weight: 700;
        font-size: 1.05em;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .dsh-af-row .af-file {
        flex: 0 1 auto;
        max-width: 44%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-secondary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.86em;
      }
      .dsh-af-row .af-code, .dsh-af-row .af-cmd {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.96em;
      }
      .dsh-af-row .af-status {
        flex: 0 0 auto;
        max-width: 34%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-secondary);
        font-size: 0.8em;
      }
      .dsh-af-row.af-add { border-left-color: var(--dsw-alias-state-success-primary); }
      .dsh-af-row.af-add .af-mark, .dsh-af-row.af-add .af-code { color: var(--dsw-alias-state-success-primary); }
      .dsh-af-row.af-del { border-left-color: var(--dsw-alias-state-error-primary); }
      .dsh-af-row.af-del .af-mark, .dsh-af-row.af-del .af-code { color: var(--dsw-alias-state-error-primary); }
      .dsh-af-row.af-running { border-left-color: var(--dsw-alias-brand-primary); }
      .dsh-af-row.af-running .af-mark, .dsh-af-row.af-running .af-cmd { color: var(--dsw-alias-brand-primary); }
      .dsh-af-row.af-running .af-status { color: var(--dsw-alias-brand-primary); }
      .dsh-af-row.af-ok { border-left-color: var(--dsw-alias-state-success-primary); }
      .dsh-af-row.af-ok .af-mark, .dsh-af-row.af-ok .af-status { color: var(--dsw-alias-state-success-primary); }
      .dsh-af-row.af-error { border-left-color: var(--dsw-alias-state-warn-primary); }
      .dsh-af-row.af-error .af-mark, .dsh-af-row.af-error .af-cmd, .dsh-af-row.af-error .af-status {
        color: var(--dsw-alias-state-warn-primary);
      }
      .dsh-af-row.af-summary { border-left-color: var(--dsw-alias-border-l2); }
      .dsh-af-row.af-summary .af-code { color: var(--dsw-alias-label-secondary); font-family: inherit; }
      .dsh-af-row.af-summary .af-status { font-variant-numeric: tabular-nums; }
      .dsh-af-row.af-pinned .af-mark { animation: af-pulse 1.4s ease-in-out infinite; }

      @keyframes af-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .af-hint, .af-offline {
        pointer-events: none;
        padding: 2px 9px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 99px;
        background: var(--dsw-alias-bg-overlay);
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        line-height: 1.5;
      }

      .dsh-af-detail {
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: none;
        max-height: 68vh;
        overflow: hidden;
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 12px;
        background: var(--dsw-alias-bg-overlay);
        color: var(--dsw-alias-label-primary);
        box-shadow: 0 12px 40px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);
      }
      .af-dhead {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px 10px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
      }
      .af-dheadtext { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
      .af-dtitle {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 600;
      }
      .af-dpath {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-secondary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 10.5px;
      }
      .af-dmeta { color: var(--dsw-alias-label-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
      .af-add-text { color: var(--dsw-alias-state-success-primary); }
      .af-del-text { color: var(--dsw-alias-state-error-primary); }
      .af-ok-text { color: var(--dsw-alias-state-success-primary); }
      .af-error-text { color: var(--dsw-alias-state-warn-primary); }
      .af-close {
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 7px;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
      }
      .af-close:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
      .af-dbody { overflow: auto; padding: 8px 0 12px; }
      .af-empty { padding: 20px 14px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .af-dlabel {
        padding: 10px 14px 4px;
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        font-weight: 600;
      }
      .af-dr {
        display: flex;
        gap: 8px;
        padding: 3px 14px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--af-fs);
        line-height: 1.45;
      }
      .af-dr .af-dln {
        flex: 0 0 42px;
        color: var(--dsw-alias-label-secondary);
        text-align: right;
        user-select: none;
      }
      .af-dr .af-dsign { flex: 0 0 12px; font-weight: 700; }
      .af-dr .af-dcode { flex: 1 1 auto; min-width: 0; white-space: pre-wrap; word-break: break-word; }
      .af-dr.af-add { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent); }
      .af-dr.af-add .af-dsign, .af-dr.af-add .af-dcode { color: var(--dsw-alias-state-success-primary); }
      .af-dr.af-del { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
      .af-dr.af-del .af-dsign, .af-dr.af-del .af-dcode { color: var(--dsw-alias-state-error-primary); }
      .af-dr.af-dr-summary { color: var(--dsw-alias-label-secondary); font-family: inherit; }
      .af-pre {
        margin: 6px 14px;
        padding: 10px 12px;
        max-height: 26vh;
        overflow: auto;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--af-fs);
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .af-pre-command { border-left: 3px solid var(--dsw-alias-brand-primary); }
      .af-prov {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--af-fs);
      }
      .af-prov .af-mark { flex: 0 0 14px; font-weight: 700; text-align: center; }
      .af-prov .af-file { color: var(--dsw-alias-label-secondary); font-size: 0.86em; }
      .af-prov .af-code, .af-prov .af-cmd { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .af-prov .af-status { color: var(--dsw-alias-label-secondary); font-size: 0.8em; }
      .af-prov.af-add .af-mark, .af-prov.af-add .af-code { color: var(--dsw-alias-state-success-primary); }
      .af-prov.af-del .af-mark, .af-prov.af-del .af-code { color: var(--dsw-alias-state-error-primary); }
      .af-prov.af-running .af-mark, .af-prov.af-running .af-cmd { color: var(--dsw-alias-brand-primary); }
      .af-prov.af-error .af-mark, .af-prov.af-error .af-cmd, .af-prov.af-error .af-status {
        color: var(--dsw-alias-state-warn-primary);
      }

      .dsh-action-float-settings {
        max-width: 720px;
        padding: 4px 2px 36px;
        color: var(--dsw-alias-label-primary);
        font-size: 13px;
      }
      .af-h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
      .af-desc { margin: 0 0 22px; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.65; }
      .af-group { margin: 0 0 18px; padding: 0 0 18px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .af-group:last-of-type { border-bottom: 0; }
      .af-label {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin: 0 0 9px;
        font-size: 12.5px;
        font-weight: 600;
      }
      .af-value { color: var(--dsw-alias-label-secondary); font-weight: 500; font-variant-numeric: tabular-nums; }
      .af-note { margin: 8px 0 0; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.6; }
      .af-seg { display: flex; flex-wrap: wrap; gap: 6px; }
      .af-seg button {
        appearance: none;
        padding: 6px 10px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 7px;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      .af-seg button:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
      .af-seg button:disabled { opacity: 0.45; cursor: not-allowed; }
      .af-seg button:disabled:hover { border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
      .af-seg button[aria-pressed="true"] {
        border-color: var(--dsw-alias-brand-primary);
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
        color: var(--dsw-alias-brand-primary);
      }
      .af-two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .af-slider-wrap { min-width: 0; }
      .af-range { width: 100%; accent-color: var(--dsw-alias-brand-primary); }
      .af-preview {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px 12px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1);
      }
      .af-preview .af-prov { padding: 5px 6px; border-left: 3px solid transparent; border-radius: 6px; }
      .af-preview .af-prov.af-add { border-left-color: var(--dsw-alias-state-success-primary); }
      .af-preview .af-prov.af-del { border-left-color: var(--dsw-alias-state-error-primary); }
      .af-preview .af-prov.af-running { border-left-color: var(--dsw-alias-brand-primary); }
      .af-preview .af-prov.af-error { border-left-color: var(--dsw-alias-state-warn-primary); }
      .af-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 4px; }
      .af-reset {
        appearance: none;
        padding: 6px 11px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 7px;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      .af-reset:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
      .af-actions .af-note { margin: 0; }

      @media (max-width: 560px) {
        .dsh-action-float-shell { width: calc(100vw - 16px); }
        .dsh-action-float-shell.af-pos-top-right, .dsh-action-float-shell.af-pos-bottom-right { right: 8px; }
        .dsh-action-float-shell.af-pos-top-left { left: 8px; }
        .af-two { grid-template-columns: 1fr; }
      }
      @media (prefers-reduced-motion: reduce) {
        .dsh-af-row { transition: none; }
        .dsh-af-row.af-pinned .af-mark { animation: none; }
      }
    `

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (!slots) return
        sessionsService = ctx.get('sessions')

        const locale = ctx.get('locale')
        if (locale) {
          try {
            ctx.effect(
              () => locale.register(NS, { zh: ZH, en: EN }),
              'action-float: locale',
            )
            translate = locale.bind(NS)
          } catch {
            /* keep the built-in Chinese/English fallback */
          }
        }

        ctx.effect(() => {
          if (typeof document === 'undefined') return undefined
          const style = document.createElement('style')
          style.dataset.dshActionFloat = 'true'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => style.remove()
        }, 'action-float: styles')

        const inlineConversation = ctx.get('uiConversation')
        let inlineRegistered = false
        if (USE_INLINE_CHAT_NODE && inlineConversation?.events?.register) {
          try {
            ctx.effect(
              () =>
                inlineConversation.events.register({
                  kind: 'action-float',
                  target: 'chat',
                  match: {
                    'user/message': (event) =>
                      event.type === 'user/message'
                        ? {
                            id: `action-float:${String(event.data.id ?? event.seq)}`,
                            role: 'start',
                          }
                        : null,
                  },
                  start: (_context, match) => {
                    if (match.event.type !== 'user/message') {
                      throw new Error('action-float start requires user/message')
                    }
                    return { seq: match.event.seq }
                  },
                  publication: () => 'immediate',
                  buildLocationData: (context, scope) => {
                    if (scope !== 'turn') return null
                    const start = context.start
                    if (start?.event?.type !== 'user/message') return null
                    const location = start.location ?? context.matches[0]?.location
                    if (location?.kind !== 'turn' && location?.kind !== 'step') return null
                    const turn = location.turn.turn
                    return {
                      kind: 'turn',
                      turn,
                      key: 'action-float',
                      value: { turn },
                    }
                  },
                  buildViewNode: (context) => {
                    const start = context.start
                    if (start?.event?.type !== 'user/message') return null
                    const location = start.location ?? context.matches[0]?.location
                    if (location?.kind !== 'turn' && location?.kind !== 'step') return null
                    return {
                      key: context.key,
                      kind: 'action-float',
                      id: context.id,
                      target: 'chat',
                      anchorSeq: start.event.seq + 0.05,
                      location,
                      visibility: 'visible',
                      groupTree: 'turn',
                      data: { turn: location.turn.turn },
                    }
                  },
                }),
              'action-float: turn node definition',
            )
            ctx.effect(
              () =>
                slots.inject('conversation.chat.node', () =>
                  slots.register(
                    {
                      name: 'conversation.chat.node',
                      key: 'action-float',
                    },
                    ActionFloatNode,
                  ),
                ),
              'action-float: turn node view',
            )
            inlineRegistered = true
          } catch {
            inlineRegistered = false
          }
        }

        if (!inlineRegistered) {
          ctx.effect(
            () =>
              slots.inject('conversation.input.dock', () =>
                slots.register(
                  {
                    name: 'conversation.input.dock',
                    id: NS,
                    order: 5,
                  },
                  Overlay,
                ),
              ),
            'action-float: overlay fallback slot',
          )
        }
        ctx.effect(
          () =>
            slots.inject('settings.section', () =>
              slots.register(
                {
                  name: 'settings.section',
                  id: NS,
                  order: 48,
                  label: () => t('settingsTitle'),
                },
                Settings,
              ),
            ),
          'action-float: settings slot',
        )
      },
    }
  },
})
