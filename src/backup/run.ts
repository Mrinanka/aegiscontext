// One run of the backup lock for one hook event: settings, checker, saved values, decision, log.
// Loaded by main.ts only after the marker said the main lock is not alive, so standing down costs little.
//
// The log goes to <config>/aegiscontext/log/<date>-<session>.backup.jsonl, a file of its own so the main
// lock's writes and these never meet. Every line is cleaned with the same redactor (R-17).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createChecker, type Rejection } from '../checker/index.ts'
import { backendFor } from '../core/backends.ts'
import { appendLine, formatLine, ROLLOVER_BYTES, type LogEntry } from '../core/log.ts'
import { NO_ALLOW, Redactor } from '../core/session.ts'
import type { Roots } from '../core/protect.ts'
import { checkerOptions, compileAllow, type Settings } from '../core/settings.ts'
import { loadList, type SecretEntry } from '../core/store.ts'
import { decide, failureAnswer, type Answer } from './act.ts'
import { SESSION_ID } from './marker.ts'
import { nodeExec, readOnlyFiles, thisOS } from './os.ts'
import { loadBackupSettings, nodeSettingsIO } from './settings.ts'

export type RunOptions = {
  configDir: string
  platform?: NodeJS.Platform
  policyFiles?: readonly string[]
  /** Time for the checks of one event. */
  budgetMs?: number
  /** For tests: stand in for the password store. */
  loadSecrets?: () => Promise<{ entries: SecretEntry[]; warning?: string }>
  /** For tests: the home folder (default `os.homedir()`). */
  home?: string
  /** For tests: whether `CLAUDE_CONFIG_DIR` is set (default: read from the environment). */
  configVar?: boolean
}

const BUDGET_MS = 4000

function realpath(p: string): string | undefined {
  try {
    return fs.realpathSync.native(p)
  } catch {
    return undefined
  }
}

function readFile(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw e
  }
}

async function loadSecrets(o: RunOptions): Promise<{ entries: SecretEntry[]; warning?: string }> {
  if (o.loadSecrets) return o.loadSecrets()
  try {
    const store = backendFor(thisOS(), { exec: nodeExec, files: readOnlyFiles(path.join(o.configDir, 'aegiscontext', 'store')) })
    const loaded = await loadList(store)
    return { entries: loaded.entries, ...(loaded.warning ? { warning: loaded.warning } : {}) }
  } catch {
    return { entries: [], warning: 'the saved secrets could not be loaded' }
  }
}

/** One log line per entry, in a file of this backup lock's own. A failure to write is not allowed to stop the hook. */
function writeLog(configDir: string, session: unknown, entries: LogEntry[], clean: (t: string) => string): void {
  if (entries.length === 0) return
  const id = typeof session === 'string' && SESSION_ID.test(session) ? session : 'unknown-session'
  try {
    const dir = path.join(configDir, 'aegiscontext', 'log')
    fs.mkdirSync(dir, { recursive: true })
    const date = new Date(entries[0]?.t ?? Date.now()).toISOString().slice(0, 10)
    let part = 1
    const file = (n: number): string => path.join(dir, `${date}-${id}.backup${n > 1 ? `.${n}` : ''}.jsonl`)
    while (fs.existsSync(file(part)) && fs.statSync(file(part)).size >= ROLLOVER_BYTES) part++
    const lines = entries.map(e => formatLine(e, clean)).join('\n')
    fs.appendFileSync(file(part), appendLine('', lines).text)
  } catch {
    process.stderr.write('aegiscontext backup lock: could not write its log file\n')
  }
}

const merge = (answer: Answer, warnings: string[]): Answer => {
  if (warnings.length === 0) return answer
  const note = `aegiscontext (backup lock): ${warnings.join(' ')}`
  const prior = typeof answer?.systemMessage === 'string' ? `${answer.systemMessage} ` : ''
  return { ...(answer ?? {}), systemMessage: `${prior}${note}` }
}

/** For an input that could not be read or was too big: settings only, no checker, so the failure rule still applies. */
export function runUnreadable(event: string, o: RunOptions, cwd: string | undefined, kind: string): Answer {
  const loaded = loadBackupSettings({ configDir: o.configDir, cwd: cwd ?? process.cwd(), platform: o.platform ?? process.platform, policyFiles: o.policyFiles ?? [], io: nodeSettingsIO })
  return failureAnswer(event, loaded.settings, kind).answer
}

export async function runBackup(input: Record<string, unknown>, o: RunOptions): Promise<Answer> {
  const event = typeof input.hook_event_name === 'string' ? input.hook_event_name : ''
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
  const loaded = loadBackupSettings({ configDir: o.configDir, cwd, platform: o.platform ?? process.platform, policyFiles: o.policyFiles ?? [], io: nodeSettingsIO })
  const settings: Settings = loaded.settings
  const warnings: string[] = []
  const entries: LogEntry[] = []
  for (const p of loaded.problems) entries.push({ t: Date.now(), event: 'notice', door: 'settings', detail: p })
  // Notices name a source and a setting, never a value. A managed one is also how a test sees that a real managed file was read.
  for (const n of loaded.notices) entries.push({ t: Date.now(), event: 'notice', door: 'settings', detail: n })
  if (loaded.problems.length > 0) warnings.push(`a settings problem was found (${loaded.problems.length}); see the log.`)

  const { checker, errors } = createChecker(checkerOptions(settings))
  for (const r of errors as Rejection[]) entries.push({ t: Date.now(), event: 'notice', door: 'settings', detail: `custom rule ${r.id} refused: ${r.reason}` })
  const { allow, errors: allowErrors } = compileAllow(settings.allow)
  for (const e of allowErrors) entries.push({ t: Date.now(), event: 'notice', door: 'settings', detail: e })

  const saved = await loadSecrets(o)
  if (saved.warning) {
    entries.push({ t: Date.now(), event: 'failure', door: 'store', detail: saved.warning })
    warnings.push('the saved secrets could not be read, so only shapes and labels are being checked.')
  }
  const redactor = new Redactor({ checker, registered: saved.entries, hints: settings.hints === 'on', allow: allow ?? NO_ALLOW })
  const clean = (t: string): string => redactor.redactText(t, { deadline: performance.now() + 500 }).text

  const dataDir = path.join(o.configDir, 'aegiscontext')
  const own = [dataDir]
  const landed = realpath(dataDir)
  if (landed !== undefined && landed !== dataDir) own.push(landed)
  // With the home folder, the working folder and the OS, so a path is read the way Claude Code expands it (D-098).
  const platform = o.platform ?? process.platform
  const roots: Roots = {
    own,
    config: o.configDir,
    caseless: platform !== 'linux',
    home: o.home ?? os.homedir(),
    cwd,
    windows: platform === 'win32',
    configVar: o.configVar ?? Boolean(process.env.CLAUDE_CONFIG_DIR),
  }

  let answer: Answer
  try {
    const out = decide(input, { redactor, settings, roots, budgetMs: o.budgetMs ?? BUDGET_MS, readFile, realpath })
    answer = out.answer
    entries.push(...out.entries)
  } catch {
    const f = failureAnswer(event, settings, 'error', input.tool_response)
    answer = f.answer
    entries.push(...f.entries)
  }
  writeLog(o.configDir, input.session_id, entries, clean)
  return merge(answer, warnings)
}
