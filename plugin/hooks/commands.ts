// `/redact` and its subcommands (spec §15). Only the person can run them (R-16): the engine refuses a
// registered command through the Skill tool, and a run from a plugin is refused here. A value never
// comes in on the command line: `add` and `learn` take theirs in a pane, where no row is made.

import type { EngineInterface } from 'claude-code'
import { backupHooksIn, backupState, installBackup, snippetText } from './backup-copy.ts'
import { addToList, osOf, savedEntries, storeReport } from './backends.ts'
import { createChecker } from './lib/checker/index.ts'
import { now } from './lib/core/decoder.ts'
import { parseEnv, startsTicked } from './lib/core/envfile.ts'
import { managedInstall } from './lib/core/guard-check.ts'
import { reportText, runSelfCheck } from './lib/core/selfcheck.ts'
import { isTested } from './lib/core/versions.ts'
import { PLUGIN_VERSION } from './marker.ts'
import { guardLines } from './guard.ts'
import { writeLog } from './log-file.ts'
import { configDir, dataDir, joinPath } from './paths.ts'
import { liftResume } from './resume.ts'
import { ready, registeredChanged } from './runtime.ts'
import { addAllowedTag, hiddenSummary, placedFiles, setGuardPass } from './state.ts'
import { clearGuardBlock, lastGuardBlock } from './tools.ts'
import { learnValues, removeValues } from './panes.tsx'
import { putBackNow, saveChoice } from './putback.ts'

export const COMMAND = 'redact'
export const DOCTOR = 'aegiscontext:doctor'
export const ADD_PANE = 'aegiscontext-add'
export const LEARN_PANE = 'aegiscontext-learn'
export const REMOVE_PANE = 'aegiscontext-remove'

const USAGE = 'Use: /redact, /redact add [--label name], /redact learn, /redact remove, /redact allow [tag] [--always], /redact put-back [on|off] [--here], /redact backup [managed], /redact self-check [--report], /redact doctor.'
const PUT_BACK_USAGE = 'Use: /redact put-back to see the state, /redact put-back on, /redact put-back off, and add --here for this folder only.'
const MAX_DEPTH = 3
const MAX_FILE = 1024 * 1024
const MAX_REMOVE_ROWS = 200
const SKIP = new Set(['.git', 'node_modules'])

/** The value a mistaken `/redact add <value>` left on its command row, to be masked there. */
let maskNext: string | undefined

export function takeMask(): string | undefined {
  const m = maskNext
  maskNext = undefined
  return m
}

export const isPerson = (kind: string | undefined): boolean => kind === 'composer' || kind === 'sdk' || kind === 'bridge'

async function status($: EngineInterface): Promise<string> {
  const rt = await ready($)
  const hidden = await hiddenSummary($)
  const placed = await placedFiles($)
  const lines = [
    `Version ${PLUGIN_VERSION}: main lock running. ${await backupLine($)}`,
    `Mode: ${rt.settings.mode === 'observe' ? 'OBSERVE, secrets are NOT being hidden' : 'enforce'}.`,
    `Put-back ${await putBackWhy($, rt)}.`,
    `Hidden this session: ${hidden.length}.`,
    ...hidden.slice(-20).map(h => `  ${h.label}${h.hint ? ` ...${h.hint}` : ''} in ${h.where} #${h.tag}`),
  ]
  if (placed.length > 0) lines.push('Files that got a placeholder:', ...placed.slice(-20).map(p => `  ${p.file}, line ${p.line}`))
  return lines.join('\n')
}

/** "off: the default", "on: your choice for all projects" and so on (spec §10). */
async function putBackWhy($: EngineInterface, rt: Awaited<ReturnType<typeof ready>>): Promise<string> {
  try {
    return (await putBackNow($, rt)).why
  } catch {
    return 'off: could not be checked'
  }
}

