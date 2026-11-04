// What each hook does, as functions of `$` and plain data. register.ts wires them to the events and
// owns `next`, `.catch` and the pinned fields. Nothing here writes a secret anywhere: log lines hold
// labels, tags and redacted text only, and the warnings hold no content.

import type { Args, EngineInterface, SessionAppendInput } from 'claude-code'
import { COMMAND, takeMask } from './commands.ts'
import { dropMedia, hasMedia } from './lib/core/media.ts'
import { nextWarning } from './lib/core/versions.ts'
import { refreshBackup } from './backup-copy.ts'
import { emptyCopies } from './mention.ts'
import { addHidden } from './state.ts'
import { now } from './lib/core/decoder.ts'
import type { LogEntry } from './lib/core/log.ts'
import type { Hit } from './lib/core/session.ts'
import { redactRow, withheldRow, type RowMessage } from './lib/core/rows.ts'
import { PLACEHOLDER_NOTE, PUT_BACK_NOTE, PUT_BACK_NOTE_ID } from './lib/core/note.ts'
import { putBackNoteOn } from './putback.ts'
import { pruneLogs, writeLog } from './log-file.ts'
import { markEnded, markRunning } from './marker.ts'
import { failureMode, fileOfTool, ready, rememberToolFile, saveCatches, type Runtime } from './runtime.ts'
import { warn } from './warn.ts'

/** The most CPU one hook spends on checking. The worker is stopped at about 6 s (check 0.6). */
const BUDGET_MS = 4000
const MAX_LOGGED_HITS = 50
const BLOCKED_REASON = 'it holds a secret that the settings say to block'

type Message = SessionAppendInput['message']
type Context = Args<'prompt.context'>
type Block = Context['blocks'][number]

const cleaner = (rt: Runtime) => (text: string): string => rt.redactor.redactText(text, { deadline: now() + 500 }).text

const isObserve = (rt: Runtime): boolean => rt.settings.mode === 'observe'

function entriesFor(rt: Runtime, t: number, door: string, where: string, hits: Hit[]): LogEntry[] {
  const observe = isObserve(rt)
  const out: LogEntry[] = hits.slice(0, MAX_LOGGED_HITS).map(h => ({
    t,
    event: h.action === 'warn' ? 'warn' : h.action === 'block' ? 'block' : 'hide',
    door,
    where,
    rule: h.ruleId,
    label: h.label,
    tag: h.tag,
    action: observe ? `would-${h.action}` : h.action,
    mode: rt.settings.mode,
    ...(observe ? { detail: 'would have hidden' } : {}),
  }))
  if (hits.length > MAX_LOGGED_HITS) out.push({ t, event: 'notice', door, where, detail: `${hits.length - MAX_LOGGED_HITS} more hits in this text` })
  return out
}

async function report($: EngineInterface, rt: Runtime, door: string, where: string, hits: Hit[]): Promise<void> {
  if (hits.length === 0) return
  await writeLog($, entriesFor(rt, await $.clock.now(), door, where, hits), cleaner(rt))
  if (isObserve(rt)) return
  const place = cleaner(rt)(where)
  await addHidden($, hits.filter(h => h.action !== 'warn').map(h => ({ label: h.label, where: place, tag: h.tag, ...(h.hint ? { hint: h.hint } : {}) }))).catch(() => undefined)
}

async function failed($: EngineInterface, rt: Runtime, door: string, where: string, kind: string, held: boolean): Promise<void> {
  warn($, `failure-${kind}`, `a check did not finish (${kind}) on ${where}. ${held ? 'That content was withheld.' : 'What was found is hidden, but the rest went through unchecked.'}`)
  await writeLog($, [{ t: await $.clock.now(), event: 'failure', door, where, action: held ? 'held' : 'allowed', mode: rt.settings.mode, detail: kind }], cleaner(rt))
}

function capWarning($: EngineInterface): void {
  warn($, 'catch-cap', 'the list of values caught this session is full; new ones are still hidden by their shape, but not remembered')
}

function tooLongWarning($: EngineInterface): void {
  warn($, 'catch-too-long', 'a value over 8,192 characters was hidden here, but it is too long to remember, so a copy of it without its label or shape may not be hidden')
}

const whereOf = (e: SessionAppendInput): string => (e.origin.kind === 'tool' ? e.origin.tool : e.door)

/** The tool, and the file a Read named. Redacted by the log before it is written (R-17). */
function whereWithFile(e: SessionAppendInput, message: RowMessage): string {
  const result = message.content.find(b => b.type === 'tool_result' && typeof b.tool_use_id === 'string')
  const file = result ? fileOfTool(result.tool_use_id as string) : undefined
  return file === undefined ? whereOf(e) : `${whereOf(e)} ${file}`
}

