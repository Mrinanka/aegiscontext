// The leak test kit's core (spec §20, plan 1a). Plants fakes through every door,
// runs Claude Code against the local mock, and reports what reached it.
//
//   expect 'clean'  any fake seen is a failure ('leak')
//   expect 'leaks'  any fake NOT seen is a failure ('blind'): the baseline, which
//                   proves the kit can see, run against the empty tool
//
// A door proves nothing unless it was used, so each has a witness; with no witness
// in a request, or a run that failed, the door is 'invalid', never clean.
// The report holds labels only, and is checked for fakes before it leaves here.

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { backendFor } from '../../src/core/backends.ts'
import { saveList } from '../../src/core/store.ts'
import { nodeExec, nodeFiles, thisOS } from '../measure/store.ts'
import { holdsFake, needlesFor, scrub, witnessNeedle, type Needle, type Part } from './detect.ts'
import { searchDisk, summarizeDisk, type DiskHit } from './disk.ts'
import { startLeakMock, type RequestRecord } from './server.ts'
import { startTrap, type Attempt } from './trap.ts'
import { ALLOWED_TOOLS, SCENARIOS, type Ctx, type Run, type Scenario } from './scenarios.ts'
import type { ClaudeCommand } from './claude-bin.ts'
import { MANAGED_PROOF_NOTICE, mergeHooks, userSettings } from './fixtures/backup-settings.ts'
import { fakeCredentials, type LoginPlan } from './login.ts'
import { observeProblem, tierProblem, warningProblem, type TierMode } from './org.ts'
import type { ManagedFile } from './managed-file.ts'
import { makeFake, makeWitness, plant, randomSource, type Fake, type FakeKind, type PlantForm } from '../test-sets/fakes.ts'

export class KitError extends Error {}

export type Verdict = 'pass' | 'leak' | 'blind' | 'invalid'

export type FakeResult = {
  id: string
  kind: FakeKind
  plantedAs: PlantForm
  leaked: boolean
  forms: string[]
  parts: Part[]
  /** The API paths it went to: /v1/messages, or something unexpected such as a telemetry path. */
  paths: string[]
  requests: number
}

export type DoorResult = { scenario: string; door: string; witnessSeen: boolean; verdict: Verdict; fakes: FakeResult[] }

export type RunResult = {
  scenario: string
  run: number
  exit: number | null
  timedOut: boolean
  seconds: number
  requests: number
  /** Only for a run that failed, with every fake scrubbed. */
  stderr?: string[]
}

export type Report = {
  kit: 1
  expect: 'clean' | 'leaks'
  os: string
  claudeVersion: string
  pinnedVersion?: string
  plugin: string
  /** Set when the backup lock, not the plugin, was the tool: its settings hooks were in the user's or the managed settings. */
  backup?: 'user' | 'managed'
  verdict: Verdict
  doors: DoorResult[]
  runs: RunResult[]
  /** `expected` counts the attempts this run allowed (a login run's API host). The proxy refused every one. */
  network: { attempts: Attempt[]; expected?: string[] }
  /** Requests whose body could not be searched. */
  unreadable: number
  disk: DiskHit[]
  /** Scratch folders that could not be removed. */
  leftovers: number
}

export type KitOptions = {
  claude: ClaudeCommand
  /** A plugin folder, or null to load none (for a tool installed by managed settings). */
  plugin: string | null
  expect: 'clean' | 'leaks'
  scenarios?: Scenario[]
  /** Scratch parent folder. Default: the OS temp folder. */
  scratch?: string
  keep?: boolean
  timeoutMs?: number
  pinned?: string
  requirePinned?: boolean
  extraEnv?: Record<string, string>
  /** Test the backup lock: `main` is the program's path (plugin/backup/backup/main.js). */
  backup?: { main: string; where: 'user' | 'managed' }
  /** Start Claude Code with --safe-mode, which turns off user hooks and plugins (check 0.8). */
  safeMode?: boolean
  /** The machine's managed settings file, written before the run and removed after it. */
  managedFile?: ManagedFile
  /** What each door is expected to do, when the doors differ (the guarded run). Default: `expect` for all. */
  expectFor?: (scenario: string, door: string) => 'clean' | 'leaks'
  /** Ask Claude Code for a debug log of every run and require it to prove the tool's tier (see org.ts). */
  tierProof?: TierMode
  /** A made-up login in the run's own config folder, and no API key, so the plan is what seats the built-in guard. */
  fakeLogin?: LoginPlan
  /** Hosts a CONNECT to does not make the run invalid. The proxy still refuses them and the report still prints them. */
  expectedHosts?: string[]
  /** Written under the `aegisContext` key of the user settings, for a run with no managed file. */
  aegisContext?: Record<string, unknown>
  /** Require the plugin's log to show that observe mode ran (see `observeProblem`). */
  observeProof?: boolean
  /** The developer's put-back choice, written into each run's own config folder before it starts (D-096). */
  putBack?: 'on' | 'off'
}