/** `/redact put-back [on|off] [--here]`: the state, or the developer's choice for all projects or this folder (D-096). */
async function putBack($: EngineInterface, rest: string): Promise<string> {
  const words = rest.split(/\s+/).filter(Boolean)
  const unknown = words.some(w => w !== 'on' && w !== 'off' && w !== '--here')
  const values = words.filter(w => w === 'on' || w === 'off')
  const here = words.includes('--here')
  if (unknown) maskNext = rest
  if (unknown || values.length > 1 || (here && values.length === 0)) return `Nothing changed. ${PUT_BACK_USAGE}`
  const rt = await ready($)
  const value = values[0] as 'on' | 'off' | undefined
  if (value === undefined) return `Put-back ${await putBackWhy($, rt)}.`
  try {
    await saveChoice($, value, here)
  } catch {
    return 'Your choice could not be saved, so nothing changed.'
  }
  const scope = here ? 'this folder' : 'all projects'
  const lines = [`Saved: put-back ${value} for ${scope}.`]
  const now = await putBackNow($, rt).catch(() => undefined)
  if (value === 'on' && now && !now.on) lines.push(`It stays off for now: ${now.why.replace(/^off: /, '')}.`)
  if (value === 'on') {
    lines.push(
      "Put-back lets Claude's file writes carry your real secrets into files that already hold them, and it can erase a real secret it can't restore. Keep it off unless you need it.",
      'Restoring starts now. The note that tells Claude about it is added at the next new session.',
    )
  }
  return lines.join('\n')
}

/** One line for the status: is the backup lock set up, and is its copy current? */
async function backupLine($: EngineInterface): Promise<string> {
  try {
    const [state, user, policy] = [await backupState($), await $.settings.read({ source: 'user' }).catch(() => ({})), await $.settings.read({ source: 'policy' }).catch(() => ({}))]
    const hooks = backupHooksIn(user).found || backupHooksIn(policy).found
    if (!state.installed && !hooks) return 'Backup lock: not set up (run /redact backup).'
    if (!hooks) return 'Backup lock: copied, but no settings run it yet (run /redact backup to see what to add).'
    return `Backup lock: set up${state.installed ? (state.current ? ', copy current' : ', copy out of date; it refreshes at the next session start') : ''}. It acts only when this lock is not running.`
  } catch {
    return 'Backup lock: could not be checked.'
  }
}

async function backup($: EngineInterface, rest: string): Promise<string> {
  const managed = rest.trim() === 'managed'
  if (rest.trim() !== '' && !managed) return 'Use: /redact backup, or /redact backup managed.'
  let copied
  try {
    copied = await installBackup($)
  } catch {
    return 'The backup lock could not be copied: this plugin carries no build of it, or the copy could not be written.'
  }
  const node = await nodeVersion($)
  const target = managed ? 'the managed settings file (an administrator does this)' : `your user settings, ${joinPath(await configDir($), 'settings.json')}`
  return [
    `The backup lock is copied to ${await stableDirText($)} (${copied.files} files).`,
    'It runs only when the main lock is not alive, and then blocks prompts that hold secrets, stops tool calls that carry them and cleans tool output.',
    node ? `Node ${node} found.` : 'Node was NOT found on the PATH. The backup lock cannot run without it.',
    `To switch it on, add this to ${target}. If it already has a "hooks" key, merge the three events in:`,
    await snippetText($, managed),
    managed ? 'In managed settings, add "--policy <file>" arguments only if your settings reach machines by MDM or from the server, and point it at a copy of that policy.' : 'This stops nothing if Node is missing or the hook fails to start. The managed snippet adds onFailure "block" for that.',
    'Check it with /redact doctor.',
  ].join('\n')
}

/**
 * Where an exec-form hook would find `node`: the first PATH folder that holds it. Looked up here, not by
 * running `node`, because `$.process.run` refuses a PATH with an empty entry that a hook starts fine with.
 */
async function findNode($: EngineInterface): Promise<string | undefined> {
  const windows = (await osOf($)) === 'windows'
  const path = (await $.env.get('PATH')) ?? (await $.env.get('Path')) ?? ''
  for (const dir of path.split(windows ? ';' : ':')) {
    if (dir === '' || dir === '.') continue
    const exe = joinPath(dir, windows ? 'node.exe' : 'node')
    if (await $.fs.exists(exe).catch(() => false)) return exe
  }
  return undefined
}

