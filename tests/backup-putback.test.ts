// The backup lock has no put-back (spec §5.2, §10, D-096): with the main lock down, a write that would replace a real
// secret with its placeholder is still refused, whatever the settings or the developer's choice file say.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { createChecker } from '../src/checker/index.ts'
import { NO_ALLOW, Redactor } from '../src/core/session.ts'
import { DEFAULTS } from '../src/core/settings.ts'
import { decide, type ActEnv, type Answer } from '../src/backup/act.ts'
import { makeFake, seededSource } from '../tools/test-sets/fakes.ts'

const GH = makeFake('github-pat', seededSource('backup-putback')).value
const CONFIG = path.join(os.tmpdir(), 'cfg-putback')
const DATA = path.join(CONFIG, 'aegiscontext')

function env(files: Record<string, string>, repo?: 'on' | 'off'): ActEnv {
  return {
    redactor: new Redactor({ checker: createChecker({}).checker, registered: [], hints: true, allow: NO_ALLOW }),
    settings: { ...DEFAULTS, put_back: { managedOff: false, ...(repo ? { repo } : {}) } },
    roots: { own: [DATA], config: CONFIG, caseless: process.platform !== 'linux' },
    budgetMs: 20_000,
    readFile: p => (p in files ? (files[p] as string) : undefined),
    realpath: p => p,
  }
}
const pre = (tool_name: string, tool_input: unknown) => ({ hook_event_name: 'PreToolUse', tool_name, tool_input, session_id: 's1', cwd: os.tmpdir() })
const denied = (a: Answer): boolean => ((a?.hookSpecificOutput ?? {}) as Record<string, unknown>).permissionDecision === 'deny'

test('a Write that would replace a real secret is refused even when a project says put-back is on', () => {
  const file = path.join(os.tmpdir(), 'conf.env')
  const disk = `DB_NAME=app\nGITHUB_TOKEN=${GH}\n`
  const redacted = `DB_NAME=app\nGITHUB_TOKEN=[REDACTED:GITHUB_PAT ...${GH.slice(-4)} #abcdefghijklm]\n`
  for (const repo of [undefined, 'on', 'off'] as const) assert.ok(denied(decide(pre('Write', { file_path: file, content: redacted }), env({ [file]: disk }, repo)).answer), String(repo))
})

test("a developer's choice file in the data folder changes nothing for the backup lock, and the file is protected", () => {
  const file = path.join(os.tmpdir(), 'conf.env')
  const choice = path.join(DATA, 'put-back.json')
  const disk = `GITHUB_TOKEN=${GH}\n`
  const redacted = `GITHUB_TOKEN=[REDACTED:GITHUB_PAT ...${GH.slice(-4)} #abcdefghijklm]\n`
  const files = { [file]: disk, [choice]: '{"all":"on"}' }
  assert.ok(denied(decide(pre('Write', { file_path: file, content: redacted }), env(files)).answer))
  assert.ok(denied(decide(pre('Write', { file_path: choice, content: '{"all":"on"}' }), env(files)).answer), 'Claude cannot write the choice file')
})
