// The docs say only what is true (plan step 6): every command, setting and npm script they name exists, every
// relative link resolves, the settings table equals the code's defaults, and the uninstall commands are the ones the
// code builds (tests/uninstall-real.test.ts runs them on the real stores).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULTS, ENUMS } from '../src/core/settings.ts'
import { uninstallText } from '../src/core/uninstall.ts'

const root = path.join(import.meta.dirname, '..')
const rel = (...p: string[]): string => path.join(root, ...p)
const read = (...p: string[]): string => fs.readFileSync(rel(...p), 'utf8')

/** The files the docs checks read: the README, the repo files and docs/*.md except the history logs. */
const DOC_FILES = [
  'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'plugin/README.md',
  'docs/personal.md', 'docs/managed.md', 'docs/verify.md', 'docs/troubleshooting.md', 'docs/tested-versions.md', 'docs/scores.md', 'docs/release-checklist.md',
  'docs/snippets/README.md',
]

const SUBCOMMANDS = new Set([...read('plugin', 'hooks', 'commands.ts').matchAll(/case '([a-z-]*)':/g)].map(m => m[1] as string).filter(Boolean))

test('every /redact subcommand the docs name exists', () => {
  assert.ok(SUBCOMMANDS.has('doctor') && SUBCOMMANDS.has('self-check'), 'the subcommands were not read from the code')
  for (const f of DOC_FILES) {
    for (const m of read(...f.split('/')).matchAll(/\/redact ([a-z][a-z-]*)/g)) assert.ok(SUBCOMMANDS.has(m[1] as string), `${f} names /redact ${m[1]}, which does not exist`)
  }
})

test('the plain doctor command the docs name is the one the plugin serves', () => {
  const served = /DOCTOR = '([^']+)'/.exec(read('plugin', 'hooks', 'commands.ts'))?.[1]
  assert.equal(served, 'aegiscontext:doctor')
  for (const f of DOC_FILES) {
    for (const m of read(...f.split('/')).matchAll(/\/aegiscontext:([a-z-]+)/g)) assert.equal(m[1], 'doctor', `${f} names /aegiscontext:${m[1]}`)
  }
})

test('every npm script the docs name exists in package.json', () => {
  const scripts = new Set(Object.keys((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts))
  for (const f of DOC_FILES) {
    for (const m of read(...f.split('/')).matchAll(/npm run ([a-z][a-z:-]*)/g)) assert.ok(scripts.has(m[1] as string), `${f} names npm run ${m[1]}, which does not exist`)
  }
})

test('every relative link resolves, and a #heading exists in the file it points at', () => {
  const slug = (h: string): string => h.toLowerCase().replace(/[`*]/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/ /g, '-')
  for (const f of DOC_FILES) {
    const dir = path.dirname(rel(...f.split('/')))
    // Links inside code blocks are examples; leave them out.
    const text = read(...f.split('/')).replace(/```[\s\S]*?```/g, '')
    for (const m of text.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)) {
      const [file, anchor] = (m[1] as string).split('#') as [string, string | undefined]
      const target = path.join(dir, file)
      assert.ok(fs.existsSync(target), `${f} links to ${m[1]}, which does not exist`)
      if (anchor && target.endsWith('.md')) {
        const heads = [...fs.readFileSync(target, 'utf8').matchAll(/^#{1,6} (.+)$/gm)].map(h => slug(h[1] as string))
        assert.ok(heads.includes(anchor), `${f} links to ${m[1]}, but ${path.basename(target)} has no such heading`)
      }
    }
    for (const m of text.matchAll(/\]\(#([^)\s]+)\)/g)) {
      const heads = [...read(...f.split('/')).matchAll(/^#{1,6} (.+)$/gm)].map(h => slug(h[1] as string))
      assert.ok(heads.includes(m[1] as string), `${f} links to #${m[1]}, which is not a heading of it`)
    }
  }
})

test('the settings table in docs/personal.md equals the code: names, defaults and options', () => {
  const table = read('docs', 'personal.md').split('\n').filter(l => /^\| `[a-z_.]+` \|/.test(l)).map(l => l.split('|').map(c => c.trim()).slice(1, 4))
  const rows = new Map(table.map(([n, d, o]) => [(n as string).replace(/`/g, ''), { d: d as string, o: o as string }]))
  for (const key of Object.keys(ENUMS) as (keyof typeof ENUMS)[]) {
    const row = rows.get(key)
    assert.ok(row, `${key} is missing from the settings table`)
    assert.ok(row.d.startsWith(`\`${DEFAULTS[key]}\``), `${key}: the table says default ${row.d}, the code says ${DEFAULTS[key]}`)
    assert.deepEqual([...row.o.matchAll(/`([a-z]+)`/g)].map(m => m[1]), [...ENUMS[key]], `${key}: options differ`)
  }
  assert.equal(rows.get('log.days')?.d, `\`${DEFAULTS.log.days}\``)
  assert.equal(rows.get('secret_files')?.d, `\`${DEFAULTS.secret_files[0]}\``)
  for (const key of ['rules.off', 'rules.custom', 'rules.actions', 'allow']) assert.ok(rows.has(key), `${key} is missing from the table`)
  // No row for a setting the code does not have.
  const known = new Set([...Object.keys(ENUMS), 'rules.off', 'rules.custom', 'rules.actions', 'allow', 'secret_files', 'log.days'])
  for (const name of rows.keys()) assert.ok(known.has(name), `the table has a row for ${name}, which is not a setting`)
})

test('the uninstall commands in docs/personal.md are the ones the code builds', () => {
  const doc = read('docs', 'personal.md')
  for (const line of Object.values(uninstallText())) assert.ok(doc.includes(line), `docs/personal.md lacks: ${line}`)
})

test('the docs never write a whole key, and name the data folder and service the code uses', () => {
  assert.ok(uninstallText().linux.startsWith('secret-tool clear service aegiscontext;'))
  for (const f of DOC_FILES) assert.ok(!/ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{10,}/.test(read(...f.split('/'))), `${f} holds a whole key`)
})

test('the release workflow runs on tags, calls CI first, and makes a draft', () => {
  const y = read('.github', 'workflows', 'release.yml')
  assert.match(y, /tags: \['v\*'\]/)
  assert.match(y, /uses: \.\/\.github\/workflows\/ci\.yml/)
  assert.match(y, /--draft/)
  assert.match(read('.github', 'workflows', 'ci.yml'), /workflow_call:/)
})

test('the limits of the backup lock name skill text wherever they are listed (the kit proves it leaks there)', () => {
  const says = (text: string, needle: string): boolean => text.split('\n').some(l => l.includes(needle) && /skill text/.test(l))
  const spec = read('docs', 'spec.md')
  assert.ok(says(spec, '**Doors it does not cover**'), 'spec section 5.2')
  assert.ok(says(spec, "It doesn't cover `@` files"), 'spec section 22')
  assert.ok(says(read('docs', 'personal.md'), 'It does **not** cover `@` files'), 'docs/personal.md')
})

test('the README command table lists every /redact subcommand', () => {
  const table = read('README.md').split('\n').filter(l => l.startsWith('| `/redact')).join('\n')
  for (const name of SUBCOMMANDS) assert.ok(table.includes(`/redact ${name}`), `the README table has no /redact ${name}`)
})
