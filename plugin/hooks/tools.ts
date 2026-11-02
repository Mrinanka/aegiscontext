// What happens around a tool call: self-protection (spec §17), the outbound check (§11), the overwrite
// guard and the placeholder notice (§10). A refusal names a tag and a kind, never a value.

import type { EngineInterface } from 'claude-code'
import { osOf } from './backends.ts'
import { now } from './lib/core/decoder.ts'
import { applyEdit, checkOverwrite, placeholdersIn } from './lib/core/guard.ts'
import { isChecked, outboundText, outboundVerdict } from './lib/core/outbound.ts'
import { blockedSettingsChange, isProtected, isSettingsFile, shellChangesProtected, type Roots } from './lib/core/protect.ts'
import { restoreInput } from './lib/core/putback.ts'
import type { Hit } from './lib/core/session.ts'
import { writeLog } from './log-file.ts'
import { configDir, dataDir } from './paths.ts'
import { putBackNow, repoNotice } from './putback.ts'
import { ready, type Runtime } from './runtime.ts'
import { addPlaced, guardPass, setGuardPass } from './state.ts'
import { warn } from './warn.ts'

const BUDGET_MS = 3000
const MAX_FILE_CHARS = 4_000_000

type Input = Record<string, unknown>
const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The file a writing tool names, or nothing for any other tool. */
const pathOf = (tool: string, e: Input): string | undefined => (tool === 'Write' || tool === 'Edit' ? text(e.file_path) : tool === 'NotebookEdit' ? text(e.notebook_path) : undefined)

/**
 * Where a path lands, links followed. A file not there yet lands where its nearest existing folder does,
 * because a Write creates what is missing.
 */
async function landing($: EngineInterface, path: string): Promise<string> {
  let at = path
  let rest = ''
  for (;;) {
    const real = (await $.fs.stat(at, { resolve: true }).catch(() => undefined))?.realPath
    if (real !== undefined) return `${real.replace(/[\\/]$/, '')}${rest}`
    const cut = Math.max(at.lastIndexOf('/'), at.lastIndexOf('\\'))
    if (cut <= 0) return path
    rest = `/${at.slice(cut + 1)}${rest}`
    at = at.slice(0, cut)
  }
}

/** Each root in both spellings, because a path's landing has its links followed and the root may hold one. */
export async function rootsOf($: EngineInterface): Promise<Roots> {
  const os = await osOf($)
  const own = [await dataDir($), $.plugin.root]
  return { own: [...own, ...(await Promise.all(own.map(r => landing($, r))))], config: await configDir($), caseless: os !== 'linux' }
}

/** A file that is there and can't be read rejects: the caller's check has failed (R-12), it hasn't passed. */
async function readIfThere($: EngineInterface, path: string): Promise<string> {
  return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
}

async function logEvent($: EngineInterface, rt: Runtime, event: 'block' | 'warn' | 'notice', where: string, detail: string, tag?: string): Promise<void> {
  const clean = (t: string): string => rt.redactor.redactText(t, { deadline: now() + 500 }).text
  await writeLog($, [{ t: await $.clock.now(), event, door: 'tool', where, detail, mode: rt.settings.mode, ...(tag ? { tag } : {}) }], clean)
}

const named = (hits: readonly Hit[]): string => [...new Set(hits.map(h => `${h.label} #${h.tag}`))].slice(0, 5).join(', ')

/** Self-protection stays on in observe mode (D-058): it is no detection, and it keeps a trial honest. */
async function protect($: EngineInterface, rt: Runtime, tool: string, e: Input): Promise<string | undefined> {
  const roots = await rootsOf($)
  const path = pathOf(tool, e)
  if (path) {
    const real = await landing($, path)
    if (isProtected(path, roots) || isProtected(real, roots)) return "that file belongs to aegiscontext, and Claude can't change it"
    if (isSettingsFile(path, roots) || isSettingsFile(real, { ...roots, config: await landing($, roots.config) })) {
      const before = await readIfThere($, path)
      const after = tool === 'Write' ? text(e.content) : applyEdit(before, text(e.old_string), text(e.new_string), e.replace_all === true)
      const key = after === undefined ? undefined : blockedSettingsChange(before, after)
      if (key) return `that change touches ${key}, which could switch aegiscontext off. Only you can change it`
    }
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    const what = shellChangesProtected(text(e.command), roots)
    if (what) return `that command would change ${what}. Only you can do that`
  }
  return undefined
}

