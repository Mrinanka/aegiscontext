// What the backup lock does for each hook event, as functions of plain data (spec §5.2, D-070).
// Nothing here reads stdin or writes stdout, so every decision can be tested without Claude Code.
//
// Strict (D-070): before a tool runs, every check applies (saved values, shapes, labels) plus
// self-protection and the overwrite guard. A secret in a prompt blocks the prompt, because a hook cannot
// hide part of one. Tool output is cleaned and keeps its shape. Failed commands are outside the limits:
// the batch hook only stops the request, and the raw error is sent on the next prompt (spike S1, D-068+).
//
// An answer, a reason or a log entry holds a kind and a random tag, never a value.

import nodePath from 'node:path'
import { applyEdit, checkOverwrite } from '../core/guard.ts'
import type { LogEntry } from '../core/log.ts'
import { isChecked, outboundText, outboundVerdict } from '../core/outbound.ts'
import { blockedSettingsChange, expandPath, isProtected, isSettingsFile, settingsAfter, shellChangesProtected, type Roots } from '../core/protect.ts'
import { now } from '../core/decoder.ts'
import type { Hit, Redactor } from '../core/session.ts'
import type { Settings } from '../core/settings.ts'
import { scrubResponse, withholdResponse } from './scrub.ts'

export type Answer = Record<string, unknown> | undefined
export type Decision = { answer: Answer; entries: LogEntry[] }

export type ActEnv = {
  redactor: Redactor
  settings: Settings
  roots: Roots
  /** Time for the checks of one event. */
  budgetMs: number
  /** The file's text; undefined when it is not there; throws when it is there and can't be read. */
  readFile(path: string): string | undefined
  /** The real path of an existing file or folder, links followed, or undefined. */
  realpath(path: string): string | undefined
}

/** Over this a prompt or a tool call is not scanned (R-12): it counts as a failed check. */
export const MAX_TEXT = 4 * 1024 * 1024
const MAX_FILE_CHARS = 4_000_000
const WITHHELD = '[aegiscontext withheld this content: a check could not finish]'
const PREFIX = 'aegiscontext (backup lock)'

type Input = Record<string, unknown>
const isObject = (v: unknown): v is Input => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const named = (hits: readonly Hit[]): string => [...new Set(hits.map(h => `${h.label} #${h.tag}`))].slice(0, 5).join(', ')
const secretsOf = (hits: readonly Hit[]): Hit[] => hits.filter(h => h.action !== 'warn')
const observing = (s: Settings): boolean => s.mode === 'observe'
/** Observe holds nothing (spec §13). */
const holds = (s: Settings): boolean => s.on_check_failure === 'hold' && !observing(s)

const deny = (reason: string): Answer => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })
const ask = (reason: string): Answer => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } })

function entry(env: ActEnv, event: LogEntry['event'], door: string, where: string | undefined, hits: readonly Hit[], action: string, detail?: string): LogEntry[] {
  const mode = env.settings.mode
  if (hits.length === 0) return [{ t: Date.now(), event, door, ...(where === undefined ? {} : { where }), action, mode, ...(detail ? { detail } : {}) }]
  return hits.slice(0, 50).map(h => ({ t: Date.now(), event, door, ...(where === undefined ? {} : { where }), rule: h.ruleId, label: h.label, tag: h.tag, action, mode, ...(detail ? { detail } : {}) }))
}

// ---- failures ---------------------------------------------------------------------------

/** What a check that could not finish does, by event (R-12, spec §12). `response` is the tool's own result, for PostToolUse. */
export function failureAnswer(event: string, settings: Settings, kind: string, response?: unknown): Decision {
  const held = holds(settings)
  const entries: LogEntry[] = [{ t: Date.now(), event: 'failure', door: event, action: held ? 'held' : 'allowed', mode: settings.mode, detail: kind }]
  const warning = `${PREFIX}: a check did not finish (${kind}). It went through unchecked.`
  if (event === 'UserPromptSubmit') {
    return { entries, answer: held ? { decision: 'block', reason: `${PREFIX}: could not finish checking your message (${kind}), so it was not sent. Try again, or send less at once.` } : { systemMessage: warning } }
  }
  if (event === 'PreToolUse') {
    return { entries, answer: held ? deny(`${PREFIX}: a check could not finish (${kind}), so this call was stopped.`) : { systemMessage: warning } }
  }
  if (event === 'PostToolUse') {
    if (held && response !== undefined) {
      return { entries, answer: { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: withholdResponse(response, WITHHELD), additionalContext: `${PREFIX}: a check could not finish, so this output was withheld.` } } }
    }
    return { entries, answer: { systemMessage: warning } }
  }
  return { entries, answer: undefined }
}

// ---- self-protection and the overwrite guard --------------------------------------------

