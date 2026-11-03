// What a release promises, kept true (plan step 6): the marketplace and manifest agree, every copy of the version
// agrees, the pinned Claude Code, the tested list and the docs agree, and the files a newcomer is told about exist.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TESTED_VERSIONS } from '../src/core/versions.ts'

const root = path.join(import.meta.dirname, '..')
const text = (...p: string[]): string => fs.readFileSync(path.join(root, ...p), 'utf8')
const json = <T = Record<string, unknown>>(...p: string[]): T => JSON.parse(text(...p)) as T

type Market = { name: string; owner: { name: string }; plugins: { name: string; source: string; version?: string }[] }
type Manifest = { name: string; version: string; displayName?: string; homepage?: string; repository?: string; keywords?: string[]; license?: string }

test('the marketplace lists one plugin, by the manifest name, from ./plugin, with no version of its own', () => {
  const m = json<Market>('.claude-plugin', 'marketplace.json')
  const manifest = json<Manifest>('plugin', '.claude-plugin', 'plugin.json')
  assert.equal(m.name, manifest.name)
  assert.equal(m.plugins.length, 1)
  assert.equal(m.plugins[0]?.name, manifest.name)
  assert.equal(m.plugins[0]?.source, './plugin')
  assert.equal(m.plugins[0]?.version, undefined, 'the version lives in plugin.json only, so the two cannot disagree')
  assert.ok(m.owner.name.length > 0)
})

test('the manifest carries what a listing needs', () => {
  const p = json<Manifest>('plugin', '.claude-plugin', 'plugin.json')
  assert.equal(p.displayName, 'AegisContext')
  assert.equal(p.license, 'Apache-2.0')
  assert.match(p.homepage ?? '', /^https:\/\/github\.com\/Mrinanka\/aegiscontext$/)
  assert.match(p.repository ?? '', /^https:\/\/github\.com\/Mrinanka\/aegiscontext$/)
  assert.ok((p.keywords ?? []).includes('secrets'))
})

test('every copy of the version agrees: package.json, the lockfile, plugin.json, the marker and the changelog', () => {
  const v = json<Manifest>('plugin', '.claude-plugin', 'plugin.json').version
  assert.match(v, /^\d+\.\d+\.\d+$/)
  assert.equal(json<Manifest>('package.json').version, v)
  const lock = json<{ version: string; packages: Record<string, { version?: string }> }>('package-lock.json')
  assert.equal(lock.version, v)
  assert.equal(lock.packages['']?.version, v)
  assert.equal(/PLUGIN_VERSION = '([^']+)'/.exec(text('plugin', 'hooks', 'marker.ts'))?.[1], v)
  assert.match(text('CHANGELOG.md'), new RegExp(`^## ${v.replace(/\./g, '\\.')}(?:-rc\\.\\d+)?\\b`, 'm'), 'CHANGELOG.md has no heading for this version')
})

test('the package, the plugin and the docs all use the one name', () => {
  assert.equal(json<Manifest>('package.json').name, 'aegiscontext')
  const install = '/plugin install aegiscontext --marketplace Mrinanka/aegiscontext'
  for (const f of [['README.md'], ['plugin', 'README.md'], ['docs', 'personal.md']]) assert.ok(text(...f).includes(install), `${f.join('/')} lacks the install line`)
})

test('the pinned Claude Code is on the tested list, and the tested-versions page names every tested version', () => {
  const pin = json<{ dependencies: Record<string, string> }>('tools', 'leak-test', 'claude-pin', 'package.json').dependencies['@anthropic-ai/claude-code']
  assert.ok(pin !== undefined && TESTED_VERSIONS.includes(pin), `${pin} is not in TESTED_VERSIONS`)
  const page = text('docs', 'tested-versions.md')
  for (const v of TESTED_VERSIONS) assert.ok(page.includes(`**${v}**`) || page.includes(`| ${v} `) || page.includes(v), `docs/tested-versions.md lacks ${v}`)
  assert.ok(page.includes(`**${pin}** (the pinned version)`), 'the page must mark the pinned version')
})

test('the files a newcomer is pointed to exist', () => {
  const files = [
    'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_LICENSES', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md',
    '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/config.yml',
    'docs/personal.md', 'docs/managed.md', 'docs/verify.md', 'docs/troubleshooting.md', 'docs/tested-versions.md', 'docs/scores.md', 'docs/README.md', 'docs/engineering/release-checklist.md',
    'docs/snippets/personal.json', 'docs/snippets/managed.json', 'docs/snippets/managed-plugin.json', 'plugin/README.md',
  ]
  for (const f of files) assert.ok(fs.existsSync(path.join(root, ...f.split('/'))), f)
})

test('the bug report asks for doctor output and the self-check report; the code of conduct is a link, not a copy', () => {
  const t = text('.github', 'ISSUE_TEMPLATE', 'bug_report.yml')
  assert.match(t, /\/redact doctor/)
  assert.match(t, /self-check --report/)
  const c = text('CODE_OF_CONDUCT.md')
  assert.match(c, /contributor-covenant\.org\/version\/2\/1/)
  assert.ok(c.length < 2000, 'the covenant text is linked, not copied')
  assert.ok(!/@[\w-]+\.[a-z]{2,}/i.test(c), 'no email address is published')
})

test('the security policy points at private reporting and warns against real secrets', () => {
  const t = text('SECURITY.md')
  assert.match(t, /security\/advisories\/new/)
  assert.match(t, /fake/i)
})

test('the README states the limits, and says it reduces risk and guarantees nothing', () => {
  const t = text('README.md')
  assert.match(t, /not a guarantee/i)
  assert.match(t, /Where the edges are/)
  assert.match(t, /built-in guard/i)
})