/**
 * One log line for a failed hook (R-12). Static words only, so it needs no redactor: a `.catch` has one
 * second, and the worker may have just restarted. A clock that fails must not lose the line.
 */
async function logFailure($: EngineInterface, door: string, where: string, kind: string, held: boolean): Promise<void> {
  const t = await $.clock.now().catch(() => Date.now())
  await writeLog($, [{ t, event: 'failure', door, where, action: held ? 'held' : 'allowed', detail: kind }], text => text)
}

// ---- session.append ---------------------------------------------------------------------

export async function cleanAppend($: EngineInterface, e: SessionAppendInput): Promise<Message> {
  const rt = await ready($)
  const message = maskCommandRow(e)
  if (e.door === 'response') {
    for (const b of message.content) if (b.type === 'tool_use' && typeof b.id === 'string') rememberToolFile(b.id, b.name, b.input)
  }
  const res = redactRow(rt.redactor, message, { deadline: now() + BUDGET_MS, fileOf: fileOfTool })
  await saveCatches($, rt)
  const where = whereWithFile(e, message)
  await report($, rt, e.door, where, res.hits)
  if (res.capped) capWarning($)
  if (res.tooLong) tooLongWarning($)
  if (isObserve(rt)) return message as unknown as Message
  if (res.blocked) return withheldRow(message, BLOCKED_REASON) as unknown as Message
  if (!res.complete) {
    const held = rt.settings.on_check_failure === 'hold'
    await failed($, rt, e.door, where, 'timeout', held)
    if (held) return withheldRow(message, 'a check could not finish') as unknown as Message
  }
  return applyMedia($, rt, res.message) as unknown as Message
}

/** Drops media, or says once that it passes unread (spec §6). */
function applyMedia($: EngineInterface, rt: Runtime, message: RowMessage): RowMessage {
  if (!hasMedia(message)) return message
  if (rt.settings.media === 'drop') return dropMedia(message).message
  if (rt.settings.notices === 'on' && !mediaNoticed) {
    mediaNoticed = true
    warn($, 'media', 'an image or document reached the model. aegiscontext cannot read inside them.')
  }
  return message
}

let mediaNoticed = false

/** A mistaken `/redact add <value>`: the value comes off its command row (D-057). */
function maskCommandRow(e: SessionAppendInput): RowMessage {
  const message = e.message as unknown as RowMessage
  if (e.door !== 'command' || !JSON.stringify(message.content).includes(COMMAND)) return message
  const mask = takeMask()
  if (mask === undefined) return message
  return { ...message, content: message.content.map(b => (b.type === 'text' && typeof b.text === 'string' ? { ...b, text: b.text.split(mask).join('[removed]') } : b)) }
}

/** A failed append hook (R-03, R-12). Reads settings with free `$` calls only: the handler has one second. */
export async function failedAppend($: EngineInterface, e: SessionAppendInput, kind: string): Promise<Message> {
  const held = (await failureMode($)) === 'hold'
  warn($, `failure-${kind}`, `a check failed (${kind}) on ${whereOf(e)}. ${held ? 'That content was withheld.' : 'That content reached the model unchecked.'}`)
  await logFailure($, e.door, whereOf(e), kind, held)
  return held ? (withheldRow(e.message as unknown as RowMessage, 'a check failed') as unknown as Message) : e.message
}

// ---- prompt.submit ----------------------------------------------------------------------

export type SubmitAnswer = { text: string; context?: string[] } | { drop: string }

export async function cleanSubmit($: EngineInterface, e: Args<'prompt.submit'>): Promise<SubmitAnswer> {
  const rt = await ready($)
  const deadline = now() + BUDGET_MS
  const res = rt.redactor.redactText(e.text, { deadline })
  const hits = [...res.hits]
  let complete = res.complete
  let blocked = res.blocked
  let capped = res.capped
  let tooLong = res.tooLong === true
  let context: string[] | undefined
  if (e.context) {
    context = e.context.map(c => {
      const r = rt.redactor.redactText(c, { deadline })
      hits.push(...r.hits)
      if (!r.complete) complete = false
      if (r.blocked) blocked = true
      if (r.capped) capped = true
      if (r.tooLong) tooLong = true
      return r.text
    })
  }
  await saveCatches($, rt)
  await report($, rt, 'prompt', 'prompt', hits)
  if (capped) capWarning($)
  if (tooLong) tooLongWarning($)
  if (isObserve(rt)) return { text: e.text, ...(e.context ? { context: e.context } : {}) }
  if (blocked) return { drop: 'aegiscontext: your message holds a secret that your settings say to block, so it was not sent.' }
  if (!complete) {
    const held = rt.settings.on_check_failure === 'hold'
    await failed($, rt, 'prompt', 'your message', 'timeout', held)
    if (held) return { drop: 'aegiscontext could not finish checking your message, so it was not sent. Try again, or send less at once.' }
  }
  return context ? { text: res.text, context } : { text: res.text }
}