/** Where a path lands, links followed. A path not there yet lands where its nearest existing folder does. */
function landing(env: ActEnv, target: string): string {
  let at = target
  const rest: string[] = []
  for (;;) {
    const real = env.realpath(at)
    if (real !== undefined) return nodePath.join(real, ...rest)
    const parent = nodePath.dirname(at)
    if (parent === at) return target
    rest.unshift(nodePath.basename(at))
    at = parent
  }
}

const given = (tool: string, e: Input): string | undefined => (tool === 'Write' || tool === 'Edit' ? text(e.file_path) : tool === 'NotebookEdit' ? text(e.notebook_path) : undefined)

/** The file a writing tool names, read the way Claude Code expands it (D-098), or nothing for any other tool. */
function pathOf(env: ActEnv, tool: string, e: Input): string | undefined {
  const p = given(tool, e)
  if (!p) return undefined
  const t = p.trim()
  // With no home folder known, a `~` path can't be read where Claude Code will write it: the check has failed (R-12).
  if (env.roots.home === undefined && (t === '~' || t.startsWith('~/'))) throw new Error('no home folder to read a ~ path from')
  // Roots that don't say read a path as this process would: its OS and its working folder.
  return expandPath(p, { home: env.roots.home ?? '~', cwd: env.roots.cwd ?? process.cwd(), windows: env.roots.windows ?? process.platform === 'win32' })
}

const UNCHECKED_SETTINGS = "could not check that change to Claude Code's settings, so it was stopped. Change only the exact text in the file, or ask the user to make the change"

/**
 * Stays on in observe mode (D-058): it is no detection. As in the main lock (D-098), a path is read as Claude Code
 * expands it, a settings change that can't be worked out is refused, and a check that fails refuses: self-protection
 * never fails open.
 */
function protect(env: ActEnv, tool: string, e: Input): string | undefined {
  const shell = tool === 'Bash' || tool === 'PowerShell'
  if (!given(tool, e) && !shell) return undefined
  try {
    if (shell) {
      const what = shellChangesProtected(text(e.command), env.roots)
      return what ? `that command would change ${what}. Only you can do that` : undefined
    }
    const path = pathOf(env, tool, e) as string
    const real = landing(env, path)
    if (isProtected(path, env.roots) || isProtected(real, env.roots)) return "that file belongs to aegiscontext, and Claude can't change it"
    if (!isSettingsFile(path, env.roots) && !isSettingsFile(real, { ...env.roots, config: landing(env, env.roots.config) })) return undefined
    const before = env.readFile(path) ?? ''
    if (before.length > MAX_FILE_CHARS) return UNCHECKED_SETTINGS
    const after = settingsAfter(tool, before, e)
    if (after === undefined) return UNCHECKED_SETTINGS
    const key = blockedSettingsChange(before, after)
    return key ? `that change touches ${key}, which could switch aegiscontext off. Only you can change it` : undefined
  } catch {
    return 'could not check whether that call changes its own files or settings, so it was stopped'
  }
}

// ---- events -----------------------------------------------------------------------------

function onPrompt(input: Input, env: ActEnv): Decision {
  const prompt = input.prompt
  if (typeof prompt !== 'string' || prompt === '') return { answer: undefined, entries: [] }
  if (prompt.length > MAX_TEXT) return failureAnswer('UserPromptSubmit', env.settings, 'too-large')
  const res = env.redactor.redactText(prompt, { deadline: now() + env.budgetMs })
  const hits = secretsOf(res.hits)
  if (hits.length > 0) {
    if (observing(env.settings)) return { answer: undefined, entries: entry(env, 'hide', 'prompt', undefined, hits, 'would-block', 'would have blocked') }
    return {
      answer: { decision: 'block', reason: `${PREFIX}: your message holds a secret (${named(hits)}), so it was not sent. Remove it and send it again.` },
      entries: entry(env, 'block', 'prompt', undefined, hits, 'block'),
    }
  }
  const warned = res.hits.filter(h => h.action === 'warn')
  const warnEntries = warned.length > 0 ? entry(env, 'warn', 'prompt', undefined, warned, 'warn') : []
  if (!res.complete) {
    const f = failureAnswer('UserPromptSubmit', env.settings, 'timeout')
    return { answer: f.answer, entries: [...warnEntries, ...f.entries] }
  }
  return { answer: undefined, entries: warnEntries }
}