const RUN_TIMEOUT_MS = 180_000
const KILL_GRACE_MS = 3_000

// Each door gets one fake per line, so a line-based tool or test can treat them apart.
const PLANTS: [FakeKind, PlantForm][] = [
  ['github-pat', 'plain'],
  ['aws-access-key', 'plain'],
  ['labelled-password', 'plain'],
  ['connection-string', 'plain'],
  ['stripe', 'base64'],
  ['gitlab-pat', 'url'],
  ['private-key', 'json-escaped'],
]

// Inherited only if listed: a real token in the environment must never reach a run.
const ENV_KEEP = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'USER', 'USERNAME', 'LOGNAME',
  'LANG', 'LC_ALL', 'SHELL', 'TERM', 'CLAUDE_CODE_GIT_BASH_PATH', 'PSMODULEPATH', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR',
])

const inheritedEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => ENV_KEEP.has(k.toUpperCase())))

function runEnv(mock: { host: string; port: number }, trap: { host: string; port: number }, configDir: string, extra: Record<string, string> = {}, login = false): NodeJS.ProcessEnv {
  const proxy = `http://${trap.host}:${trap.port}`
  return {
    ...inheritedEnv(),
    ANTHROPIC_BASE_URL: `http://${mock.host}:${mock.port}`,
    ...(login ? {} : { ANTHROPIC_API_KEY: 'mock-not-a-key' }),
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
    DISABLE_AUTOUPDATER: '1',
    HTTPS_PROXY: proxy,
    HTTP_PROXY: proxy,
    NO_PROXY: `${mock.host},localhost`,
    ...extra,
  }
}

function checkVersion(claude: ClaudeCommand, opts: KitOptions): string {
  const hint = 'pass the real binary with --claude <path>'
  if (/\.(cmd|bat)$/i.test(claude.cmd)) throw new KitError(`${claude.cmd} is a shell shim, which can't be started directly: ${hint}`)
  const r = spawnSync(claude.cmd, [...(claude.args ?? []), '--version'], { encoding: 'utf8', timeout: 30_000, env: inheritedEnv() })
  if (r.error) throw new KitError(`could not start ${path.basename(claude.cmd)}: install Claude Code, or ${hint}`)
  const version = /^(\d+\.\d+\.\d+)/.exec(r.stdout ?? '')?.[1]
  if (r.status !== 0 || !version) throw new KitError(`could not read the Claude Code version from ${path.basename(claude.cmd)}`)
  if (opts.requirePinned && version !== opts.pinned) throw new KitError(`Claude Code ${version} found; this run requires the pinned ${opts.pinned}`)
  return version
}

type RunOutcome = { exit: number | null; timedOut: boolean; seconds: number; stderr: string; stdout: string }