async function nodeVersion($: EngineInterface): Promise<string | undefined> {
  try {
    const exe = await findNode($)
    if (exe === undefined) return undefined
    const r = await $.process.run([exe, '--version'], { timeoutMs: 5000 })
    const v = r.stdout.trim().replace(/^v/, '')
    return r.exitCode === 0 && /^\d+\.\d+/.test(v) ? v : undefined
  } catch {
    return undefined
  }
}

async function stableDirText($: EngineInterface): Promise<string> {
  return joinPath(await dataDir($), 'backup')
}

async function add($: EngineInterface, rest: string): Promise<string> {
  const m = /^(?:--label\s+([A-Za-z0-9_-]{1,40}))?$/.exec(rest.trim())
  if (!m) {
    maskNext = rest
    return 'Nothing was saved. Never put a secret on the command line: Claude Code keeps that line in its transcript, so consider rotating that value. Run /redact add alone, and paste the secret into the box.'
  }
  if ((await $.session.surfaces()).length === 0) return '/redact add needs an interactive session, because the secret goes into a box on screen.'
  await $.state.set({ plugin: 'aegiscontext', key: 'addNote' }, m[1] ? { text: `Label: ${m[1]}`, isError: false } : null)
  await $.ui.open({ id: ADD_PANE, title: 'Add a secret', focus: true, closeOnEscape: true, rows: 7 })
  return 'Paste the secret into the box. It stays out of the chat.'
}

async function envFiles($: EngineInterface, dir: string, patterns: readonly string[], depth: number, out: string[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= 100) return
  const matches = (name: string): boolean => patterns.some(p => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(name))
  for (const e of await $.fs.list(dir)) {
    if (e.kind === 'file' && matches(e.name) && e.size <= MAX_FILE) out.push(joinPath(dir, e.name))
    else if (e.kind === 'dir' && !SKIP.has(e.name)) await envFiles($, joinPath(dir, e.name), patterns, depth + 1, out)
  }
}

async function learn($: EngineInterface): Promise<string> {
  if ((await $.session.surfaces()).length === 0) return '/redact learn needs an interactive session.'
  const rt = await ready($)
  const cwd = await $.session.cwd()
  const files: string[] = []
  await envFiles($, cwd, rt.settings.secret_files, 0, files)
  const checker = createChecker({}).checker
  const rows = []
  learnValues.clear()
  for (const file of files) {
    for (const entry of parseEnv(String(await $.fs.read(file)))) {
      const id = `v${learnValues.size}`
      learnValues.set(id, entry.value)
      rows.push({ id, file: file.slice(cwd.length + 1), key: entry.key, length: entry.value.length, ticked: startsTicked(checker, entry.key, entry.value) })
    }
  }
  if (rows.length === 0) return 'No values found in files matching secret_files.'
  await $.state.set({ plugin: 'aegiscontext', key: 'learnRows' }, rows)
  await $.state.set({ plugin: 'aegiscontext', key: 'learnNote' }, null)
  await $.ui.open({ id: LEARN_PANE, title: 'Learn secrets', focus: true, closeOnEscape: true })
  return `Found ${rows.length} values. Tick the ones to remember.`
}

