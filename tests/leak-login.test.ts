// The kit's login and observe runs (step 7). A login run seats Claude Code's built-in guard through a made-up Team or
// Enterprise login in the run's own config folder, with no account and no managed file. An observe run is the
// organization install with `mode: observe`. Their real runs are `npm run leak-test:guarded-login`, which works
// anywhere, and `npm run leak-test:org-observe`, in CI only.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { formatReport } from '../tools/leak-test/report.ts'
import { runKit, unexpectedAttempts, writeSettings, type KitOptions } from '../tools/leak-test/kit.ts'
import { LOGIN_HOSTS, fakeCredentials } from '../tools/leak-test/login.ts'
import { observeProblem, tierProblem } from '../tools/leak-test/org.ts'
import type { Run, Scenario } from '../tools/leak-test/scenarios.ts'

const STAND_IN = path.join(import.meta.dirname, 'fixtures', 'stand-in-claude.mjs')
const RUN = path.join(import.meta.dirname, '..', 'tools', 'leak-test', 'run.ts')

const PROMPT: Scenario[] = [
  { name: 'prompt', doors: ['typed'], runs: [{ prompt: c => `Note:\n${c.block('typed')}`, script: () => () => ({ kind: 'text', text: 'ok' }) }] },
]
const opts = (mode: string, extra: Partial<KitOptions> = {}): KitOptions => ({
  claude: { cmd: process.execPath, args: [STAND_IN, mode] },
  plugin: null,
  expect: 'clean',
  scenarios: PROMPT,
  timeoutMs: 20_000,
  ...extra,
})

const LOGIN_LOG = (plan: string): string => [
  `2026-11-02T10:00:00.000Z [DEBUG] cc-plugin-sec-default@builtin seated outermost: the organization is ${plan}`,
  '2026-11-02T10:00:01.000Z [DEBUG] hooks module aegiscontext@inline loaded (worker, environment 1, tier user); events: session.append',
].join('\n')
const MANAGED_LOG = '2026-11-02T10:00:00.000Z [DEBUG] cc-plugin-sec-default@builtin seated outermost: this machine has managed settings\n2026-11-02T10:00:01.000Z [DEBUG] hooks module aegiscontext@inline loaded (worker, environment 1, tier user); events: session.append'

// ---- the made-up login -----------------------------------------------------------------------------

test('fakeCredentials: the plan Claude Code reads, a token that is not one, and an expiry ahead so nothing tries to refresh it', () => {
  const c = fakeCredentials('team', 1_000)
  assert.equal(c.claudeAiOauth.subscriptionType, 'team')
  assert.equal(fakeCredentials('enterprise', 1_000).claudeAiOauth.subscriptionType, 'enterprise')
  assert.ok(c.claudeAiOauth.expiresAt > 1_000)
  assert.ok(c.claudeAiOauth.scopes.includes('user:inference'))
  assert.match(c.claudeAiOauth.accessToken, /^not-a-real/)
})

test('a login run writes the login into the run\'s own folder and passes no API key', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'login-'))
  const file = path.join(scratch, 'env.json')
  try {
    await runKit(opts('show-env', { fakeLogin: 'team', scratch, keep: true, extraEnv: { STAND_IN_ENV_FILE: file } }))
    assert.ok(!(JSON.parse(fs.readFileSync(file, 'utf8')) as string[]).includes('ANTHROPIC_API_KEY'))
    const run = fs.readdirSync(scratch).find(n => n.startsWith('leak-')) as string
    const saved = JSON.parse(fs.readFileSync(path.join(scratch, run, 'config', '.credentials.json'), 'utf8')) as ReturnType<typeof fakeCredentials>
    assert.equal(saved.claudeAiOauth.subscriptionType, 'team')
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})

test('a run with no login keeps its API key and has no login file', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'login-'))
  const file = path.join(scratch, 'env.json')
  try {
    await runKit(opts('show-env', { scratch, keep: true, extraEnv: { STAND_IN_ENV_FILE: file } }))
    assert.ok((JSON.parse(fs.readFileSync(file, 'utf8')) as string[]).includes('ANTHROPIC_API_KEY'))
    const run = fs.readdirSync(scratch).find(n => n.startsWith('leak-')) as string
    assert.ok(!fs.existsSync(path.join(scratch, run, 'config', '.credentials.json')))
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})

// ---- proof that the login, not a managed file, seated the guard ---------------------------------------

test('a login run must show the guard seated by that plan', () => {
  assert.equal(tierProblem(LOGIN_LOG('team'), 'guarded', 'team'), undefined)
  assert.equal(tierProblem(LOGIN_LOG('enterprise'), 'guarded', 'enterprise'), undefined)
  assert.match(tierProblem(LOGIN_LOG('enterprise'), 'guarded', 'team') ?? '', /team/)
})

test('a managed file left on the machine cannot pass as a login', () => {
  assert.match(tierProblem(MANAGED_LOG, 'guarded', 'team') ?? '', /team/)
  assert.equal(tierProblem(MANAGED_LOG, 'guarded'), undefined)
})