function runClaude(claude: ClaudeCommand, args: string[], cwd: string, env: NodeJS.ProcessEnv, stdin: string | undefined, timeoutMs: number): Promise<RunOutcome> {
  return new Promise(resolve => {
    const t0 = Date.now()
    const child = spawn(claude.cmd, [...(claude.args ?? []), ...args], { cwd, env, stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
    let stderr = ''
    let stdout = ''
    let timedOut = false
    let graceTimer: NodeJS.Timeout | undefined
    const finish = (exit: number | null): void => {
      clearTimeout(timer)
      clearTimeout(graceTimer)
      resolve({ exit, timedOut, seconds: Math.round((Date.now() - t0) / 100) / 10, stderr, stdout })
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      // A killed process's own children can hold the pipes open, so don't wait for 'close' for ever.
      graceTimer = setTimeout(() => finish(null), KILL_GRACE_MS)
    }, timeoutMs)
    child.stderr?.on('data', c => { if (stderr.length < 8192) stderr += c })
    child.stdout?.on('data', c => { if (stdout.length < 8192) stdout += c })
    child.stdin?.on('error', () => {})
    child.stdin?.end(stdin)
    child.on('error', () => finish(null))
    child.on('close', code => finish(code))
  })
}

type DoorState = { name: string; witness: string; witnessId: string; witnessSeen: boolean; fakes: { id: string; fake: Fake; form: PlantForm; hits: { part: Part; form: string; path: string; request: string }[] }[] }

function plantDoors(scenario: Scenario): DoorState[] {
  const src = randomSource()
  return scenario.doors.map(name => ({
    name,
    witness: makeWitness(src),
    witnessId: `witness:${scenario.name}/${name}`,
    witnessSeen: false,
    fakes: PLANTS.map(([kind, form]) => ({ id: `${scenario.name}/${name}/${kind}`, fake: makeFake(kind, src), form, hits: [] })),
  }))
}

const needlesOf = (doors: DoorState[]): Needle[] =>
  doors.flatMap(d => [witnessNeedle(d.witnessId, d.witness), ...d.fakes.flatMap(f => needlesFor(f.id, f.fake.value))])

function makeCtx(dir: string, doors: DoorState[]): Ctx {
  const door = (name: string): DoorState => {
    const d = doors.find(x => x.name === name)
    if (!d) throw new KitError(`scenario uses an undeclared door: ${name}`)
    return d
  }
  return {
    dir,
    witness: name => door(name).witness,
    block: name => [door(name).witness, ...door(name).fakes.map(f => plant(f.fake, f.form))].join('\n'),
    bare: name => [door(name).witness, ...door(name).fakes.map(f => f.fake.value)].join('\n'),
  }
}

function collectHits(record: RequestRecord, runIndex: number, doors: DoorState[], countFrom: number): void {
  if (runIndex < countFrom) return
  for (const hit of record.hits) {
    for (const d of doors) {
      if (hit.fakeId === d.witnessId) d.witnessSeen = true
      for (const f of d.fakes) {
        if (hit.fakeId === f.id) f.hits.push({ part: hit.part, form: hit.form, path: record.path, request: `${runIndex}:${record.i}` })
      }
    }
  }
}

export function runArgs(prompt: string, run: Run, sessionId: string, plugin: string | null, mcpConfig: string | undefined, safeMode: boolean, debugFile?: string, extraTools: readonly string[] = []): string[] {
  return [
    '-p', prompt,
    ...(safeMode ? ['--safe-mode'] : []),
    ...(debugFile ? ['--debug-file', debugFile] : []),
    ...(plugin && !run.withoutPlugin ? ['--plugin-dir', plugin] : []),
    ...(run.resume ? ['--resume', sessionId] : ['--session-id', sessionId]),
    ...(mcpConfig ? ['--mcp-config', mcpConfig, '--strict-mcp-config'] : []),
    // Last: this flag takes several values and swallows what follows.
    '--allowedTools', ...ALLOWED_TOOLS, ...extraTools,
  ]
}

/** The developer's choice file, as `/redact put-back` would write it: paths and on or off, no value. */
export function writePutBackChoice(configDir: string, value: 'on' | 'off'): void {
  const dir = path.join(configDir, 'aegiscontext')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'put-back.json'), JSON.stringify({ all: value }))
}

/**
 * What is wrong with the folder after a put-back door's runs: a file that is not what it should be, one that is missing,
 * or a fake in a file that must hold none. A problem names a file and never holds a value.
 */
export function fileProblems(dir: string, expected: Record<string, string>, clean: readonly string[], needles: readonly Needle[]): string[] {
  const problems: string[] = []
  const read = (name: string): string | undefined => {
    try {
      return fs.readFileSync(path.join(dir, name), 'utf8')
    } catch {
      return undefined
    }
  }
  for (const [name, text] of Object.entries(expected)) {
    const got = read(name)
    if (got === undefined) problems.push(`${name} is missing`)
    else if (got !== text) problems.push(`${name} is not what it should be`)
  }
  for (const name of clean) {
    const got = read(name)
    if (got === undefined) problems.push(`${name} is missing`)
    else if (holdsFake(got, needles)) problems.push(`${name} holds a fake`)
  }
  return problems
}

const FIXTURES = path.join(import.meta.dirname, 'fixtures')

function writeExtras(s: Scenario, ctx: Ctx, base: string, configDir: string): string | undefined {
  if (s.contextHook) {
    const file = path.join(base, 'context.txt')
    fs.writeFileSync(file, ctx.block(s.contextHook))
  }
  if (!s.mcp) return undefined
  const note = path.join(base, 'mcp-note.txt')
  fs.writeFileSync(note, ctx.block(s.mcp))
  const config = path.join(base, 'mcp.json')
  const server = { type: 'stdio', command: process.execPath, args: [path.join(FIXTURES, 'mcp-server.mjs')], env: { LEAK_MCP_FILE: note } }
  fs.writeFileSync(config, JSON.stringify({ mcpServers: { leak: server } }))
  return config
}

