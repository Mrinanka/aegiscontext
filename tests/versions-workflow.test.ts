// A pull request that adds Claude Code versions to the tested list (src/core/versions.ts) runs the plugin tests and the
// whole leak test kit on each added version, on macOS, Windows and Linux. The maintainer checks the VS Code extension and
// the desktop app by hand before merging. The repo guard (tests/repo-setup.test.ts) already requires SHA-pinned actions,
// a job timeout and a concurrency group.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { addedVersions, listedVersions } from '../tools/ci/added-versions.ts'

const root = path.join(import.meta.dirname, '..')
const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'versions.yml'), 'utf8')
const weekly = fs.readFileSync(path.join(root, '.github', 'workflows', 'weekly.yml'), 'utf8')

const file = (list: string): string => `export const TESTED_VERSIONS: readonly string[] = [${list}]\nexport const x = ['9.9.9']\n`

test('listedVersions reads the tested list and nothing else in the file', () => {
  assert.deepEqual(listedVersions(file(`'2.1.317', '2.1.316'`)), ['2.1.317', '2.1.316'])
  assert.deepEqual(listedVersions(file(`\n  '2.1.318',\n  "2.1.317",\n`)), ['2.1.318', '2.1.317'])
})

test('listedVersions refuses a list it cannot read, or an entry that is not an exact version', () => {
  assert.throws(() => listedVersions('export const OTHER = []'), /TESTED_VERSIONS/)
  assert.throws(() => listedVersions(file(`'2.1.317', '2.1.x'`)), /2\.1\.x/)
  assert.throws(() => listedVersions(file(`'2.1.317; curl x'`)), /curl/)
  assert.throws(() => listedVersions(file(`'2.1.317', SOME_CONST`)), /SOME_CONST/)
})

test('addedVersions is what the pull request adds, in its order; a removed or kept version is not tested again', () => {
  const base = file(`'2.1.317', '2.1.316', '2.1.309'`)
  assert.deepEqual(addedVersions(file(`'2.1.318', '2.1.317', '2.1.316', '2.1.312', '2.1.309'`), base), ['2.1.318', '2.1.312'])
  assert.deepEqual(addedVersions(file(`'2.1.317', '2.1.309'`), base), [])
  assert.deepEqual(addedVersions(base, base), [])
})

test('addedVersions tests every version when the base has no list yet', () => {
  assert.deepEqual(addedVersions(file(`'2.1.317'`), undefined), ['2.1.317'])
})

test('the real tested list reads cleanly', () => {
  const real = listedVersions(fs.readFileSync(path.join(root, 'src', 'core', 'versions.ts'), 'utf8'))
  assert.ok(real.length > 0)
  assert.ok(real.includes('2.1.317'))
})

test('it runs on a pull request into develop or release that touches the tested list', () => {
  assert.match(wf, /^on:\n  pull_request:\n    branches: \[develop, release\]\n    paths:\n/m)
  assert.match(wf, /^      - 'src\/core\/versions\.ts'$/m)
})

test('it can read the repo and nothing else, and it holds no secret', () => {
  assert.match(wf, /^permissions:\n  contents: read\n/m)
  assert.ok(!/^\s+(?:contents|id-token|actions|checks|deployments|issues|packages|pull-requests|statuses|security-events|attestations|pages): *write/m.test(wf))
  assert.ok(!/secrets\./.test(wf), 'no secret is used')
  assert.ok(!/ANTHROPIC_API_KEY/.test(wf), 'no real key: the kit uses a mock and a made-up one')
  assert.ok(!/pull_request_target/.test(wf), 'never the privileged trigger')
})

test('the versions come from the base and head of the pull request, and an empty list runs nothing', () => {
  assert.match(wf, /node tools\/ci\/added-versions\.ts/)
  assert.match(wf, /github\.event\.pull_request\.base\.sha/)
  assert.match(wf, /fetch-depth: 0/)
  assert.match(wf, /if: needs\.added\.outputs\.versions != '\[\]'/)
  assert.match(wf, /version: \$\{\{ fromJSON\(needs\.added\.outputs\.versions\) \}\}/)
})

test('each version runs on all 3 systems, and one failure does not hide another', () => {
  assert.match(wf, /os: \[ubuntu-latest, windows-latest, macos-latest\]/)
  assert.match(wf, /fail-fast: false/)
})

/** Every `run:` script in a workflow: the line itself and the deeper-indented lines under it. */
function runScripts(yaml: string): string[] {
  const out: string[] = []
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s+)(?:- )?run: ?(.*)$/.exec(lines[i] as string)
    if (!m) continue
    const indent = (m[1] as string).length
    const body = [m[2] as string]
    while (i + 1 < lines.length && (/^\s*$/.test(lines[i + 1] as string) || ((/^(\s*)/.exec(lines[i + 1] as string)?.[1] ?? '').length > indent))) body.push(lines[++i] as string)
    out.push(body.join('\n'))
  }
  return out
}

test('a version or pull request value reaches a shell only through env, never written into the script', () => {
  const scripts = runScripts(wf)
  assert.ok(scripts.length >= 10)
  for (const s of scripts) assert.ok(!/\$\{\{\s*(?:matrix|github|needs|steps|inputs)\./.test(s), `a run script holds a context value: ${s.slice(0, 120)}`)
})

test('it installs that exact version without its install scripts, and refuses a binary that says another', () => {
  assert.match(wf, /npm install[^\n]*--ignore-scripts[^\n]*"@anthropic-ai\/claude-code@\$VERSION"/)
  assert.match(wf, /claude-code-\$\{process\.platform\}-\$\{process\.arch\}/, 'the platform binary')
  assert.match(wf, /--version/)
  assert.match(wf, /"\$VERSION "\*\)/, 'the binary must report the version asked for')
})

test('it runs everything the weekly run does, each against the version under test', () => {
  const steps = [...weekly.matchAll(/^\s+run: (claude plugin [^\n]+|node --test tests\/rewrite-real\.test\.ts|npm run leak-test[^\n]*)$/gm)]
    .map(m => (m[1] as string).replace('CLAUDE_NEWEST', 'CLAUDE_UNDER_TEST'))
  assert.ok(steps.length >= 10, `weekly steps found: ${steps.length}`)
  for (const s of steps) assert.ok(wf.includes(s), s)
  assert.match(wf, /AEGIS_CLAUDE: \$\{\{ env\.CLAUDE_UNDER_TEST \}\}/, 'the rewrite test is aimed at the version under test')
  assert.ok(!wf.includes('--require-pinned'), 'the point is a version other than the pin')
})