function onPreTool(input: Input, env: ActEnv): Decision {
  const tool = text(input.tool_name)
  const e = isObject(input.tool_input) ? input.tool_input : {}
  const stop = (reason: string, what: string): Decision => ({ answer: deny(reason), entries: entry(env, 'block', 'tool', tool, [], 'deny', what) })

  const own = protect(env, tool, e)
  if (own) return stop(`${PREFIX}: ${own}.`, 'self-protection')

  if (isChecked(tool) && env.settings.outbound !== 'off') {
    const body = outboundText(input.tool_input)
    if (body.length > MAX_TEXT) return failureAnswer('PreToolUse', env.settings, 'too-large')
    const res = env.redactor.redactText(body, { deadline: now() + env.budgetMs })
    const hits = secretsOf(res.hits)
    const verdict = outboundVerdict(env.settings.outbound, hits)
    if (verdict !== 'go') {
      if (observing(env.settings)) return { answer: undefined, entries: entry(env, 'notice', 'tool', tool, hits, 'would-block', 'would have blocked: a secret in a tool call') }
      const why = `this ${tool} call holds a secret (${named(hits)})`
      if (verdict === 'block') return { answer: deny(`${PREFIX}: ${why}, so it was stopped. Ask the user to run it themselves.`), entries: entry(env, 'block', 'tool', tool, hits, 'deny', 'a secret in a tool call') }
      if (verdict === 'ask') return { answer: ask(`${PREFIX}: ${why}. Allow it?`), entries: entry(env, 'notice', 'tool', tool, hits, 'ask', 'asked the person about a secret in a tool call') }
      return { answer: { systemMessage: `${PREFIX}: ${why} and was let through, because outbound is warn.` }, entries: entry(env, 'warn', 'tool', tool, hits, 'warn', 'a secret in a tool call') }
    }
    if (!res.complete) return failureAnswer('PreToolUse', env.settings, 'timeout')
  }

  if (given(tool, e)) {
    let blocked: { tags: string[]; complete: boolean }
    try {
      const path = pathOf(env, tool, e) as string
      const disk = env.readFile(path) ?? ''
      if (disk === '') return { answer: undefined, entries: [] }
      if (disk.length > MAX_FILE_CHARS) return failureAnswer('PreToolUse', env.settings, 'guard-too-large')
      const after = tool === 'Edit' ? applyEdit(disk, text(e.old_string), text(e.new_string), e.replace_all === true) : text(tool === 'Write' ? e.content : e.new_source)
      if (after === undefined) return { answer: undefined, entries: [] }
      const out = checkOverwrite(env.redactor, { path, disk, after, deadline: now() + env.budgetMs })
      blocked = { tags: out.blocked ? out.tags : [], complete: out.complete }
    } catch {
      return failureAnswer('PreToolUse', env.settings, 'guard-unreadable')
    }
    if (blocked.tags.length > 0) {
      if (observing(env.settings)) return { answer: undefined, entries: entry(env, 'notice', 'tool', tool, [], 'would-block', 'would have blocked: a real secret would be replaced by its placeholder') }
      return {
        answer: deny(`${PREFIX}: this would replace a real secret in the file with its placeholder, and the secret would be lost. Change only the lines you need and leave placeholder lines alone.`),
        entries: entry(env, 'block', 'tool', tool, [], 'deny', 'a real secret would be replaced by its placeholder'),
      }
    }
    if (!blocked.complete) return failureAnswer('PreToolUse', env.settings, 'guard-timeout')
  }
  return { answer: undefined, entries: [] }
}

function onPostTool(input: Input, env: ActEnv): Decision {
  const tool = text(input.tool_name)
  const response = input.tool_response
  if (response === undefined || response === null) return { answer: undefined, entries: [] }
  const file = tool === 'Read' && isObject(input.tool_input) ? text(input.tool_input.file_path) : ''
  const deadline = now() + env.budgetMs
  const res = scrubResponse(response, s => env.redactor.redactText(s, { deadline, ...(file ? { file } : {}) }))
  const hits = secretsOf(res.hits)
  if (observing(env.settings)) {
    return { answer: undefined, entries: hits.length > 0 ? entry(env, 'hide', 'tool-result', tool, hits, 'would-hide', 'would have hidden') : [] }
  }
  const entries = hits.length > 0 ? entry(env, 'hide', 'tool-result', tool, hits, 'hide') : []
  if (!res.complete) {
    if (holds(env.settings)) {
      const f = failureAnswer('PostToolUse', env.settings, res.oversize ? 'too-large' : 'timeout', response)
      return { answer: f.answer, entries: [...entries, ...f.entries] }
    }
    const f = failureAnswer('PostToolUse', env.settings, res.oversize ? 'too-large' : 'timeout')
    if (res.changed) {
      return {
        answer: { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: res.value, additionalContext: `${PREFIX} hid ${hits.length} value${hits.length === 1 ? '' : 's'} in this output (${named(hits)}), but could not finish checking the rest.` }, systemMessage: String(f.answer?.systemMessage) },
        entries: [...entries, ...f.entries],
      }
    }
    return { answer: f.answer, entries: [...entries, ...f.entries] }
  }
  if (!res.changed) return { answer: undefined, entries }
  return {
    answer: { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: res.value, additionalContext: `${PREFIX} hid ${hits.length} value${hits.length === 1 ? '' : 's'} in this output (${named(hits)}).` } },
    entries,
  }
}

export function decide(input: Input, env: ActEnv): Decision {
  switch (input.hook_event_name) {
    case 'UserPromptSubmit': return onPrompt(input, env)
    case 'PreToolUse': return onPreTool(input, env)
    case 'PostToolUse': return onPostTool(input, env)
    default: return { answer: undefined, entries: [] }
  }
}