export async function failedSubmit($: EngineInterface, kind: string): Promise<SubmitAnswer | undefined> {
  const held = (await failureMode($)) === 'hold'
  warn($, `failure-${kind}`, `a check failed (${kind}) on your message. ${held ? 'It was not sent.' : 'It went through unchecked.'}`)
  await logFailure($, 'prompt', 'prompt', kind, held)
  return held ? { drop: 'aegiscontext could not check your message, so it was not sent.' } : undefined
}

// ---- prompt.context, prompt.attachment --------------------------------------------------

const ENGINE_BLOCKS = new Set(['userEmail', 'attachedProject', 'currentDate', 'gitStatus', 'perforceMode', 'workerToolsContext'])

export async function cleanContext($: EngineInterface, e: Context): Promise<Block[]> {
  const rt = await ready($)
  const deadline = now() + BUDGET_MS
  const hits: Hit[] = []
  let failedCheck = false
  let capped = false
  let tooLong = false
  const held = rt.settings.on_check_failure === 'hold' && !isObserve(rt)
  const blocks = e.blocks.map(b => {
    const r = rt.redactor.redactText(b.text, { deadline })
    hits.push(...r.hits)
    if (r.capped) capped = true
    if (r.tooLong) tooLong = true
    if (isObserve(rt)) return { name: b.name, text: b.text }
    if (r.blocked) return { name: b.name, text: '' }
    if (!r.complete) {
      failedCheck = true
      if (held) return { name: b.name, text: '' }
    }
    return { name: b.name, text: r.text }
  })
  await saveCatches($, rt)
  await report($, rt, 'context', 'context', hits)
  if (capped) capWarning($)
  if (tooLong) tooLongWarning($)
  if (failedCheck) await failed($, rt, 'context', 'the project context', 'timeout', held)
  return blocks
}

export async function failedContext($: EngineInterface, e: Context, kind: string): Promise<Block[]> {
  const held = (await failureMode($)) === 'hold'
  warn($, `failure-${kind}`, `a check failed (${kind}) on the project context. ${held ? 'Instruction files were withheld.' : 'They reached the model unchecked.'}`)
  await logFailure($, 'context', 'context', kind, held)
  return held ? e.blocks.map(b => (b.name === 'claudeMd' || !ENGINE_BLOCKS.has(b.name) ? { name: b.name, text: '' } : { name: b.name, text: b.text })) : [...e.blocks]
}

const attachmentMemory = new Map<string, { version: number; text: string }>()
const MAX_REMEMBERED = 100
const MAX_REMEMBERED_CHARS = 2_000_000

export async function cleanAttachment($: EngineInterface, e: Args<'prompt.attachment'>): Promise<string> {
  const rt = await ready($)
  // The same attachment is rendered for every request, so a clean result is kept until something new is caught.
  const kept = attachmentMemory.get(e.text)
  if (kept && kept.version === rt.redactor.version) return kept.text
  const res = rt.redactor.redactText(e.text, { deadline: now() + BUDGET_MS })
  await saveCatches($, rt)
  await report($, rt, 'attachment', e.type, res.hits)
  if (res.capped) capWarning($)
  if (res.tooLong) tooLongWarning($)
  if (isObserve(rt)) return e.text
  let text = res.text
  if (res.blocked) text = '[aegiscontext withheld this content: ' + BLOCKED_REASON + ']'
  else if (!res.complete) {
    const held = rt.settings.on_check_failure === 'hold'
    await failed($, rt, 'attachment', e.type, 'timeout', held)
    if (held) text = '[aegiscontext withheld this content: a check could not finish]'
  } else if (e.text.length <= MAX_REMEMBERED_CHARS) {
    if (attachmentMemory.size >= MAX_REMEMBERED) attachmentMemory.delete(attachmentMemory.keys().next().value as string)
    attachmentMemory.set(e.text, { version: rt.redactor.version, text })
  }
  return text
}

export async function failedAttachment($: EngineInterface, e: Args<'prompt.attachment'>, kind: string): Promise<string> {
  const held = (await failureMode($)) === 'hold'
  warn($, `failure-${kind}`, `a check failed (${kind}) on an attachment. ${held ? 'It was withheld.' : 'It reached the model unchecked.'}`)
  await logFailure($, 'attachment', e.type, kind, held)
  return held ? '[aegiscontext withheld this content: a check failed]' : e.text
}