test('a run whose log shows the wrong seat is invalid, never clean', async () => {
  const r = await runKit(opts('debug-log', { tierProof: 'guarded', fakeLogin: 'team', expectFor: () => 'clean', extraEnv: { STAND_IN_DEBUG: MANAGED_LOG } }))
  assert.equal(r.verdict, 'invalid')
})

// ---- the one host a login may try ---------------------------------------------------------------------

test('unexpectedAttempts: only a CONNECT to a listed host is expected', () => {
  const host = 'api.anthropic.com:443'
  assert.deepEqual(unexpectedAttempts([{ kind: 'connect', host }], [host]), [])
  assert.equal(unexpectedAttempts([{ kind: 'http', host }], [host]).length, 1, 'a plain request would carry its contents to the trap')
  assert.equal(unexpectedAttempts([{ kind: 'connect', host: 'evil.example.test:443' }], [host]).length, 1)
  assert.equal(unexpectedAttempts([{ kind: 'connect', host: 'api.anthropic.com:80' }], [host]).length, 1)
  assert.equal(unexpectedAttempts([{ kind: 'connect', host }]).length, 1, 'no list: every attempt counts')
})

test('LOGIN_HOSTS holds Claude Code\'s own API host and nothing else', () => {
  assert.deepEqual(LOGIN_HOSTS, ['api.anthropic.com:443'])
})

test('an expected host does not invalidate a run, and the report still prints it', async () => {
  const r = await runKit(opts('network', { expect: 'leaks', expectedHosts: ['telemetry.example.test:443'] }))
  assert.equal(r.network.attempts.length, 1)
  assert.equal(r.verdict, 'pass')
  assert.match(formatReport(r), /network attempt: connect telemetry\.example\.test:443 \(expected, refused\)/)
})

test('any other host still invalidates a run', async () => {
  const r = await runKit(opts('network', { expect: 'leaks', expectedHosts: ['api.anthropic.com:443'] }))
  assert.equal(r.verdict, 'invalid')
  assert.doesNotMatch(formatReport(r), /expected, refused/)
})

// ---- settings for a run with no managed file ------------------------------------------------------------

test('writeSettings: aegisContext goes in the user settings beside any hooks; without it the file behaves as before', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-'))
  const file = path.join(dir, 'settings.json')
  const run = { prompt: () => 'x', script: () => () => ({ kind: 'text', text: 'ok' }) } as unknown as Run
  const base = opts('send-all')
  try {
    writeSettings(PROMPT[0] as Scenario, run, dir, dir, { ...base, aegisContext: { on_check_failure: 'hold' } })
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).aegisContext, { on_check_failure: 'hold' })
    writeSettings({ ...(PROMPT[0] as Scenario), contextHook: 'door' }, run, dir, dir, { ...base, aegisContext: { on_check_failure: 'hold' } })
    const both = JSON.parse(fs.readFileSync(file, 'utf8')) as { hooks?: unknown; aegisContext?: unknown }
    assert.ok(both.hooks && both.aegisContext)
    writeSettings(PROMPT[0] as Scenario, run, dir, dir, base)
    assert.ok(!fs.existsSync(file))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ---- observe: the log must show the tool was running ---------------------------------------------------

test('observeProblem: a would-hide line proves observe ran; no line, or an empty log, proves nothing', () => {
  assert.equal(observeProblem('{"event":"hide","action":"would-hide","detail":"would have hidden"}\n'), undefined)
  assert.match(observeProblem('{"event":"notice","door":"store"}\n') ?? '', /would/)
  assert.match(observeProblem('') ?? '', /would/)
  assert.match(observeProblem('{"event":"hide","action":"hide"}\n') ?? '', /hid/, 'a real hide under observe is a failure')
})

test('an observe run with nothing in the plugin log is invalid, never a pass', async () => {
  const r = await runKit(opts('send-all', { expect: 'leaks', observeProof: true }))
  assert.equal(r.verdict, 'invalid')
})

// ---- the command line ---------------------------------------------------------------------------------

const cli = (...args: string[]) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', timeout: 60_000 })

test('--login takes team or enterprise, and goes with --guarded', () => {
  assert.match(cli('--guarded', '--login', 'pro').stderr, /--login/)
  assert.equal(cli('--guarded', '--login', 'pro').status, 2)
  assert.match(cli('--login', 'team').stderr, /--guarded/)
  assert.match(cli('--org', '--login', 'team', '--allow-managed-file').stderr, /--login/)
})

test('--login writes no managed file, so it refuses --allow-managed-file and does not need it', () => {
  assert.match(cli('--guarded', '--login', 'team', '--allow-managed-file').stderr, /--login/)
  assert.doesNotMatch(cli('--guarded', '--login', 'team', '--claude', process.execPath, '--only', 'nothing').stderr, /pass --allow-managed-file/)
})

test('--observe goes with --org alone', () => {
  assert.match(cli('--observe', '--claude', process.execPath).stderr, /--observe/)
  assert.match(cli('--guarded', '--observe', '--allow-managed-file').stderr, /--observe/)
  assert.equal(cli('--observe').status, 2)
})
