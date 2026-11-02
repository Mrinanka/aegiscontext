// Step 8, spike S7 as a test (D-096): can a mod rewrite a Write or Edit input before the tool runs, so that
// the file on disk holds a word the model never saw? Real `claude -p` against the kit's mock, a scratch mod
// (tools/leak-test/fixtures/rewrite-plugin) and a harmless word. No key, no network, no secret.
//
// The mock plays: Write a file holding a placeholder, Edit that line through the placeholder, stop.
// The control (no switch set) shows the test can fail. Skips, saying why, where Claude Code isn't installed.
// The binary comes from resolveClaude, or from AEGIS_CLAUDE (the weekly run aims it at the newest version).

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveClaude } from '../tools/leak-test/claude-bin.ts'
import { needlesFor } from '../tools/leak-test/detect.ts'
import { startLeakMock, type Reply } from '../tools/leak-test/server.ts'

const root = path.join(import.meta.dirname, '..')
const plugin = path.join(root, 'tools', 'leak-test', 'fixtures', 'rewrite-plugin')
const claude = resolveClaude(process.env.AEGIS_CLAUDE ? { explicit: process.env.AEGIS_CLAUDE } : {}).cmd
const skip = claude === 'claude' ? 'Claude Code is not installed (no pinned copy, no AEGIS_CLAUDE)' : false
// The real path: a Windows runner's temp folder has an 8.3 short name (RUNNER~1), and Claude Code then
// treats the file as outside the working folder and refuses the Write.
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'rewrite-real-')))
after(() => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))

// Built from pieces, like the mod's own copies.
const WORD = ['rewrite', 'marker', 'zq41'].join('-')
const PLACEHOLDER = ['[REDACTED', 'rw0001]'].join(':')

type Outcome = { file: string | undefined; seen: string | undefined; wordRequests: number; requests: number; edited: string }

async function run(name: string, switches: string[], steps: (file: string) => Reply[]): Promise<Outcome> {
  const dir = path.join(base, name)
  const work = path.join(dir, 'work')
  const config = path.join(dir, 'config')
  for (const d of [work, config, path.join(work, '.rw')]) fs.mkdirSync(d, { recursive: true })
  for (const s of switches) fs.writeFileSync(path.join(work, '.rw', s), '')
  const file = path.join(work, 'out.txt')
  const replies = steps(file)
  const mock = await startLeakMock({ script: req => replies[req.index] ?? { kind: 'text', text: 'done' }, needles: needlesFor('word', WORD) })
  const keep = ['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.includes(k.toUpperCase())))
  let edited = ''
  await new Promise<number | null>((resolve, reject) => {
    const child = spawn(claude, ['-p', 'Please go on.', '--plugin-dir', plugin, '--allowedTools', 'Write', 'Edit'], {
      cwd: work,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...env, ANTHROPIC_BASE_URL: `http://${mock.host}:${mock.port}`, ANTHROPIC_API_KEY: 'mock-not-a-key', CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1', DISABLE_AUTOUPDATER: '1' },
    })
    child.stdout?.on('data', c => { edited += c })
    child.on('error', reject)
    child.on('close', resolve)
  })
  await mock.close()
  const sent = mock.records.filter(r => r.path.startsWith('/v1/messages'))
  const read = (p: string): string | undefined => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined)
  return { file: read(file), seen: read(path.join(work, '.rw', 'seen')), wordRequests: sent.filter(r => r.hits.length > 0).length, requests: sent.length, edited }
}

const writeThenEdit = (file: string): Reply[] => [
  { kind: 'tool', name: 'Write', input: { file_path: file, content: `token=${PLACEHOLDER}\nother=1\n` } },
  { kind: 'tool', name: 'Edit', input: { file_path: file, old_string: `token=${PLACEHOLDER}`, new_string: `token=${PLACEHOLDER}-two` } },
]

test('rewrite and hide: the word is on disk after a Write and an Edit through its placeholder, and in no request', { skip, timeout: 180_000 }, async () => {
  const r = await run('on', ['rewrite', 'hide'], writeThenEdit)
  assert.ok(r.requests >= 3, `the run sent ${r.requests} requests, so it proves nothing`)
  assert.equal(r.file, `token=${WORD}-two\nother=1\n`)
  assert.equal(r.seen, 'old_string,new_string', 'the last rewritten input was the Edit')
  assert.equal(r.wordRequests, 0, 'the word reached a request')
})

test('control: with no rewrite the file holds the placeholder, so the test above can fail', { skip, timeout: 180_000 }, async () => {
  const r = await run('control', ['hide'], writeThenEdit)
  assert.ok(r.requests >= 3)
  assert.equal(r.file, `token=${PLACEHOLDER}-two\nother=1\n`)
  assert.equal(r.seen, undefined)
  assert.equal(r.wordRequests, 0)
})

test('a failed Edit echoes the rewritten text in its error: hiding keeps it from the next request, and without hiding it is seen', { skip, timeout: 180_000 }, async () => {
  const failing = (file: string): Reply[] => [
    { kind: 'tool', name: 'Write', input: { file_path: file, content: 'other=1\n' } },
    { kind: 'tool', name: 'Edit', input: { file_path: file, old_string: `missing=${PLACEHOLDER}`, new_string: 'x' } },
  ]
  const hidden = await run('failed-hidden', ['rewrite', 'hide'], failing)
  assert.ok(hidden.requests >= 3)
  assert.equal(hidden.file, 'other=1\n')
  assert.equal(hidden.wordRequests, 0, 'the error echo reached a request although hiding was on')
  const open = await run('failed-open', ['rewrite'], failing)
  assert.ok(open.requests >= 3)
  assert.ok(open.wordRequests > 0, 'the failed Edit no longer echoes the rewritten text: the put-back plan can drop its failed-Edit rule')
})