async function outbound($: EngineInterface, rt: Runtime, tool: string, e: Input): Promise<string | undefined> {
  if (!isChecked(tool) || rt.settings.outbound === 'off') return undefined
  const found = rt.redactor.findKnown(outboundText(e), now() + BUDGET_MS)
  const hits = found.hits.filter(h => h.action !== 'warn')
  if (!found.complete) throw new Error('outbound check ran out of time')
  const verdict = outboundVerdict(rt.settings.outbound, hits)
  if (verdict === 'go' || verdict === 'ask') return undefined
  if (rt.settings.mode === 'observe') {
    await logEvent($, rt, 'notice', tool, 'would have blocked: a known value in a tool call', hits[0]?.tag)
    return undefined
  }
  await logEvent($, rt, verdict === 'block' ? 'block' : 'warn', tool, 'a known value in a tool call', hits[0]?.tag)
  if (verdict === 'warn') {
    warn($, 'outbound', `a ${tool} call holds a hidden value (${named(hits)}) and was let through, because outbound is warn`)
    return undefined
  }
  warn($, 'outbound', `a ${tool} call was stopped: it holds a hidden value (${named(hits)}). If it is harmless, run /redact allow <tag>.`)
  return `this ${tool} call holds a hidden value (${named(hits)}), so it was stopped. Ask the user to run it themselves, or to run /redact allow with the tag.`
}

const shortName = (name: string): string => name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)

/**
 * Put-back (spec §10, D-096): the changes that put a hidden value back into a Write or Edit input, only where the
 * file on disk already holds it. Nothing is changed when it is off, for any other tool, or when nothing can be restored.
 */
async function restore($: EngineInterface, rt: Runtime, tool: string, e: Input, deadline: number): Promise<{ changes?: Input; on: boolean }> {
  if (tool !== 'Write' && tool !== 'Edit') return { on: false }
  const decision = await putBackNow($, rt)
  await repoNotice($, rt, decision)
  if (!decision.on) return { on: false }
  const path = pathOf(tool, e)
  if (!path) return { on: true }
  const disk = await readIfThere($, path)
  if (disk === '') return { on: true }
  if (disk.length > MAX_FILE_CHARS) throw new Error('file too large for put-back')
  const out = restoreInput(rt.redactor, { tool, file: path, disk, input: e, deadline })
  if (!out.complete) throw new Error('put-back ran out of time')
  if (out.restored === 0) return { on: true }
  const changes: Input = {}
  for (const key of ['content', 'old_string', 'new_string']) if (out.input[key] !== e[key]) changes[key] = out.input[key]
  const name = rt.redactor.redactText(path, { deadline: now() + 500 }).text
  await logEvent($, rt, 'notice', path, `put-back: ${out.restored} restored, ${out.left} left as placeholders`)
  if (rt.settings.notices === 'on') $.ui.log(`Put-back: restored ${out.restored} hidden value${out.restored === 1 ? '' : 's'} in ${shortName(name)}${out.left > 0 ? `; ${out.left} stayed as placeholders` : ''}.`)
  return { changes, on: true }
}

