// The weekly run (plan step 8, item 9): every door, the plugin tests and the rewrite test against the NEWEST Claude
// Code, as an early warning. It proves nothing for a release, which is tested on the pinned version (plan ground rules).
// The repo guard (tests/repo-setup.test.ts) already requires SHA-pinned actions, a job timeout and a concurrency group.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const weekly = fs.readFileSync(path.join(root, '.github', 'workflows', 'weekly.yml'), 'utf8')

test('it runs on a schedule, by hand, and when its own file changes (so it can be proven on a step branch)', () => {
  assert.match(weekly, /^on:\n(?:.*\n)*?\s+schedule:\n\s+- cron: '[0-9*/, -]+ [0-9*/, -]+ [0-9*/, -]+ [0-9*/, -]+ [0-9*/, -]+'/m)
  assert.match(weekly, /^\s+workflow_dispatch:/m)
  assert.match(weekly, /^\s+push:\n\s+paths:\n\s+- '\.github\/workflows\/weekly\.yml'/m)
})

test('the schedule is weekly, not more often', () => {
  const cron = /cron: '([^']+)'/.exec(weekly)?.[1] ?? ''
  const [minute, hour, day, month, weekday] = cron.split(' ')
  assert.match(minute ?? '', /^\d+$/)
  assert.match(hour ?? '', /^\d+$/)
  assert.equal(day, '*')
  assert.equal(month, '*')
  assert.match(weekday ?? '', /^[0-6]$/, 'one day of the week')
})

test('it can read the repo and nothing else, and it holds no secret', () => {
  assert.match(weekly, /^permissions:\n  contents: read\n/m)
  assert.ok(!/^\s+(?:id-token|actions|checks|deployments|issues|packages|pull-requests|statuses|security-events|attestations|pages): *(?:write|read)/m.test(weekly))
  assert.ok(!/secrets\./.test(weekly), 'no secret is used')
  assert.ok(!/ANTHROPIC_API_KEY/.test(weekly), 'no real key: the kit uses a mock and a made-up one')
})

test('it runs on all 3 systems, and one failure does not hide another', () => {
  assert.match(weekly, /os: \[ubuntu-latest, windows-latest, macos-latest\]/)
  assert.match(weekly, /fail-fast: false/)
})

test('it installs the newest Claude Code without running its install scripts, and runs that binary', () => {
  assert.match(weekly, /npm install[^\n]*--ignore-scripts[^\n]*@anthropic-ai\/claude-code@latest/)
  assert.match(weekly, /claude-code-\$\{process\.platform\}-\$\{process\.arch\}|claude-code-' \+ process\.platform/, 'the platform binary')
  assert.match(weekly, /GITHUB_ENV/, "the binary's path is passed to the later steps")
  assert.match(weekly, /GITHUB_PATH/, 'and its folder is put on the PATH, for claude plugin')
})

test('it prints the version it tested, first, so a failure says which one', () => {
  const version = weekly.indexOf('--version')
  assert.ok(version > 0)
  assert.ok(version < weekly.indexOf('claude plugin validate'))
})

test('it never asks for the pinned version, because newest is the point', () => {
  assert.ok(!weekly.includes('--require-pinned'))
})

test('it runs what plan step 8 lists, each against the newest binary', () => {
  for (const want of [
    'claude plugin validate ./plugin',
    'claude plugin test ./plugin',
    'node --test tests/rewrite-real.test.ts',
    'npm run leak-test:baseline -- --claude',
    'npm run leak-test -- --claude',
    'npm run leak-test:backup -- --claude',
    'npm run leak-test:backup-limits -- --claude',
    'npm run leak-test:guarded-login -- --claude',
    'npm run leak-test:put-back -- --claude',
    'npm run leak-test:put-back-off -- --claude',
  ]) assert.ok(weekly.includes(want), want)
  assert.match(weekly, /AEGIS_CLAUDE: \$\{\{ env\.CLAUDE_NEWEST \}\}/, 'the rewrite test is aimed at the newest binary')
})

test('it does not repeat the run that CI does for the pinned version, only the early warning', () => {
  assert.ok(!weekly.includes('leak-test:managed'), 'the managed run writes the machine\'s managed file: CI only')
  assert.ok(!weekly.includes('leak-test:org'), 'ditto')
})