async function remove($: EngineInterface, rest: string): Promise<string> {
  if (rest.trim() !== '') {
    maskNext = rest
    return 'Nothing was removed. Never put a secret on the command line: Claude Code keeps that line in its transcript, so consider rotating that value. Run /redact remove alone, and tick what to remove.'
  }
  if ((await $.session.surfaces()).length === 0) return '/redact remove needs an interactive session.'
  let entries
  try {
    entries = await savedEntries($)
  } catch {
    return 'The saved values could not be read, so nothing can be removed. /redact doctor says why.'
  }
  if (entries.length === 0) return 'No saved values.'
  const newest = entries.slice(-MAX_REMOVE_ROWS).reverse()
  removeValues.clear()
  const rows = newest.map((e, i) => {
    const id = `r${i}`
    removeValues.set(id, e.value)
    return { id, label: e.label, added: e.added, length: e.value.length, ticked: false }
  })
  await $.state.set({ plugin: 'aegiscontext', key: 'removeRows' }, rows)
  await $.state.set({ plugin: 'aegiscontext', key: 'removeNote' }, entries.length > MAX_REMOVE_ROWS ? { text: `Showing the newest ${MAX_REMOVE_ROWS} of ${entries.length}.`, isError: false } : null)
  await $.ui.open({ id: REMOVE_PANE, title: 'Remove saved secrets', focus: true, closeOnEscape: true })
  return `${entries.length} saved values. Tick the ones to remove.`
}

async function allow($: EngineInterface, rest: string): Promise<string> {
  const words = rest.split(/\s+/).filter(Boolean)
  const always = words.includes('--always')
  const tag = words.find(w => w !== '--always')
  if (tag === undefined) {
    if (await liftResume($)) return 'Continuing: the secrets in this history will reach the model. Your next message goes through.'
    const file = lastGuardBlock()
    if (file !== undefined) {
      await setGuardPass($, { file })
      clearGuardBlock()
      return 'The last blocked change can go through once.'
    }
    return 'Nothing is waiting to be allowed. To mark a hidden value as harmless: /redact allow <tag>.'
  }
  const rt = await ready($)
  const value = rt.redactor.valueOfTag(tag)
  if (value === undefined || !rt.redactor.allowTag(tag)) return `There is no hidden value with that tag in this session.`
  await addAllowedTag($, tag)
  await writeLog($, [{ t: await $.clock.now(), event: 'notice', door: 'command', where: 'allow', tag, detail: always ? 'marked harmless for good' : 'marked harmless for this session' }], t => t)
  if (always) {
    try {
      await addToList($, [{ value, label: 'harmless', added: new Date(await $.clock.now()).toISOString().slice(0, 10), harmless: true }])
      registeredChanged()
    } catch {
      return 'Marked harmless for this session, but it could not be saved for later: the password store did not take it.'
    }
    return 'Marked harmless, now and in later sessions.'
  }
  return 'Marked harmless for this session.'
}

async function selfCheck($: EngineInterface, rest: string): Promise<string> {
  const results = runSelfCheck(() => createChecker({}).checker)
  const passed = results.filter(r => r.pass).length
  const summary = [`self-check: ${passed} of ${results.length} passed.`, ...results.filter(r => !r.pass).map(r => `FAIL ${r.name}`)].join('\n')
  if (!rest.includes('--report')) return summary
  const date = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const path = joinPath(await dataDir($), 'reports', `self-check-${date}.txt`)
  await $.fs.write(path, reportText(results, { version: PLUGIN_VERSION, engine: (await $.session.version()).version, os: await osOf($), date }))
  return `${summary}\nReport (no secrets): ${path}`
}