// ---- prompt.compose ---------------------------------------------------------------------

export { PLACEHOLDER_NOTE }

/** The extra note, only in a session that started with put-back on. A failure here must never cost the main note. */
export async function putBackSections($: EngineInterface): Promise<{ id: string; text: string; scope: 'session' }[]> {
  try {
    return (await putBackNoteOn($, await ready($))) ? [{ id: PUT_BACK_NOTE_ID, text: PUT_BACK_NOTE, scope: 'session' as const }] : []
  } catch {
    return []
  }
}

export async function failedCompose($: EngineInterface, kind: string): Promise<void> {
  warn($, 'compose', 'could not add its note about hidden values to the instructions')
  await logFailure($, 'compose', 'compose', kind, false)
}

// ---- session start and end --------------------------------------------------------------

export async function startUp($: EngineInterface): Promise<void> {
  const rt = await ready($)
  await markRunning($)
  await registerCommands($)
  await pruneLogs($, rt.settings.log.days)
  await keepBackupCurrent($, rt)
  await emptyCopies($)
  await versionNotice($)
  if (isObserve(rt)) {
    warn($, 'observe', OBSERVE_BANNER)
    $.ui.status(OBSERVE_BANNER)
  }
  await writeLog($, [{ t: await $.clock.now(), event: 'start', mode: rt.settings.mode, detail: 'aegiscontext started' }], cleaner(rt))
}

/**
 * R-01 (D-103): an untested Claude Code version warns on its first WARN_SESSIONS session starts, then only in
 * `/redact doctor`. The record holds version strings only. If it can't be read, the warning shows.
 */
async function versionNotice($: EngineInterface): Promise<void> {
  const version = (await $.session.version()).version
  const stored = await $.store.get(VERSION_WARNED).catch(() => undefined)
  const { line, warned } = nextWarning(version, stored)
  if (!line) return
  warn($, 'version', line)
  await $.store.set(VERSION_WARNED, warned).catch(() => undefined)
}

const VERSION_WARNED = 'versionWarned'

/** An existing stable copy of the backup lock is brought up to date; a session never creates one (D-068). */
async function keepBackupCurrent($: EngineInterface, rt: Runtime): Promise<void> {
  const out = await refreshBackup($)
  if (out === 'refreshed') await writeLog($, [{ t: await $.clock.now(), event: 'notice', door: 'backup', detail: 'the backup lock copy was refreshed' }], cleaner(rt))
  if (out === 'failed') {
    warn($, 'backup-refresh', 'the backup lock copy could not be refreshed; run /redact backup')
    await writeLog($, [{ t: await $.clock.now(), event: 'failure', door: 'backup', detail: 'refresh failed' }], cleaner(rt))
  }
}

export async function shutDown($: EngineInterface): Promise<void> {
  await markEnded($)
  await emptyCopies($)
}

export const OBSERVE_BANNER = 'OBSERVE MODE, secrets are NOT being hidden'

/** A command that can't be registered must never stop a row or a prompt being cleaned. */
export async function registerCommands($: EngineInterface): Promise<void> {
  try {
    await $.command.register({ name: COMMAND, description: 'aegiscontext: status, add, learn, remove, allow, put-back, self-check, doctor', argumentHint: '[add|learn|remove|allow|put-back|self-check|doctor]' })
  } catch {
    warn($, 'command', 'could not register /redact; hiding carries on')
  }
}

export async function observing($: EngineInterface): Promise<boolean> {
  return isObserve(await ready($))
}

export { ready }

/** After /clear the process goes on under a new id, and no session.start fires for it. */
export async function stillRunning($: EngineInterface): Promise<void> {
  await markRunning($)
  const session = await $.session.id()
  if (session !== commandsFor) {
    commandsFor = session
    await registerCommands($)
  }
}

let commandsFor: string | undefined

/** A failed hook that guards a call rather than a row (R-12): the log says what really happened. */
export async function failedGate($: EngineInterface, door: string, what: string, kind: string, held: boolean): Promise<void> {
  warn($, `failure-${kind}`, `a check failed (${kind}) on ${what}. ${held ? 'It was stopped.' : 'It went ahead unchecked.'}`)
  await logFailure($, door, door, kind, held)
}

export async function failedLifecycle($: EngineInterface, door: string, kind: string): Promise<void> {
  warn($, `failure-${door}`, `could not finish its ${door} step (${kind}); hiding carries on`)
  await logFailure($, door, door, kind, false)
}
