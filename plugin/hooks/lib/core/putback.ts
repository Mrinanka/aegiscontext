// Put-back (spec §10, D-096): who decides, the developer's choice file, and restoring a placeholder in a
// Write or Edit input into a file that already holds the value. Pure: the hooks read the files and settings
// and hand the facts here. Nothing in this file writes or logs a value.
//
// restoreInput, in order:
//   1. no placeholder in the input: nothing to do, and the disk is not read
//   2. scan the file on disk as a Read would; each hit gives the exact text it replaced
//   3. a tag is restorable when every hit for it is `hide` and has the same source text
//   4. Write: restore the content, greedy in order, no more copies of a value than the file held
//      Edit: restore old_string first. If the result is not in the file, the input stays as Claude wrote it,
//      so no error can echo a real value (spike S7). new_string may hold no more copies than old_string did.
//   5. a value is restored only if the Redactor can keep it hidden afterwards (`keepHidden`)

import { findPlaceholders } from './placeholder.ts'
import type { Redacted, RedactTextOptions } from './session.ts'

export type Switch = 'on' | 'off'

// ---------------------------------------------------------------------------------------------------------
// Who decides
// ---------------------------------------------------------------------------------------------------------

export type PutBackFacts = {
  /** Managed settings say off, or lock the setting. */
  managedOff: boolean
  /** What the project's own settings say (any `off` among project, local and flag wins). */
  repo?: Switch
  /** The developer's `--here` choice for this folder. */
  here?: Switch
  /** The developer's choice for all projects. */
  all?: Switch
  /** Whether a surface can show the repo notice. */
  canShow: boolean
  /** The choice file is there and could not be read. */
  unreadable: boolean
  observe: boolean
}

export type PutBackDecision = { on: boolean; why: string; repoNotice: boolean }

/** Spec §10, first match wins. */
export function resolvePutBack(f: PutBackFacts): PutBackDecision {
  const off = (why: string): PutBackDecision => ({ on: false, why, repoNotice: false })
  if (f.observe) return off('off: observe mode restores nothing')
  if (f.managedOff) return off('off: your organization turned it off')
  if (f.repo === 'off') return off('off: this project turned it off')
  if (f.unreadable) return off('off: your put-back choice file could not be read')
  if (f.here !== undefined) return { on: f.here === 'on', why: `${f.here}: your choice for this folder`, repoNotice: false }
  if (f.all !== undefined) return { on: f.all === 'on', why: `${f.all}: your choice for all projects`, repoNotice: false }
  if (f.repo === 'on') {
    if (f.canShow) return { on: true, why: 'on: this project turned it on', repoNotice: true }
    return off('off: this project asked for it, but nothing here can show you the notice')
  }
  return off('off: the default')
}

// ---------------------------------------------------------------------------------------------------------
// The choice file: <data>/put-back.json. Paths and on or off, never a value.
// ---------------------------------------------------------------------------------------------------------

export type Choice = { all?: Switch; folders?: Record<string, Switch> }

export const MAX_CHOICE_CHARS = 65_536
const MAX_FOLDERS = 500

const isSwitch = (v: unknown): v is Switch => v === 'on' || v === 'off'

/** The choice in the file's text, or undefined when it can't be trusted (broken, wrong shape, over 64 KB). */
export function parseChoice(text: string): Choice | undefined {
  if (text.length === 0 || text.length > MAX_CHOICE_CHARS) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const out: Choice = {}
  if ('all' in r) {
    if (!isSwitch(r.all)) return undefined
    out.all = r.all
  }
  if ('folders' in r) {
    const f = r.folders
    if (typeof f !== 'object' || f === null || Array.isArray(f)) return undefined
    const entries: [string, Switch][] = []
    for (const [key, value] of Object.entries(f)) {
      if (!isSwitch(value)) return undefined
      if (key !== '__proto__') entries.push([key, value])
    }
    out.folders = Object.fromEntries(entries)
  }
  return out
}

export const serializeChoice = (c: Choice): string => JSON.stringify(c)

/** A folder in the form the file keeps: forward slashes, no trailing slash, lower case where the system ignores case. */
export function folderKey(path: string, caseless: boolean): string {
  const p = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const key = p === '' ? '/' : p
  return caseless ? key.toLowerCase() : key
}

/** The choice with one change. `here` is a key from `folderKey`; without it the change is for all projects. */
export function changeChoice(c: Choice, o: { value: Switch; here?: string }): Choice {
  if (o.here === undefined) return { ...c, all: o.value }
  const entries = Object.entries(c.folders ?? {}).filter(([k]) => k !== o.here)
  entries.push([o.here, o.value])
  return { ...c, folders: Object.fromEntries(entries.slice(-MAX_FOLDERS)) }
}

/** What the choice says for the all-projects switch and for this folder (an exact match, not its subfolders). */
export function choiceFacts(c: Choice, folder: string, caseless: boolean): { all?: Switch; here?: Switch } {
  const key = folderKey(folder, caseless)
  const folders = c.folders
  const here = folders !== undefined && Object.hasOwn(folders, key) ? folders[key] : undefined
  return { ...(c.all === undefined ? {} : { all: c.all }), ...(here === undefined ? {} : { here }) }
}