async function guard($: EngineInterface, rt: Runtime, tool: string, e: Input, deadline: number, putBack: boolean): Promise<string | undefined> {
  const path = pathOf(tool, e)
  if (!path) return undefined
  const disk = await readIfThere($, path)
  if (disk === '') return undefined
  if (disk.length > MAX_FILE_CHARS) throw new Error('file too large for the overwrite guard')
  const after = tool === 'Edit' ? applyEdit(disk, text(e.old_string), text(e.new_string), e.replace_all === true) : text(tool === 'Write' ? e.content : e.new_source)
  if (after === undefined) return undefined
  const out = checkOverwrite(rt.redactor, { path, disk, after, deadline })
  if (!out.complete) throw new Error('overwrite guard ran out of time')
  if (!out.blocked) return undefined
  if (rt.settings.mode === 'observe') {
    await logEvent($, rt, 'notice', path, 'would have blocked: a real secret would be replaced by its placeholder', out.tags[0])
    return undefined
  }
  // The one exception to R-11 (D-096): with put-back on, a Write or Edit goes through and the person is told. A
  // NotebookEdit is not restored, so its guard still refuses.
  if (putBack && (tool === 'Write' || tool === 'Edit')) {
    const name = rt.redactor.redactText(path, { deadline: now() + 500 }).text
    await logEvent($, rt, 'warn', path, `put-back is on: ${out.tags.length} real value${out.tags.length === 1 ? '' : 's'} replaced by placeholders`, out.tags[0])
    warn($, 'put-back-lost', `put-back could not restore ${out.tags.length} hidden value${out.tags.length === 1 ? '' : 's'}, so ${out.tags.length === 1 ? 'it was' : 'they were'} replaced by ${out.tags.length === 1 ? 'its placeholder' : 'placeholders'} in ${shortName(name)}. Git, or Claude Code's file backups, can bring ${out.tags.length === 1 ? 'it' : 'them'} back.`)
    return undefined
  }
  const pass = await guardPass($)
  if (pass?.file === path) {
    await setGuardPass($, null)
    await logEvent($, rt, 'notice', path, 'overwrite guard let through once by the person', out.tags[0])
    return undefined
  }
  await setGuardPass($, null)
  pendingGuard = path
  await logEvent($, rt, 'block', path, 'a real secret would be replaced by its placeholder', out.tags[0])
  warn($, 'guard', 'a change was stopped because it would replace a real secret with its placeholder. To let it through once, run /redact allow.')
  return 'this would replace a real secret in the file with its placeholder, and the secret would be lost. Change only the lines you need and leave placeholder lines alone. The user can let it through once with /redact allow.'
}

let pendingGuard: string | undefined

/** The file the last guard block named: what a bare `/redact allow` lets through once. */
export const lastGuardBlock = (): string | undefined => pendingGuard

export function clearGuardBlock(): void {
  pendingGuard = undefined
}

/**
 * What to do before a tool runs: refuse it, or let it go, with changes to its input when put-back restored
 * something. The order is protect, outbound, restore, guard; restore and the guard share one deadline.
 */
export async function beforeTool($: EngineInterface, tool: string, e: Input): Promise<{ deny: string } | { changes?: Input }> {
  const rt = await ready($)
  const denied = (await protect($, rt, tool, e)) ?? (await outbound($, rt, tool, e))
  if (denied !== undefined) return { deny: denied }
  const deadline = now() + BUDGET_MS
  const restored = await restore($, rt, tool, e, deadline)
  const sent = restored.changes ? { ...e, ...restored.changes } : e
  const refused = await guard($, rt, tool, sent, deadline, restored.on)
  if (refused !== undefined) return { deny: refused }
  return restored.changes ? { changes: restored.changes } : {}
}

/** The `ask` setting: a person decides, so this answers at tool.check. */
export async function askReason($: EngineInterface, tool: string, input: unknown): Promise<string | undefined> {
  const rt = await ready($)
  if (rt.settings.outbound !== 'ask' || rt.settings.mode === 'observe' || !isChecked(tool)) return undefined
  const found = rt.redactor.findKnown(outboundText(input), now() + BUDGET_MS)
  const hits = found.hits.filter(h => h.action !== 'warn')
  if (hits.length === 0) return undefined
  await logEvent($, rt, 'notice', tool, 'asked the person about a known value', hits[0]?.tag)
  return `aegiscontext: this ${tool} call holds a hidden value (${named(hits)}). Allow it?`
}

/** The notice after a write: a placeholder stays as text, and the person fills in the value (spec §10). */
export async function afterTool($: EngineInterface, tool: string, e: Input): Promise<void> {
  const path = pathOf(tool, e)
  if (!path) return
  const written = text(tool === 'Write' ? e.content : tool === 'Edit' ? e.new_string : e.new_source)
  const tags = new Set(placeholdersIn(written).map(p => p.tag))
  if (tags.size === 0) return
  const rt = await ready($)
  const content = tool === 'Write' ? written : await readIfThere($, path)
  const found = placeholdersIn(content).filter(p => tags.has(p.tag))
  const name = rt.redactor.redactText(path, { deadline: now() + 500 }).text
  await addPlaced($, found.map(p => ({ file: name, line: p.line, tag: p.tag })))
  if (rt.settings.notices === 'off') return
  const short = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
  for (const p of found.slice(0, 5)) $.ui.log(`Claude wrote a placeholder into ${short}, line ${p.line}. Fill in the real value.`)
}