/** The settings file for one run: the scenario's own hook, and the backup lock's when it is the tool and this run is not one made before it was installed. */
export function writeSettings(s: Scenario, run: Run, base: string, configDir: string, opts: KitOptions): void {
  let hooks: Record<string, unknown[]> = {}
  if (s.contextHook) {
    const command = `node "${path.join(FIXTURES, 'context-hook.mjs')}" "${path.join(base, 'context.txt')}"`
    hooks = { UserPromptSubmit: [{ hooks: [{ type: 'command', command, timeout: 30 }] }] }
  }
  if (opts.backup?.where === 'user' && !run.withoutPlugin) hooks = mergeHooks(userSettings(opts.backup.main).hooks, hooks)
  const file = path.join(configDir, 'settings.json')
  const settings = { ...(Object.keys(hooks).length > 0 ? { hooks } : {}), ...(opts.aegisContext ? { aegisContext: opts.aegisContext } : {}) }
  if (Object.keys(settings).length > 0) fs.writeFileSync(file, JSON.stringify(settings))
  else fs.rmSync(file, { force: true })
}

function removeFolder(dir: string): boolean {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    return true
  } catch {
    return false
  }
}

type ScenarioOutcome = { doors: DoorState[]; runs: RunResult[]; unreadable: number; failed: boolean; leftover: boolean; held: boolean }

async function runScenario(s: Scenario, opts: KitOptions, trap: { host: string; port: number }, disk: Map<string, Set<string>>, allNeedles: Needle[]): Promise<ScenarioOutcome> {
  const base = fs.mkdtempSync(path.join(opts.scratch ?? os.tmpdir(), 'leak-'))
  const work = path.join(base, 'work')
  const configDir = path.join(base, 'config')
  fs.mkdirSync(work)
  fs.mkdirSync(configDir)
  if (opts.fakeLogin) fs.writeFileSync(path.join(configDir, '.credentials.json'), JSON.stringify(fakeCredentials(opts.fakeLogin, Date.now())))
  if (opts.putBack) writePutBackChoice(configDir, opts.putBack)
  const doors = plantDoors(s)
  const needles = needlesOf(doors)
  allNeedles.push(...needles)
  const ctx = makeCtx(work, doors)
  const sessionId = randomUUID()
  const runs: RunResult[] = []
  let unreadable = 0
  let failed = false
  let leftover = false
  let debugLogs = ''
  let sentRequest = false
  // With the backup lock as the tool, a stopped prompt shows the lock's own reason.
  const heldRe = opts.backup ? s.heldBackup : s.heldMessage
  let held = heldRe !== undefined && opts.expect === 'clean' && !s.doors.some(d => opts.expectFor?.(s.name, d) === 'leaks')
  const store = s.seedStore === undefined ? undefined : backendFor(thisOS(), { exec: nodeExec, files: nodeFiles(path.join(configDir, 'aegiscontext', 'store')) })
  try {
    for (const [name, content] of Object.entries(s.files?.(ctx) ?? {})) {
      fs.mkdirSync(path.dirname(path.join(work, name)), { recursive: true })
      fs.writeFileSync(path.join(work, name), content)
    }
    const mcpConfig = writeExtras(s, ctx, base, configDir)
    if (store) await saveList(store, doors.flatMap(d => d.fakes.map(f => ({ value: f.fake.value, label: 'kit', added: '2026-11-01' }))))
    for (const [index, run] of s.runs.entries()) {
      writeSettings(s, run, base, configDir, opts)
      const mock = await startLeakMock({ script: run.script(ctx), needles })
      const env = runEnv(mock, trap, configDir, opts.extraEnv, opts.fakeLogin !== undefined)
      const debugFile = opts.tierProof ? path.join(base, `debug-${index}.log`) : undefined
      const args = runArgs(run.prompt(ctx), run, sessionId, opts.plugin, mcpConfig, opts.safeMode === true, debugFile, s.tools)
      const outcome = await runClaude(opts.claude, args, work, env, run.stdin?.(ctx), opts.timeoutMs ?? RUN_TIMEOUT_MS)
      await mock.close()
      for (const r of mock.records) {
        collectHits(r, index, doors, s.countFromRun ?? 0)
        if (r.unreadable) unreadable += 1
      }
      if (index >= (s.countFromRun ?? 0) && (mock.records.length > 0 || !heldRe?.test(outcome.stdout))) held = false
      if (opts.tierProof && !run.withoutPlugin) {
        const problem = debugFile === undefined ? 'no debug file was asked for' : debugProblem(debugFile, opts.tierProof, opts.fakeLogin)
        if (problem) {
          console.error(`${opts.tierProof} run, ${s.name} run ${index}: ${problem}`)
          failed = true
        }
        if (debugFile !== undefined && fs.existsSync(debugFile)) debugLogs += fs.readFileSync(debugFile, 'utf8')
        if (mock.records.length > 0) sentRequest = true
      }
      const bad = outcome.timedOut || outcome.exit !== 0
      if (bad) failed = true
      runs.push({
        scenario: s.name,
        run: index,
        exit: outcome.exit,
        timedOut: outcome.timedOut,
        seconds: outcome.seconds,
        requests: mock.records.length,
        ...(bad ? { stderr: scrub(outcome.stderr, needles).split(/\r?\n/).filter(l => l.trim() !== '').slice(0, 4).map(l => l.slice(0, 200)) } : {}),
      })
    }
    searchDisk(configDir, needles.filter(n => !n.fakeId.startsWith('witness:')), disk)
    pluginFailures(configDir, needles, s.name)
    // A put-back door is proven by what is on disk: restored with put-back on, refused and untouched with it off.
    const wrong = opts.putBack !== undefined && (s.expectFiles || s.cleanFiles) ? fileProblems(work, s.expectFiles?.(ctx, opts.putBack) ?? {}, s.cleanFiles ?? [], needles.filter(n => !n.fakeId.startsWith('witness:'))) : []
    for (const problem of wrong) {
      console.error(`put-back ${opts.putBack}, ${s.name}: ${problem}`)
      failed = true
    }
    const shown = opts.tierProof ? warningProblem(debugLogs, opts.tierProof, sentRequest) : undefined
    if (shown) {
      console.error(`${opts.tierProof} run, ${s.name}: ${shown}`)
      failed = true
    }
    const observed = opts.observeProof ? observeProblem(pluginLog(configDir)) : undefined
    if (observed) {
      console.error(`observe run, ${s.name}: ${observed}`)
      failed = true
    }
    if (opts.backup?.where === 'managed' && !managedProofSeen(configDir)) {
      console.error(`managed run, ${s.name}: the backup lock never logged the notice that proves it read the managed settings file's aegisContext key`)
      failed = true
    }
  } finally {
    if (store) await saveList(store, []).catch(() => undefined)
    // In finally: the folder holds this run's fakes, so it goes even if a step throws.
    if (!opts.keep) leftover = !removeFolder(base)
  }
  return { doors, runs, unreadable, failed, leftover, held }
}

