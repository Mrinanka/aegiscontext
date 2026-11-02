// The kit's put-back doors (plan step 8, spec §10, D-096). The real runs are `npm run leak-test:put-back` and
// `leak-test:put-back-off` (CI, 3 systems); these are the parts that need no Claude Code.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileProblems, runArgs, writePutBackChoice } from '../tools/leak-test/kit.ts'
import { needlesFor } from '../tools/leak-test/detect.ts'
import { ALLOWED_TOOLS, MCP_TOOL, PUT_BACK_SCENARIOS, SCENARIOS, seenLines, type Ctx } from '../tools/leak-test/scenarios.ts'
import { makeFake, plant, seededSource } from '../tools/test-sets/fakes.ts'

const REPO = path.join(import.meta.dirname, '..')
const RUN = path.join(REPO, 'tools', 'leak-test', 'run.ts')

function ctxIn(dir: string): Ctx {
  const src = seededSource('leak-putback')
  const lines = ['witness-0123456789abcdef', plant(makeFake('github-pat', src), 'plain'), plant(makeFake('stripe', src), 'base64')]
  return { dir, witness: () => lines[0] as string, block: () => lines.join('\n'), bare: () => lines.join('\n') }
}

test('the allowed tools of every other door are exactly what they were', () => {
  assert.deepEqual(ALLOWED_TOOLS, ['Read', 'Bash', 'PowerShell', 'Agent', 'Task', 'Skill', MCP_TOOL])
  assert.ok(SCENARIOS.every(s => s.tools === undefined), 'no existing door gets Write or Edit')
})

test('the put-back doors are their own list, with their own names, and each declares what it proves', () => {
  const names = PUT_BACK_SCENARIOS.map(s => s.name)
  assert.equal(new Set(names).size, names.length)
  for (const n of names) assert.ok(!SCENARIOS.some(s => s.name === n), n)
  for (const want of ['putback-write', 'putback-edit', 'putback-failed-edit', 'putback-new-file', 'putback-subagent']) assert.ok(names.includes(want), want)
  for (const s of PUT_BACK_SCENARIOS) {
    assert.ok(s.tools?.includes('Write') || s.tools?.includes('Edit'), s.name)
    assert.ok(s.doors.length > 0 && s.runs.length > 0, s.name)
    assert.ok(s.expectFiles || s.cleanFiles, `${s.name} checks the folder afterwards`)
  }
})

test('the write door resumes and compacts, so a later request is checked too', () => {
  const write = PUT_BACK_SCENARIOS.find(s => s.name === 'putback-write')
  assert.ok(write)
  assert.ok(write.runs.some(r => r.resume))
  assert.ok(write.runs.some(r => /compact/.test(r.prompt({} as Ctx))))
})

test('each door expects the file to change with put-back on and to stay as it was with it off', () => {
  const dir = path.join(os.tmpdir(), 'lp-expect')
  const c = ctxIn(dir)
  for (const name of ['putback-write', 'putback-edit', 'putback-subagent']) {
    const s = PUT_BACK_SCENARIOS.find(x => x.name === name)
    assert.ok(s?.expectFiles && s.files, name)
    const original = s.files(c)['app.cfg']
    const on = s.expectFiles(c, 'on')['app.cfg']
    const off = s.expectFiles(c, 'off')['app.cfg']
    assert.equal(off, original, `${name}: off leaves the file as it was`)
    assert.notEqual(on, original, `${name}: on changes it`)
    assert.ok(String(on).length > String(original).length, name)
  }
  for (const name of ['putback-failed-edit', 'putback-new-file']) {
    const s = PUT_BACK_SCENARIOS.find(x => x.name === name)
    assert.ok(s?.expectFiles && s.files, name)
    for (const mode of ['on', 'off'] as const) assert.equal(s.expectFiles(c, mode)['app.cfg'], s.files(c)['app.cfg'], `${name} ${mode}: the original is never changed`)
  }
})

