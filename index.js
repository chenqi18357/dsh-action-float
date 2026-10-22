/**
 * Action Float — Host half.
 *
 * Observes the tool pipeline and exposes a session-scoped SSE feed. File diffs
 * are taken from the tool's own result projection (or its real result metadata),
 * not guessed from the model's arguments. The Client half renders the feed.
 */
import { compactRows, countRows, detailRows, diffLines } from './diff.js'

export const inject = ['tools', 'webServer', 'connection']

const COMMAND_TOOLS = new Set([
  'bash',
  'pwsh',
  'powershell',
  'shell',
  'sh',
  'exec',
  'run',
  'run_code',
])

const FILE_TOOLS = new Set(['edit', 'write', 'apply_patch', 'multi_edit'])

const MAX_EVENTS = 120
const MAX_SESSIONS = 80
const MAX_OUTPUT = 24_000
const MAX_COMMAND = 16_000
const MAX_ROW_PREVIEW = 600
const MAX_ROW_DETAIL = 4000
const PUBLIC_ROWS = 5
const HEARTBEAT_MS = 15_000

function isKey(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

function sessionIdOf(exec) {
  const id = exec?.agent?.id
  return isKey(id) ? String(id) : undefined
}

function baseName(path) {
  const parts = String(path ?? '').split(/[\\/]/)
  return parts[parts.length - 1] || String(path ?? '')
}

function firstLine(text) {
  const value = String(text ?? '').trim()
  const line = value.split(/\r?\n/, 1)[0] ?? ''
  return line.length > 240 ? `${line.slice(0, 240)}…` : line
}

function clampText(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function safePresentCall(definition, args) {
  try {
    return definition?.presentCall?.(args)
  } catch {
    return undefined
  }
}

function safePresentResult(definition, args, result) {
  try {
    return definition?.presentResult?.(args, result)
  } catch {
    return undefined
  }
}

function isCommand(exec, view) {
  if (COMMAND_TOOLS.has(exec.name)) return true
  if (view?.card === 'terminal') return true
  return view?.kind === 'execute'
}

function commandText(args, view) {
  if (typeof args?.command === 'string' && args.command.trim() !== '') return args.command
  if (typeof args?.code === 'string' && args.code.trim() !== '') return args.code
  if (typeof view?.title === 'string' && view.title.trim() !== '') return view.title
  return ''
}

function contentText(result) {
  const chunks = []
  if (Array.isArray(result?.content)) {
    for (const block of result.content) {
      if (block && block.type === 'text' && typeof block.text === 'string') {
        chunks.push(block.text)
      }
    }
  }
  if (chunks.length > 0) return chunks.join('\n')
  const value = result?.value
  if (value && typeof value === 'object') {
    const stdout = typeof value.stdout?.text === 'string' ? value.stdout.text : ''
    const stderr = typeof value.stderr?.text === 'string' ? value.stderr.text : ''
    return [stdout, stderr].filter(Boolean).join('\n')
  }
  return ''
}

function commandOutcome(result) {
  const value = result?.value
  let exitCode = null
  let failed = result?.isError === true
  if (value && typeof value === 'object') {
    if (value.kind === 'foreground') {
      exitCode = typeof value.exitCode === 'number' ? value.exitCode : null
      if (value.exitCode !== 0) failed = true
      if (value.signal || value.timedOut || value.aborted || value.stopped) failed = true
    }
  }
  return { failed, exitCode }
}

function publicEvent(event) {
  const base = {
    id: event.id,
    seq: event.seq,
    kind: event.kind,
    tool: event.tool,
    phase: event.phase,
    ts: event.ts,
    updatedAt: event.updatedAt,
    isError: event.isError === true,
    hasDetail: true,
  }
  if (event.kind === 'command') {
    return {
      ...base,
      command: clampText(event.command, 800),
      title: event.title,
      description: clampText(event.description, 240),
      cwd: event.cwd,
      exitCode: event.exitCode,
      durationMs: event.durationMs,
      rows: [],
      rowCount: 0,
    }
  }
  return {
    ...base,
    path: event.path,
    name: event.name,
    added: event.added,
    removed: event.removed,
    approx: event.approx === true,
    rows: Array.isArray(event.compact)
      ? event.compact
      : compactRows(event.rows, PUBLIC_ROWS),
    rowCount: event.rowCount,
    truncated: event.truncated === true,
  }
}

function writeSse(res, name, data) {
  if (res.writableEnded || res.destroyed) return false
  try {
    res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
    return true
  } catch {
    return false
  }
}

function sendJson(res, status, body) {
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(JSON.stringify(body))
  } catch {
    /* the peer went away */
  }
}

export function apply(ctx) {
  /** sessionId -> { events, byId, clients, diffCalls } */
  const buckets = new Map()
  /** `${sessionId}:${callId}` -> { sessionId, event } */
  const pendingCommands = new Map()

  function bucketFor(sessionId) {
    let bucket = buckets.get(sessionId)
    if (bucket) return bucket
    bucket = {
      events: [],
      byId: new Map(),
      clients: new Set(),
      diffCalls: new Set(),
      seq: 0,
    }
    buckets.set(sessionId, bucket)
    if (buckets.size > MAX_SESSIONS) {
      for (const [id, candidate] of buckets) {
        if (id !== sessionId && candidate.clients.size === 0) {
          buckets.delete(id)
          break
        }
      }
    }
    return bucket
  }

  function publish(bucket, event, op) {
    const payload = { op, event: publicEvent(event) }
    for (const res of bucket.clients) {
      if (!writeSse(res, 'action', payload)) bucket.clients.delete(res)
    }
  }

  function addEvent(bucket, event) {
    bucket.seq += 1
    event.seq = bucket.seq
    bucket.events.push(event)
    bucket.byId.set(event.id, event)
    while (bucket.events.length > MAX_EVENTS) {
      const removed = bucket.events.shift()
      if (removed) bucket.byId.delete(removed.id)
    }
    publish(bucket, event, 'add')
  }

  function updateEvent(bucket, event) {
    const index = bucket.events.findIndex((candidate) => candidate.id === event.id)
    if (index === -1) {
      addEvent(bucket, event)
      return
    }
    bucket.events[index] = event
    bucket.byId.set(event.id, event)
    publish(bucket, event, 'update')
  }

  function startCommand(exec) {
    const sessionId = sessionIdOf(exec)
    if (sessionId === undefined) return
    const callId = String(exec.callId ?? `${exec.name}:${Date.now()}`)
    const key = `${sessionId}:${callId}`
    if (pendingCommands.has(key)) return

    if (FILE_TOOLS.has(exec.name)) return
    const args = exec.arguments ?? {}
    const definition = ctx.tools.get(exec.name)
    const view = safePresentCall(definition, args)
    if (!isCommand(exec, view)) return

    const command = clampText(commandText(args, view), MAX_COMMAND)
    const now = Date.now()
    const event = {
      id: `cmd:${callId}`,
      seq: 0,
      kind: 'command',
      tool: exec.name,
      phase: 'start',
      ts: now,
      updatedAt: now,
      command,
      title: firstLine(command),
      description: typeof args.description === 'string' ? args.description : '',
      cwd: typeof args.workdir === 'string' ? args.workdir : '',
      exitCode: null,
      durationMs: null,
      isError: false,
      rows: [],
      rowCount: 0,
      output: '',
    }
    pendingCommands.set(key, { sessionId, event })
    addEvent(bucketFor(sessionId), event)
  }

  function finishCommand(exec, result) {
    const sessionId = sessionIdOf(exec)
    const callId = String(exec.callId ?? `${exec.name}:${Date.now()}`)
    const key = sessionId === undefined ? '' : `${sessionId}:${callId}`
    const pending = pendingCommands.get(key)

    if (pending === undefined && FILE_TOOLS.has(exec.name)) return
    const args = exec.arguments ?? {}
    const definition = ctx.tools.get(exec.name)
    const view = safePresentCall(definition, args)
    if (pending === undefined && !isCommand(exec, view)) return
    if (sessionId === undefined && pending === undefined) return

    const targetSession = pending?.sessionId ?? sessionId
    const now = Date.now()
    const outcome = commandOutcome(result)
    const startedAt = pending?.event.ts ?? now
    const event = {
      ...(pending?.event ?? {
        id: `cmd:${callId}`,
        seq: 0,
        kind: 'command',
        tool: exec.name,
        ts: now,
        command: clampText(commandText(args, view), MAX_COMMAND),
        title: firstLine(commandText(args, view)),
        description: typeof args.description === 'string' ? args.description : '',
        cwd: '',
        rows: [],
        rowCount: 0,
      }),
      phase: outcome.failed ? 'error' : 'ok',
      updatedAt: now,
      isError: outcome.failed,
      exitCode: outcome.exitCode,
      durationMs: Math.max(0, now - startedAt),
      output: clampText(contentText(result), MAX_OUTPUT),
    }
    if (pending !== undefined) pendingCommands.delete(key)
    updateEvent(bucketFor(targetSession), event)
  }

  function valueDiffs(exec, result) {
    const value = result?.value
    if (!value || typeof value !== 'object' || typeof value.after !== 'string') return undefined
    const args = exec.arguments ?? {}
    const path =
      typeof value.path === 'string'
        ? value.path
        : typeof args.file_path === 'string'
          ? args.file_path
          : 'file'
    return {
      card: 'diff',
      approx: false,
      diffs: [
        {
          path,
          oldText: typeof value.before === 'string' ? value.before : null,
          newText: value.after,
        },
      ],
    }
  }

  function fallbackDiffs(exec) {
    const args = exec.arguments ?? {}
    if (exec.name === 'write' && typeof args.content === 'string') {
      return {
        approx: false,
        diffs: [
          {
            path: typeof args.file_path === 'string' ? args.file_path : 'file',
            oldText: null,
            newText: args.content,
          },
        ],
      }
    }
    if (
      exec.name === 'edit' &&
      typeof args.old_string === 'string' &&
      typeof args.new_string === 'string'
    ) {
      return {
        approx: true,
        diffs: [
          {
            path: typeof args.file_path === 'string' ? args.file_path : 'file',
            oldText: args.old_string,
            newText: args.new_string,
          },
        ],
      }
    }
    return undefined
  }

  function publishFileDiffs(exec, result) {
    if (result?.isError === true) return
    const sessionId = sessionIdOf(exec)
    if (sessionId === undefined) return
    const callId = String(exec.callId ?? `${exec.name}:${Date.now()}`)
    const bucket = bucketFor(sessionId)
    if (bucket.diffCalls.has(callId)) return

    const args = exec.arguments ?? {}
    const definition = ctx.tools.get(exec.name)
    if (!FILE_TOOLS.has(exec.name)) {
      const callView = safePresentCall(definition, args)
      if (callView?.card !== 'diff') return
    }
    let view = valueDiffs(exec, result)
    let approx = false
    if (view === undefined) {
      view = safePresentResult(definition, args, result)
      // presentResult normally carries hunk snippets, so their line numbers
      // are relative to the hunk; the Client marks those with "~".
      if (view?.card === 'diff' && Array.isArray(view.diffs)) approx = true
    }
    if (!view || view.card !== 'diff' || !Array.isArray(view.diffs)) {
      const fallback = fallbackDiffs(exec)
      if (fallback === undefined) return
      view = { card: 'diff', diffs: fallback.diffs }
      approx = fallback.approx
    }
    if (view.diffs.length === 0) return
    bucket.diffCalls.add(callId)
    if (bucket.diffCalls.size > 500) bucket.diffCalls.clear()

    const now = Date.now()
    let index = 0
    for (const file of view.diffs) {
      if (!file || typeof file.newText !== 'string') continue
      const path = String(file.path ?? view.title ?? args.file_path ?? 'file')
      const rows = diffLines(file.oldText ?? '', file.newText)
      if (rows.length === 0) continue
      const counts = countRows(rows)
      const detail = detailRows(rows)
      const detailView = detail.rows.map((row) => ({
        ...row,
        text: clampText(row.text, MAX_ROW_DETAIL),
      }))
      const preview = compactRows(rows, PUBLIC_ROWS).map((row) => ({
        ...row,
        text: clampText(row.text, MAX_ROW_PREVIEW),
      }))
      const event = {
        id: `diff:${callId}:${index}`,
        seq: 0,
        kind: 'diff',
        tool: exec.name,
        phase: 'ok',
        ts: now + index,
        updatedAt: now + index,
        path,
        name: baseName(path),
        added: counts.added,
        removed: counts.removed,
        approx,
        rows: detailView,
        compact: preview,
        rowCount: rows.length,
        truncated: detail.truncated,
        isError: false,
      }
      index += 1
      addEvent(bucket, event)
    }
  }

  ctx.on('tools/execute', (exec, next) => {
    try {
      startCommand(exec)
    } catch {
      /* observation must never break dispatch */
    }
    return next()
  })

  ctx.on('tools/result', (exec, result) => {
    try {
      finishCommand(exec, result)
    } catch {
      /* observation must never break the pipeline */
    }
    try {
      publishFileDiffs(exec, result)
    } catch {
      /* observation must never break the pipeline */
    }
  })

  function handleEvents(req, res) {
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET' })
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://action-float.local')
    const sessionId = url.searchParams.get('session')
    if (!isKey(sessionId)) {
      sendJson(res, 400, { error: 'invalid session' })
      return
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-content-type-options': 'nosniff',
    })
    res.flushHeaders?.()
    const bucket = bucketFor(sessionId)
    bucket.clients.add(res)

    let closed = false
    const cleanup = () => {
      if (closed) return
      closed = true
      bucket.clients.delete(res)
      try {
        if (!res.writableEnded) res.end()
      } catch {
        /* already closed */
      }
    }
    req.on('close', cleanup)
    res.on('close', cleanup)
    res.on('error', cleanup)

    if (!res.write('retry: 2500\n\n')) {
      cleanup()
      return
    }
    writeSse(res, 'snapshot', {
      sessionId,
      events: bucket.events.slice(-8).map(publicEvent),
    })
  }

  function handleDetail(req, res) {
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET' })
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://action-float.local')
    const sessionId = url.searchParams.get('session')
    const id = url.searchParams.get('id')
    if (!isKey(sessionId) || !isKey(id)) {
      sendJson(res, 400, { error: 'invalid request' })
      return
    }
    const event = bucketFor(sessionId).byId.get(id)
    if (event === undefined) {
      sendJson(res, 404, { error: 'event not found' })
      return
    }
    sendJson(res, 200, {
      ...publicEvent(event),
      command: event.command,
      description: event.description,
      rows: event.rows,
      output: event.output ?? '',
      truncated: event.truncated === true,
    })
  }

  function rejectUnauthenticated(req, res) {
    let rejection
    try {
      rejection = ctx.connection.requestRejection({ headers: req.headers })
    } catch {
      rejection = 403
    }
    if (rejection === undefined) return false
    res.writeHead(rejection, {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    })
    res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
    return true
  }

  function handler(req, res) {
    const url = new URL(req.url ?? '/', 'http://action-float.local')
    if (rejectUnauthenticated(req, res)) return
    if (url.pathname === '/action-float/events') {
      handleEvents(req, res)
      return
    }
    if (url.pathname === '/action-float/detail') {
      handleDetail(req, res)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: '/action-float',
      handler,
    })
    return () => dispose()
  }, 'action-float: http routes')

  ctx.effect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 30 * 60_000
      for (const [key, pending] of pendingCommands) {
        if (pending.event.ts < cutoff) pendingCommands.delete(key)
      }
      for (const bucket of buckets.values()) {
        for (const res of bucket.clients) {
          try {
            if (res.writableEnded || res.destroyed) {
              bucket.clients.delete(res)
            } else {
              res.write(': ping\n\n')
            }
          } catch {
            bucket.clients.delete(res)
          }
        }
      }
    }, HEARTBEAT_MS)
    timer.unref?.()
    return () => clearInterval(timer)
  }, 'action-float: sse heartbeat')

  ctx.effect(() => () => {
    for (const bucket of buckets.values()) {
      for (const res of bucket.clients) {
        try {
          if (!res.writableEnded) res.end()
        } catch {
          /* already closed */
        }
      }
      bucket.clients.clear()
    }
    buckets.clear()
    pendingCommands.clear()
  }, 'action-float: close streams')
}