export async function doctor($: EngineInterface): Promise<string> {
  const rt = await ready($)
  const version = (await $.session.version()).version
  const policy = (await $.settings.read({ source: 'policy' }).catch(() => ({}))) as Record<string, unknown>
  const user = JSON.stringify(await $.settings.read({ source: 'user' }).catch(() => ({})))
  const store = await storeReport($).catch(() => undefined)
  const session = await $.session.id()
  const markerFile = joinPath(await dataDir($), 'markers', `${session}.json`)
  const marker = await $.fs.exists(markerFile).catch(() => false)
  let beatAge = ''
  if (marker) {
    try {
      const beat = (JSON.parse(String(await $.fs.read(markerFile))) as { beat?: unknown }).beat
      if (typeof beat === 'number') beatAge = `, last beat ${Math.max(0, Math.round((await $.clock.now() - beat) / 1000))} s ago`
    } catch {
      beatAge = ', unreadable'
    }
  }
  const mine = backupHooksIn(JSON.parse(user))
  const managedHooks = backupHooksIn(policy)
  const state = await backupState($).catch(() => undefined)
  const node = await nodeVersion($)
  const nodeMajor = node ? Number(node.split('.')[0]) : 0
  const hooksSet = mine.found || managedHooks.found
  const guard = await guardLines($, Object.keys(policy).length > 0)
  const fix: string[] = []
  if (!isTested(version)) fix.push('Run /redact self-check on this Claude Code version.')
  if (guard.fix) fix.push(guard.fix)
  if (store?.status === 'missing') fix.push('Install a password store (Linux: libsecret-tools and a keyring) to keep saved secrets.')
  if (store?.status === 'locked') fix.push('Unlock your password store; saved secrets are not being hidden until then.')
  if (rt.problems.length > 0) fix.push('Fix the settings problems below.')
  if (!hooksSet) fix.push('The backup lock is not set up: run /redact backup. Without it, a crash or a policy that blocks plugin hooks leaves nothing checking.')
  if (hooksSet && !node) fix.push('Node is not on the PATH, so the backup lock cannot run.')
  if (hooksSet && node && nodeMajor < 20) fix.push('Node is older than 20; the backup lock was tested on Node 24.')
  if (hooksSet && !(mine.found ? mine.blocksOnFailure : managedHooks.blocksOnFailure)) fix.push('The backup hooks do not set onFailure "block": if Node is missing or a hook fails to start, the call goes through. The managed snippet sets it.')
  if (hooksSet && state?.hasSource && !state.installed) fix.push('The backup hooks are set, but their copy is missing here: run /redact backup.')
  if (state?.installed && !state.current) fix.push('The backup lock copy is out of date; it refreshes at the next session start, or run /redact backup now.')
  return [
    `Claude Code: ${version} (${isTested(version) ? 'tested' : 'not on the tested list'}).`,
    `Install: ${managedInstall(policy) ? 'Managed settings are present' : 'Personal mode'}.`,
    ...guard.lines,
    'Main lock hooks: running (this answer came from a hook).',
    `Password store: ${store ? `${store.status}, ${store.count} saved` : 'could not be checked'}.`,
    `Backup lock: ${mine.found ? 'hooks found in user settings' : managedHooks.found ? 'hooks found in managed settings' : 'not installed'}${state?.installed ? `; copy ${state.copyVersion ?? '?'}, ${state.current ? 'current' : 'out of date'}` : ''}.`,
    `Node (needed by the backup lock): ${node ? `${node}` : 'not found on the PATH'}.`,
    `Marker: ${marker ? 'present' : 'missing'}${beatAge}.`,
    `Settings: ${rt.problems.length === 0 ? 'valid' : rt.problems.join('; ')}.`,
    `Put-back ${await putBackWhy($, rt)}.`,
    ...(fix.length > 0 ? ['To fix:', ...fix.map(f => `  ${f}`)] : []),
  ].join('\n')
}

export async function redactCommand($: EngineInterface, args: string): Promise<string> {
  const trimmed = args.trim()
  const space = trimmed.search(/\s/)
  const sub = space < 0 ? trimmed : trimmed.slice(0, space)
  const rest = space < 0 ? '' : trimmed.slice(space + 1)
  switch (sub) {
    case '': return status($)
    case 'add': return add($, rest)
    case 'learn': return learn($)
    case 'remove': return remove($, rest)
    case 'allow': return allow($, rest)
    case 'put-back': return putBack($, rest)
    case 'backup': return backup($, rest)
    case 'self-check': return selfCheck($, rest)
    case 'doctor': return doctor($)
    default: return `Unknown subcommand. ${USAGE}`
  }
}

/** Claude can't reach these through a tool either (R-16). */
export function isOwnCommandCall(tool: string, input: Record<string, unknown>): boolean {
  return tool === 'Skill' && typeof input.skill === 'string' && /^(?:aegiscontext:)?(?:redact|doctor)\b/.test(input.skill)
}

export { now }