/** Reads one run's debug log and says what is wrong with it, if anything. The log is read here and never printed. */
function debugProblem(file: string, mode: TierMode, plan?: LoginPlan): string | undefined {
  if (!fs.existsSync(file)) return 'Claude Code wrote no debug log, so the tier of the tool is not proven'
  return tierProblem(fs.readFileSync(file, 'utf8'), mode, plan)
}

/** The main lock's log lines of a run. The log holds no value; this text stays in memory. */
function pluginLog(configDir: string): string {
  const dir = path.join(configDir, 'aegiscontext', 'log')
  if (!fs.existsSync(dir)) return ''
  return fs.readdirSync(dir).filter(name => !name.endsWith('.backup.jsonl')).map(name => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n')
}

/** The managed file carries a setting the tool does not know; reading it is logged as a notice. */
function managedProofSeen(configDir: string): boolean {
  const dir = path.join(configDir, 'aegiscontext', 'log')
  if (!fs.existsSync(dir)) return false
  const details = (name: string): unknown[] =>
    fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(l => l !== '').map(l => {
      try {
        return (JSON.parse(l) as { detail?: unknown }).detail
      } catch {
        return undefined
      }
    })
  return fs.readdirSync(dir).some(name => name.endsWith('.backup.jsonl') && details(name).includes(MANAGED_PROOF_NOTICE))
}

/** What the plugin logged as failed, because a `-p` run shows no warning. The log holds no value; it is scrubbed anyway. */
function pluginFailures(configDir: string, needles: readonly Needle[], scenario: string): void {
  const dir = path.join(configDir, 'aegiscontext', 'log')
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (line.includes('"event":"failure"') || line.includes('"door":"store"') || line.includes('"door":"guard"')) console.error(`plugin log, ${scenario}: ${scrub(line, needles).slice(0, 300)}`)
    }
  }
}

