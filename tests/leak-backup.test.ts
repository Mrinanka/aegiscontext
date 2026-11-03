// The kit's backup modes (plan step 5): the settings it builds, the managed file it writes and removes, the
// way it tells a stopped prompt from a silent run, and the command line's guards. Driven by the stand-in for
// `claude`; the real runs are `npm run leak-test:backup`, `:backup-limits` and `:managed`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MANAGED_PROOF_KEY, MANAGED_PROOF_NOTICE, managedFileContent, mergeHooks, userSettings } from '../tools/leak-test/fixtures/backup-settings.ts'
import { runKit, writeSettings, type KitOptions } from '../tools/leak-test/kit.ts'
import { managedFile, ManagedFileError } from '../tools/leak-test/managed-file.ts'
import { BACKUP_INSIDE, BACKUP_ONLY, BACKUP_OUTSIDE, SCENARIOS, type Run, type Scenario } from '../tools/leak-test/scenarios.ts'

const STAND_IN = path.join(import.meta.dirname, 'fixtures', 'stand-in-claude.mjs')
const RUN = path.join(import.meta.dirname, '..', 'tools', 'leak-test', 'run.ts')
const standIn = (mode: string): KitOptions['claude'] => ({ cmd: process.execPath, args: [STAND_IN, mode] })
const MAIN = path.join(os.tmpdir(), 'plugin', 'backup', 'backup', 'main.js')

const PROMPT: Scenario[] = [
  { name: 'prompt', doors: ['typed'], heldBackup: /aegiscontext \(backup lock\): your message holds a secret/, runs: [{ prompt: c => `Note:\n${c.block('typed')}`, script: () => () => ({ kind: 'text', text: 'ok' }) }] },
]
const opts = (mode: string, extra: Partial<KitOptions> = {}): KitOptions => ({ claude: standIn(mode), plugin: null, expect: 'clean', scenarios: PROMPT, timeoutMs: 20_000, ...extra })

test('the user settings are the snippet a person would paste, with a scenario hook beside it', () => {
  const s = userSettings(MAIN, { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'x' }] }] })
  assert.deepEqual(Object.keys(s.hooks).sort(), ['PostToolUse', 'PreToolUse', 'UserPromptSubmit'])
  assert.equal(s.hooks.UserPromptSubmit?.length, 2)
  assert.equal(s.hooks.PreToolUse?.length, 1)
  assert.deepEqual(mergeHooks({ A: [1] }, { A: [2], B: [3] }), { A: [1, 2], B: [3] })
})

test('the managed file holds the Managed snippet and a setting the tool does not know', () => {
  const c = managedFileContent(MAIN)
  assert.equal(c.aegisContext[MANAGED_PROOF_KEY], true)
  assert.ok(JSON.stringify(c.hooks).includes('"onFailure":"block"'))
  assert.match(MANAGED_PROOF_NOTICE, /^policy: unknown setting/)
})

