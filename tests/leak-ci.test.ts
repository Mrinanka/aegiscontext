// Guards for step 1 "Done when": CI runs the leak test on 3 OSes against the pinned
// Claude Code, with hashes for every OS, and the kit really has a door for each
// item of plan 1a.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SCENARIOS } from '../tools/leak-test/scenarios.ts'
import { pinnedVersion, PIN_DIR } from '../tools/leak-test/claude-bin.ts'

const root = path.join(import.meta.dirname, '..')
const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8')

function job(name: string): string {
  const start = ci.indexOf(`\n  ${name}:\n`)
  assert.ok(start >= 0, `job ${name} exists`)
  const rest = ci.slice(start + 1)
  const next = rest.slice(1).search(/\n  \S/)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

test('CI runs the baseline on all 3 OSes, against the pinned version', () => {
  const leak = job('leak-test')
  assert.match(leak, /os: \[ubuntu-latest, windows-latest, macos-latest\]/)
  assert.match(leak, /fail-fast: false/)
  assert.match(leak, /npm ci --ignore-scripts --prefix tools\/leak-test\/claude-pin/)
  assert.match(leak, /npm run leak-test:baseline -- --require-pinned/)
  assert.match(leak, /timeout-minutes:/)
})

test('CI runs the rewrite test on all 3 OSes, with the pinned Claude Code installed so it cannot skip', () => {
  const leak = job('leak-test')
  assert.match(leak, /node --test tests\/rewrite-real\.test\.ts/)
  assert.ok(leak.indexOf('claude-pin') < leak.indexOf('rewrite-real.test.ts'))
  const test = fs.readFileSync(path.join(root, 'tests', 'rewrite-real.test.ts'), 'utf8')
  assert.match(test, /control: with no rewrite/)
})

test('CI finishes the password store and Node checks on each OS', () => {
  assert.match(job('leak-test'), /run\.ts runtime store/)
})

test('CI runs the kit once with no network at all, and proves there is none', () => {
  const leak = job('leak-test')
  assert.match(leak, /unshare --net/)
  assert.match(leak, /ip link set lo up/)
  assert.match(leak, /node:net.*\.connect\(443/)
})

test('the pin is one exact version, with a sha512 for every OS CI runs on', () => {
  assert.match(pinnedVersion(), /^\d+\.\d+\.\d+$/)
  const lock = JSON.parse(fs.readFileSync(path.join(PIN_DIR, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string; integrity?: string }> }
  for (const platform of ['linux-x64', 'win32-x64', 'darwin-arm64', 'darwin-x64']) {
    const entry = lock.packages[`node_modules/@anthropic-ai/claude-code-${platform}`]
    assert.equal(entry?.version, pinnedVersion(), platform)
    assert.match(entry?.integrity ?? '', /^sha512-/, platform)
  }
})

test('the root package stays free of Claude Code, so a normal install stays small', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}).sort(), ['@types/node', 'typescript'])
  assert.equal(pkg.dependencies, undefined)
})

test('the kit has a door for every place plan 1a plants fakes', () => {
  const doors = SCENARIOS.flatMap(s => s.doors.map(d => `${s.name}/${d}`))
  for (const needed of [
    'prompt-typed/prompt',
    'prompt-pasted/pasted',
    'read-file/read',
    'mention-file/mention',
    'bash-output/bash',
    'bash-failed/failed',
    'mcp-result/mcp',
    'subagent-read/subagent',
    'compaction/earlier',
    'compaction/summary',
    'resume/history',
  ]) assert.ok(doors.includes(needed), needed)
})

test('the resume door counts only what the resumed run sends, and its first run has no tool', () => {
  const resume = SCENARIOS.find(s => s.name === 'resume')
  assert.equal(resume?.countFromRun, 1)
  assert.equal(resume?.runs[0]?.withoutPlugin, true)
  assert.equal(resume?.runs[1]?.resume, true)
})