export function doorVerdict(d: Pick<DoorState, 'fakes' | 'witnessSeen'>, expect: KitOptions['expect'], failed: boolean, held = false): Verdict {
  const leaked = d.fakes.filter(f => f.hits.length > 0).length
  if (expect === 'clean' && leaked > 0) return 'leak'
  // Stopped on purpose: no request left, and the person was told why. The witness can't be there.
  if (held && !failed) return 'pass'
  if (failed || !d.witnessSeen) return 'invalid'
  if (expect === 'leaks' && leaked < d.fakes.length) return 'blind'
  return 'pass'
}

const unique = <T>(items: T[]): T[] => [...new Set(items)]

function doorResult(scenario: string, d: DoorState, verdict: Verdict): DoorResult {
  return {
    scenario,
    door: d.name,
    witnessSeen: d.witnessSeen,
    verdict,
    fakes: d.fakes.map(f => ({
      id: f.id,
      kind: f.fake.kind,
      plantedAs: f.form,
      leaked: f.hits.length > 0,
      forms: unique(f.hits.map(h => h.form)).sort(),
      parts: unique(f.hits.map(h => h.part)).sort(),
      paths: unique(f.hits.map(h => h.path)).sort(),
      requests: unique(f.hits.map(h => h.request)).length,
    })),
  }
}

/** Only a CONNECT to a listed host is expected: the proxy refuses it before anything is sent, which a plain request can't say. */
export const unexpectedAttempts = (attempts: readonly Attempt[], hosts: readonly string[] = []): Attempt[] =>
  attempts.filter(a => !(a.kind === 'connect' && hosts.includes(a.host)))

function overall(doors: DoorResult[], attempts: Attempt[], unreadable: number): Verdict {
  if (doors.length === 0) return 'invalid'
  if (doors.some(d => d.verdict === 'leak')) return 'leak'
  if (attempts.length > 0 || unreadable > 0 || doors.some(d => d.verdict === 'invalid')) return 'invalid'
  if (doors.some(d => d.verdict === 'blind')) return 'blind'
  return 'pass'
}

/** The last check before a report leaves the kit. */
export function assertNoFakes(text: string, needles: readonly Needle[]): void {
  if (holdsFake(text, needles)) throw new KitError('a fake reached the report; it was not printed')
}

export const exitCodeFor = (r: Report): number => (r.verdict === 'pass' ? 0 : r.verdict === 'invalid' ? 2 : 1)

export async function runKit(opts: KitOptions): Promise<Report> {
  const claudeVersion = checkVersion(opts.claude, opts)
  const trap = await startTrap()
  const disk = new Map<string, Set<string>>()
  const allNeedles: Needle[] = []
  const doors: DoorResult[] = []
  const runs: RunResult[] = []
  let unreadable = 0
  let leftovers = 0
  try {
    // Inside the try: whatever the install did, the file comes out again.
    opts.managedFile?.install()
    for (const s of opts.scenarios ?? SCENARIOS) {
      const out = await runScenario(s, opts, trap, disk, allNeedles)
      for (const d of out.doors) doors.push(doorResult(s.name, d, doorVerdict(d, opts.expectFor?.(s.name, d.name) ?? opts.expect, out.failed, out.held)))
      runs.push(...out.runs)
      unreadable += out.unreadable
      if (out.leftover) leftovers += 1
    }
  } finally {
    await trap.close()
    opts.managedFile?.remove()
  }
  const attempts = trap.attempts
  const report: Report = {
    kit: 1,
    expect: opts.expect,
    os: `${process.platform}-${process.arch}`,
    claudeVersion,
    ...(opts.pinned ? { pinnedVersion: opts.pinned } : {}),
    plugin: opts.plugin ? path.basename(opts.plugin) : 'none',
    ...(opts.backup ? { backup: opts.backup.where } : {}),
    verdict: overall(doors, unexpectedAttempts(attempts, opts.expectedHosts), unreadable),
    doors,
    runs,
    network: { attempts, ...(opts.expectedHosts ? { expected: opts.expectedHosts } : {}) },
    unreadable,
    disk: summarizeDisk(disk),
    leftovers,
  }
  assertNoFakes(JSON.stringify(report), allNeedles.filter(n => !n.fakeId.startsWith('witness:')))
  return report
}