test('writeSettings: backup hooks for a normal run, none for a run made before it was installed, the scenario hook either way', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
  try {
    const cfg = path.join(dir, 'config')
    fs.mkdirSync(cfg)
    const run: Run = { prompt: () => 'x', script: () => () => ({ kind: 'text', text: 'ok' }) }
    const read = (): { hooks: Record<string, unknown[]> } | undefined => (fs.existsSync(path.join(cfg, 'settings.json')) ? JSON.parse(fs.readFileSync(path.join(cfg, 'settings.json'), 'utf8')) : undefined)
    const plain: Scenario = { name: 's', doors: ['d'], runs: [run] }
    const o = { claude: standIn('send-all'), plugin: null, expect: 'clean' as const }
    writeSettings(plain, run, dir, cfg, o)
    assert.equal(read(), undefined)
    writeSettings(plain, run, dir, cfg, { ...o, backup: { main: MAIN, where: 'user' } })
    assert.equal(read()?.hooks.PreToolUse?.length, 1)
    writeSettings(plain, { ...run, withoutPlugin: true }, dir, cfg, { ...o, backup: { main: MAIN, where: 'user' } })
    assert.equal(read(), undefined, 'a run made before installation has no backup hooks')
    writeSettings({ ...plain, contextHook: 'door' }, { ...run, withoutPlugin: true }, dir, cfg, { ...o, backup: { main: MAIN, where: 'user' } })
    assert.equal(read()?.hooks.UserPromptSubmit?.length, 1)
    assert.equal(read()?.hooks.PreToolUse, undefined)
    writeSettings(plain, run, dir, cfg, { ...o, backup: { main: MAIN, where: 'managed' } })
    assert.equal(read(), undefined, 'managed hooks live in the managed file, not the user settings')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the sets of doors: inside and outside the limits never overlap, and every name is a real scenario', () => {
  const names = new Set([...SCENARIOS, ...BACKUP_ONLY].map(s => s.name))
  for (const n of [...BACKUP_INSIDE, ...BACKUP_OUTSIDE]) assert.ok(names.has(n), n)
  assert.deepEqual(BACKUP_INSIDE.filter(n => BACKUP_OUTSIDE.includes(n)), [])
})

test('skill text is outside the backup lock\'s limits, so the kit proves it leaks there (scratch run 2026-11-02: 7 of 7)', () => {
  assert.ok(BACKUP_OUTSIDE.includes('skill-text'))
})

test('a prompt the backup lock stops counts as held, but only when the kit is testing the backup lock', async () => {
  const withBackup = await runKit(opts('held-backup', { backup: { main: MAIN, where: 'user' } }))
  assert.equal(withBackup.verdict, 'pass')
  assert.equal(withBackup.backup, 'user')
  const without = await runKit(opts('held-backup'))
  assert.equal(without.verdict, 'invalid', 'with no witness and no held message to match, nothing is proven')
})

test('--safe-mode reaches the claude command line', async () => {
  const file = path.join(os.tmpdir(), `args-${process.pid}.json`)
  try {
    await runKit(opts('save-args', { safeMode: true, extraEnv: { STAND_IN_ENV_FILE: file } }))
    assert.ok((JSON.parse(fs.readFileSync(file, 'utf8')) as string[]).includes('--safe-mode'))
    await runKit(opts('save-args', { extraEnv: { STAND_IN_ENV_FILE: file } }))
    assert.ok(!(JSON.parse(fs.readFileSync(file, 'utf8')) as string[]).includes('--safe-mode'))
  } finally {
    fs.rmSync(file, { force: true })
  }
})

test('a managed run is installed before the first run, removed after the last, and needs the proof in the backup log', async () => {
  const calls: string[] = []
  const file = { path: 'x', install: () => void calls.push('install'), remove: () => void calls.push('remove') }
  const ok = await runKit(opts('write-proof', { backup: { main: MAIN, where: 'managed' }, managedFile: file, extraEnv: { STAND_IN_PROOF: MANAGED_PROOF_NOTICE } }))
  assert.deepEqual(calls, ['install', 'remove'])
  assert.equal(ok.verdict, 'pass')
  calls.length = 0
  const missing = await runKit(opts('hide-all', { backup: { main: MAIN, where: 'managed' }, managedFile: file }))
  assert.deepEqual(calls, ['install', 'remove'])
  assert.equal(missing.verdict, 'invalid', 'a run that never showed the managed file was read proves nothing')
})

test('the managed file is removed even when the install or a run fails', async () => {
  const calls: string[] = []
  const bad = { path: 'x', install: () => { calls.push('install'); throw new ManagedFileError('no') }, remove: () => void calls.push('remove') }
  await assert.rejects(runKit(opts('hide-all', { backup: { main: MAIN, where: 'managed' }, managedFile: bad })), ManagedFileError)
  assert.deepEqual(calls, ['install', 'remove'])
})

// ---- the managed file itself ------------------------------------------------------------