// ---------------------------------------------------------------------------------------------------------
// Restoring a placeholder in a Write or Edit input
// ---------------------------------------------------------------------------------------------------------

export type Input = Record<string, unknown>

/** What restoreInput needs of a Redactor. */
export type RestoreRedactor = {
  redactText(text: string, o: RedactTextOptions): Redacted
  keepHidden(tag: string, label?: string): boolean
}

export type RestoreCall = {
  tool: 'Write' | 'Edit'
  file: string
  /** The file as it is on disk now. */
  disk: string
  input: Input
  /** Absolute time (performance.now()) by which to finish. */
  deadline: number
}

export type RestoreResult = {
  input: Input
  /** Placeholders replaced by their value. */
  restored: number
  /** Placeholders in the input that stayed as text. */
  left: number
  /** False when the time ran out: nothing was restored (R-12). */
  complete: boolean
}

type Known = { sources: Set<string>; count: number; hide: boolean }

const TAG = /#([a-z2-7]{13})\]$/
const LABEL = /^\[REDACTED:([A-Z0-9_]+)/

/** Each tag the file holds, with the text it hid there and how many copies. */
function scanDisk(r: RestoreRedactor, c: RestoreCall): { known: Map<string, Known>; complete: boolean } {
  const known = new Map<string, Known>()
  const seen = new Set<string>()
  let complete = true
  // A second scan with no file name finds a value that only another door showed (a command's output).
  for (const file of c.file === '' ? [undefined] : [c.file, undefined]) {
    const scan = r.redactText(c.disk, { ...(file === undefined ? {} : { file }), deadline: c.deadline, sources: true })
    if (!scan.complete) complete = false
    for (const h of scan.hits) {
      if (h.source === undefined) continue
      const entry = known.get(h.tag) ?? { sources: new Set<string>(), count: 0, hide: true }
      known.set(h.tag, entry)
      if (h.action !== 'hide') entry.hide = false
      const key = `${h.at}:${h.source}`
      if (seen.has(key)) continue
      seen.add(key)
      entry.sources.add(h.source)
      entry.count++
    }
  }
  return { known, complete }
}

/**
 * Puts the real value back for each placeholder of a Write or Edit input, only where the file on disk already holds
 * it. Everything it can't restore stays as the placeholder text. Never throws on a field of the wrong type.
 */
export function restoreInput(r: RestoreRedactor, c: RestoreCall): RestoreResult {
  const fields = c.tool === 'Write' ? ['content'] : ['old_string', 'new_string']
  const strings = fields.filter(f => typeof c.input[f] === 'string')
  const total = strings.reduce((n, f) => n + findPlaceholders(c.input[f] as string).length, 0)
  const unchanged = (complete = true): RestoreResult => ({ input: c.input, restored: 0, left: total, complete })
  if (total === 0 || c.disk === '') return unchanged()
  const { known, complete } = scanDisk(r, c)
  if (!complete) return unchanged(false)

  const kept = new Map<string, boolean>()
  const keep = (tag: string, label: string): boolean => {
    let ok = kept.get(tag)
    if (ok === undefined) {
      ok = r.keepHidden(tag, label)
      kept.set(tag, ok)
    }
    return ok
  }

  /** Restores a text, spending `budget` (copies left per tag). Returns the text and the copies restored per tag. */
  const restoreText = (text: string, budget: Map<string, number>): { text: string; used: Map<string, number> } => {
    const used = new Map<string, number>()
    let out = ''
    let cursor = 0
    for (const [s, e] of findPlaceholders(text)) {
      const ph = text.slice(s, e)
      const tag = (TAG.exec(ph) as RegExpExecArray)[1] as string
      const info = known.get(tag)
      const left = budget.get(tag) ?? 0
      if (!info || !info.hide || info.sources.size !== 1 || left <= 0 || !keep(tag, (LABEL.exec(ph) as RegExpExecArray)[1] as string)) continue
      budget.set(tag, left - 1)
      used.set(tag, (used.get(tag) ?? 0) + 1)
      out += text.slice(cursor, s) + (info.sources.values().next().value as string)
      cursor = e
    }
    return { text: out + text.slice(cursor), used }
  }
  const budget = (): Map<string, number> => new Map([...known].map(([tag, k]) => [tag, k.count]))
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0)

  if (c.tool === 'Write') {
    if (!strings.includes('content')) return unchanged()
    const done = restoreText(c.input.content as string, budget())
    const restored = sum(done.used)
    return restored === 0 ? unchanged() : { input: { ...c.input, content: done.text }, restored, left: total - restored, complete: true }
  }

  // Edit: the old text must be in the file once it is restored, or the input stays as Claude wrote it.
  if (!strings.includes('old_string')) return unchanged()
  const old = restoreText(c.input.old_string as string, budget())
  if (old.text === '' || !c.disk.includes(old.text)) return unchanged()
  // The new text may hold no more copies of a value than the old text did.
  const next = strings.includes('new_string') ? restoreText(c.input.new_string as string, new Map(old.used)) : { text: undefined, used: new Map<string, number>() }
  const restored = sum(old.used) + sum(next.used)
  if (restored === 0) return unchanged()
  return {
    input: { ...c.input, old_string: old.text, ...(next.text === undefined ? {} : { new_string: next.text }) },
    restored,
    left: total - restored,
    complete: true,
  }
}