test('seenLines reads the numbered lines of a Read result and nothing else', () => {
  const text = ['     1→first line', '     2→[REDACTED:GITHUB_PAT ...abcd #aaaaaaaaaaaaa]', '     3→', '<system-reminder>not a file line</system-reminder>', '  4\tfourth'].join('\n')
  assert.deepEqual(seenLines({ lastUserText: text } as never), ['first line', '[REDACTED:GITHUB_PAT ...abcd #aaaaaaaaaaaaa]', '', 'fourth'])
  assert.deepEqual(seenLines({ lastUserText: 'no numbered lines here' } as never), [])
})

test('--allowedTools gets the scenario tools after the usual ones, and stays last', () => {
  const run = { prompt: () => 'x', script: () => () => ({ kind: 'text' as const, text: 'ok' }) }
  const plain = runArgs('p', run, 'sid', null, undefined, false)
  assert.deepEqual(plain.slice(plain.indexOf('--allowedTools') + 1), ALLOWED_TOOLS)
  const more = runArgs('p', run, 'sid', null, undefined, false, undefined, ['Write', 'Edit'])
  assert.deepEqual(more.slice(more.indexOf('--allowedTools') + 1), [...ALLOWED_TOOLS, 'Write', 'Edit'])
})

test('the choice file for a run goes in the run\'s own config folder and holds no value', () => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-config-'))
  try {
    writePutBackChoice(config, 'on')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(config, 'aegiscontext', 'put-back.json'), 'utf8')), { all: 'on' })
    writePutBackChoice(config, 'off')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(config, 'aegiscontext', 'put-back.json'), 'utf8')), { all: 'off' })
  } finally {
    fs.rmSync(config, { recursive: true, force: true })
  }
})

test('fileProblems: the exact text, a missing file, and a fake in a file that must be clean', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-files-'))
  try {
    const fake = makeFake('github-pat', seededSource('lp-fake')).value
    const needles = needlesFor('f', fake)
    fs.writeFileSync(path.join(dir, 'a.txt'), 'same\n')
    fs.writeFileSync(path.join(dir, 'clean.txt'), 'only placeholders [REDACTED:X #aaaaaaaaaaaaa]\n')
    fs.writeFileSync(path.join(dir, 'dirty.txt'), `leak ${fake}\n`)
    assert.deepEqual(fileProblems(dir, { 'a.txt': 'same\n' }, ['clean.txt'], needles), [])
    assert.deepEqual(fileProblems(dir, { 'a.txt': 'other\n' }, [], needles), ['a.txt is not what it should be (5 characters, 2 lines; expected 6, 2)'])
    assert.deepEqual(fileProblems(dir, { 'gone.txt': 'x' }, [], needles), ['gone.txt is missing'])
    assert.deepEqual(fileProblems(dir, {}, ['dirty.txt'], needles), ['dirty.txt holds a fake'])
    assert.deepEqual(fileProblems(dir, {}, ['absent.txt'], needles), ['absent.txt is missing'])
    assert.ok(!JSON.stringify(fileProblems(dir, { 'a.txt': fake }, ['dirty.txt'], needles)).includes(fake), 'a problem never holds a value')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('--put-back takes on or off, needs the plugin in the repo, and does not combine with the other tiers', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', timeout: 60_000 })
  for (const args of [['--put-back', 'maybe'], ['--put-back', 'on', '--no-plugin'], ['--put-back', 'on', '--backup', 'user', '--no-plugin'], ['--put-back', 'on', '--org', '--allow-managed-file'], ['--put-back', 'on', '--guarded', '--login', 'team'], ['--put-back', 'on', '--expect', 'leaks']]) {
    const r = run(...args)
    assert.equal(r.status, 2, args.join(' '))
    assert.match(r.stderr, /put-back|usage/i, args.join(' '))
  }
})

test('package.json and CI run the put-back doors, on and off, on every system', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  assert.match(pkg.scripts['leak-test:put-back'] ?? '', /run\.ts --put-back on/)
  assert.match(pkg.scripts['leak-test:put-back-off'] ?? '', /run\.ts --put-back off/)
  const ci = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8')
  assert.match(ci, /npm run leak-test:put-back -- --require-pinned/)
  assert.match(ci, /npm run leak-test:put-back-off -- --require-pinned/)
})