type Op = string
function fakeFs(existing = false): { f: Parameters<typeof managedFile>[1] extends infer O ? NonNullable<O extends { fsImpl?: infer F } ? F : never> : never; ops: Op[] } {
  const ops: Op[] = []
  let exists = existing
  const f = {
    existsSync: () => exists,
    mkdirSync: (d: unknown) => void ops.push(`mkdir ${String(d)}`),
    writeFileSync: (p: unknown, t: unknown) => {
      ops.push(`write ${String(p)} ${String(t).length > 10 ? 'text' : ''}`.trim())
      exists = true
    },
    rmSync: (p: unknown) => {
      ops.push(`rm ${String(p)}`)
      exists = false
    },
  } as never
  return { f, ops }
}

test('Windows: the file goes to Program Files, and is removed by the kit that wrote it', () => {
  const { f, ops } = fakeFs()
  const m = managedFile({ a: 1 }, { platform: 'win32', fsImpl: f })
  assert.equal(m.path, path.join('C:\\Program Files\\ClaudeCode', 'managed-settings.json'))
  m.install()
  assert.equal(ops.length, 2)
  m.remove()
  assert.ok(ops.at(-1)?.startsWith('rm '))
})

test('a managed file that is already there is never overwritten or removed', () => {
  const { f, ops } = fakeFs(true)
  const m = managedFile({}, { platform: 'win32', fsImpl: f })
  assert.throws(() => m.install(), /already exists/)
  m.remove()
  assert.deepEqual(ops, [])
})

test('remove does nothing before install', () => {
  const { f, ops } = fakeFs()
  managedFile({}, { platform: 'win32', fsImpl: f }).remove()
  assert.deepEqual(ops, [])
})

test('Windows without administrator rights says so', () => {
  const m = managedFile({}, { platform: 'win32', fsImpl: { ...fakeFs().f, mkdirSync: () => { throw new Error('EPERM') } } as never })
  assert.throws(() => m.install(), /administrator/)
})

test('macOS and Linux write through sudo -n, with the text on stdin, and remove through it too', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    const calls: string[] = []
    const { f } = fakeFs()
    const m = managedFile({ hooks: {} }, { platform, fsImpl: f, run: (cmd, args, input) => { calls.push(`${cmd} ${args.join(' ')}${input ? ' <stdin>' : ''}`); return { status: 0 } } })
    m.install()
    m.remove()
    assert.equal(calls.length, 3, platform)
    assert.ok(calls[0]?.startsWith('sudo -n mkdir -p '))
    assert.ok(calls[1]?.startsWith('sudo -n tee ') && calls[1].endsWith('<stdin>'))
    assert.ok(calls[2]?.startsWith('sudo -n rm -f '))
  }
})

test('a sudo that fails is an error, not a silent skip', () => {
  const m = managedFile({}, { platform: 'linux', fsImpl: fakeFs().f, run: () => ({ status: 1 }) })
  assert.throws(() => m.install(), /sudo -n failed/)
})

// ---- the command line -------------------------------------------------------------------

const cli = (...args: string[]) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', timeout: 60_000 })

test('--backup managed will not touch the managed file without --allow-managed-file', () => {
  const r = cli('--no-plugin', '--backup', 'managed', '--claude', process.execPath)
  assert.equal(r.status, 2)
  assert.match(r.stderr, /--allow-managed-file/)
})

test('--backup goes with --no-plugin, and its other flags go with --backup', () => {
  assert.equal(cli('--backup', 'user').status, 2)
  assert.equal(cli('--no-plugin', '--backup', 'sideways').status, 2)
  for (const flag of ['--outside', '--safe-mode', '--allow-managed-file']) assert.equal(cli('--no-plugin', flag).status, 2, flag)
  assert.equal(cli('--no-plugin', '--backup', 'user', '--allow-managed-file').status, 2)
  assert.equal(cli('--no-plugin', '--backup', 'user', '--outside', '--expect', 'clean').status, 2)
})
