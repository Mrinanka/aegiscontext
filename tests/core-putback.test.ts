// Put-back (spec §10, D-096): who decides, the choice file, and restoring a placeholder in a Write or Edit input
// into a file that already holds the value. Fakes are built at run time from pieces, never written whole here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createChecker } from '../src/checker/index.ts'
import { NO_ALLOW, Redactor } from '../src/core/session.ts'
import { findPlaceholders } from '../src/core/placeholder.ts'
import { changeChoice, choiceFacts, folderKey, parseChoice, resolvePutBack, restoreInput, serializeChoice, type PutBackFacts } from '../src/core/putback.ts'
import { FAKE_KINDS, makeFake, plant, seededSource } from '../tools/test-sets/fakes.ts'

const src = seededSource('core-putback')
const fake = (kind: (typeof FAKE_KINDS)[number]) => makeFake(kind, src)
const GH = fake('github-pat').value
const GL = fake('gitlab-pat').value
const PW = 'Autumn' + '2026xk'
const LETTERS = 'Summer' + 'Rainfall'

function make(o: Partial<ConstructorParameters<typeof Redactor>[0]> = {}): Redactor {
  const { checker } = createChecker({})
  return new Redactor({ checker, registered: [], hints: true, allow: NO_ALLOW, ...o })
}
const dl = (ms = 20_000): number => performance.now() + ms
/** What Claude would have seen of a file: the redacted text. */
const seen = (r: Redactor, disk: string, file = '/p/app.yaml'): string => r.redactText(disk, { file, deadline: dl() }).text
const tagsOf = (text: string): string[] => findPlaceholders(text).map(([s, e]) => text.slice(s, e))
const write = (r: Redactor, disk: string, content: string, extra: { deadline?: number } = {}) =>
  restoreInput(r, { tool: 'Write', file: '/p/app.yaml', disk, input: { file_path: '/p/app.yaml', content }, deadline: extra.deadline ?? dl() })
const edit = (r: Redactor, disk: string, old_string: string, new_string: string, replace_all = false) =>
  restoreInput(r, { tool: 'Edit', file: '/p/app.yaml', disk, input: { file_path: '/p/app.yaml', old_string, new_string, ...(replace_all ? { replace_all } : {}) }, deadline: dl() })

// ---------------------------------------------------------------------------------------------------------
// Who decides
// ---------------------------------------------------------------------------------------------------------

const facts = (f: Partial<PutBackFacts> = {}): PutBackFacts => ({ managedOff: false, canShow: true, unreadable: false, observe: false, ...f })

test('the published table, one case per row', () => {
  // Managed says / Developer says / Repo says -> Result
  assert.equal(resolvePutBack(facts()).on, false, 'nothing, nothing, nothing: off, the default')
  const repoOn = resolvePutBack(facts({ repo: 'on' }))
  assert.equal(repoOn.on, true, 'nothing, nothing, on: on')
  assert.equal(repoOn.repoNotice, true, '... with the notice')
  const devOn = resolvePutBack(facts({ all: 'on' }))
  assert.equal(devOn.on, true, 'nothing, on, nothing: on')
  assert.equal(devOn.repoNotice, false)
  assert.equal(resolvePutBack(facts({ all: 'on', repo: 'off' })).on, false, 'nothing, on, off: off')
  const devOff = resolvePutBack(facts({ all: 'off', repo: 'on' }))
  assert.equal(devOff.on, false, 'nothing, off, on: off, the developer wins')
  assert.equal(devOff.repoNotice, false)
  for (const all of [undefined, 'on', 'off'] as const)
    for (const repo of [undefined, 'on', 'off'] as const) assert.equal(resolvePutBack(facts({ managedOff: true, ...(all ? { all } : {}), ...(repo ? { repo } : {}) })).on, false, `managed off, ${all}, ${repo}: off`)
})

test('--here beats the choice for all projects, either way', () => {
  assert.equal(resolvePutBack(facts({ all: 'on', here: 'off' })).on, false)
  assert.equal(resolvePutBack(facts({ all: 'off', here: 'on' })).on, true)
  assert.equal(resolvePutBack(facts({ here: 'on' })).on, true)
})

test('--here on does not beat a repo off or a managed off', () => {
  assert.equal(resolvePutBack(facts({ here: 'on', repo: 'off' })).on, false)
  assert.equal(resolvePutBack(facts({ here: 'on', managedOff: true })).on, false)
})

test('observe mode and an unreadable choice file are off whatever else is said', () => {
  assert.equal(resolvePutBack(facts({ observe: true, all: 'on', here: 'on', repo: 'on' })).on, false)
  const broken = resolvePutBack(facts({ unreadable: true, repo: 'on', all: 'on' }))
  assert.equal(broken.on, false, 'a repo "on" cannot get past a developer "off" we failed to read')
  assert.equal(broken.repoNotice, false)
})

test('a repo "on" with no surface to show the notice is ignored', () => {
  const r = resolvePutBack(facts({ repo: 'on', canShow: false }))
  assert.equal(r.on, false)
  assert.equal(r.repoNotice, false)
  assert.equal(resolvePutBack(facts({ repo: 'on', canShow: false, all: 'on' })).on, true, 'the developer asked for it, so no notice is needed')
})

test('every result says why, in words, and never holds a path or value', () => {
  for (const f of [facts(), facts({ repo: 'on' }), facts({ all: 'on' }), facts({ here: 'off' }), facts({ managedOff: true }), facts({ observe: true }), facts({ unreadable: true }), facts({ repo: 'off' })]) {
    const why = resolvePutBack(f).why
    assert.ok(why.length > 5 && why.length < 120, why)
  }
})

// ---------------------------------------------------------------------------------------------------------
// The choice file
// ---------------------------------------------------------------------------------------------------------

test('parseChoice reads a good file and rejects everything else as unreadable', () => {
  assert.deepEqual(parseChoice('{"all":"on","folders":{"/a":"off"}}'), { all: 'on', folders: { '/a': 'off' } })
  assert.deepEqual(parseChoice('{}'), {})
  for (const bad of ['', 'nope', '[]', 'null', '{"all":"maybe"}', '{"all":1}', '{"folders":[]}', '{"folders":{"/a":"yes"}}', '{"folders":{"/a":1}}', '"on"', '{"all":"on"'])
    assert.equal(parseChoice(bad), undefined, bad)
})

test('parseChoice refuses a file over 64 KB', () => {
  const folders = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`/some/long/folder/path/number/${i}`, 'on']))
  const text = JSON.stringify({ folders })
  assert.ok(text.length > 65_536)
  assert.equal(parseChoice(text), undefined)
})

test('parseChoice does not let a folder named __proto__ change anything', () => {
  const c = parseChoice('{"folders":{"__proto__":"on","/a":"off"}}')
  assert.ok(c)
  assert.equal(({} as Record<string, unknown>).on, undefined)
  assert.equal(Object.getPrototypeOf(c.folders as object) === Object.prototype || Object.getPrototypeOf(c.folders as object) === null, true)
  assert.equal(choiceFacts(c, '/b', false).here, undefined)
  assert.equal(choiceFacts(c, '/a', false).here, 'off')
})

test('changeChoice sets the choice for all projects or for one folder, and keeps the rest', () => {
  let c = changeChoice({}, { value: 'on' })
  assert.deepEqual(c, { all: 'on' })
  c = changeChoice(c, { value: 'off', here: '/a' })
  assert.deepEqual(c, { all: 'on', folders: { '/a': 'off' } })
  c = changeChoice(c, { value: 'on', here: '/b' })
  assert.deepEqual(c, { all: 'on', folders: { '/a': 'off', '/b': 'on' } })
  c = changeChoice(c, { value: 'off' })
  assert.equal(c.all, 'off')
  assert.deepEqual(parseChoice(serializeChoice(c)), c, 'what is written reads back the same')
})

test('changeChoice keeps the folder list from growing without bound', () => {
  let c = {}
  for (let i = 0; i < 2000; i++) c = changeChoice(c, { value: 'on', here: `/f/${i}` })
  assert.ok(Object.keys((c as { folders: object }).folders).length <= 500)
  assert.ok(serializeChoice(c).length < 65_536)
  assert.deepEqual(choiceFacts(c, '/f/1999', false).here, 'on', 'the newest stay')
})

test('--here matches the folder exactly, not its subfolders, and ignores slash style and case where the system does', () => {
  const c = changeChoice({}, { value: 'on', here: folderKey('C:\\Work\\App\\', true) })
  assert.equal(choiceFacts(c, 'c:/work/app', true).here, 'on')
  assert.equal(choiceFacts(c, 'C:\\Work\\App\\src', true).here, undefined)
  const linux = changeChoice({}, { value: 'on', here: folderKey('/home/me/App', false) })
  assert.equal(choiceFacts(linux, '/home/me/app', false).here, undefined, 'case counts on Linux')
  assert.equal(choiceFacts(linux, '/home/me/App/', false).here, 'on')
})

// ---------------------------------------------------------------------------------------------------------
// restoreInput: the round trip
// ---------------------------------------------------------------------------------------------------------

test('a Write of what Claude saw gives the file back byte for byte, for every kind of fake', () => {
  for (const kind of FAKE_KINDS) {
    const f = makeFake(kind, seededSource(`rt-${kind}`))
    const disk = `# config\nname: demo\nkey: ${plant(f, 'plain')}\nport: 8080\n`
    const r = make()
    const redacted = seen(r, disk)
    assert.ok(redacted !== disk, `${kind} was hidden`)
    const out = write(r, disk, redacted)
    assert.equal(out.input.content, disk, kind)
    assert.equal(out.complete, true)
    assert.ok(out.restored >= 1, kind)
    assert.equal(out.left, 0, kind)
  }
})

test('the encoded forms come back as they were written', () => {
  for (const form of ['base64', 'json-escaped', 'url'] as const) {
    const f = fake('github-pat')
    const disk = `a: 1\n${plant(f, form)}\nz: 2\n`
    const r = make()
    const redacted = seen(r, disk)
    assert.ok(redacted !== disk, form)
    const out = write(r, disk, redacted)
    assert.equal(out.input.content, disk, form)
  }
})

test('a rewrite that moves lines around keeps each value with its own placeholder', () => {
  const disk = `a: ${GH}\nb: ${GL}\n`
  const r = make()
  const redacted = seen(r, disk)
  const [first, second] = redacted.trimEnd().split('\n') as [string, string]
  const out = write(r, disk, `${second}\n${first}\n`)
  assert.equal(out.input.content, `b: ${GL}\na: ${GH}\n`)
})

test('CRLF, Unicode and a dollar sign in the value all survive', () => {
  const dollar = 'Zq7-reg$&istered-' + 'Kd93mLx$1'
  const r = make({ registered: [{ value: dollar, label: 'odd', added: '2026-11-03' }] })
  const disk = `naïve: ünï\r\npw: ${dollar}\r\nend: 日本語\r\n`
  const redacted = seen(r, disk)
  assert.ok(!redacted.includes(dollar))
  assert.equal(write(r, disk, redacted).input.content, disk)
  const e = edit(r, disk, tagsOf(redacted)[0] as string, tagsOf(redacted)[0] as string)
  assert.equal(e.input.new_string, dollar, 'replaced as text, not as a pattern')
})

test('a multi-line value comes back whole', () => {
  const f = fake('private-key')
  const disk = `key: |\n${f.value}\nafter: 1\n`
  const r = make()
  const redacted = seen(r, disk)
  assert.ok(redacted !== disk)
  assert.equal(write(r, disk, redacted).input.content, disk)
})

test('text with no placeholder is left alone, and the input comes back as it was', () => {
  const r = make()
  const disk = `a: ${GH}\n`
  seen(r, disk)
  const input = { file_path: '/p/app.yaml', content: 'a: plain\n' }
  const out = restoreInput(r, { tool: 'Write', file: '/p/app.yaml', disk, input, deadline: dl() })
  assert.deepEqual(out, { input, restored: 0, left: 0, complete: true })
})

// ---------------------------------------------------------------------------------------------------------
// restoreInput: what is not restored
// ---------------------------------------------------------------------------------------------------------

test('a new file, or a file that does not hold the value, gets no restore', () => {
  const r = make()
  const redacted = seen(r, `a: ${GH}\n`)
  const out = write(r, 'other: 1\n', redacted)
  assert.equal(out.input.content, redacted)
  assert.equal(out.restored, 0)
  assert.equal(out.left, 1)
  assert.equal(write(r, '', redacted).input.content, redacted)
})

test('copy limit: never more copies than the file on disk held', () => {
  const r = make()
  const disk = `a: ${GH}\n`
  const redacted = seen(r, disk)
  const ph = tagsOf(redacted)[0] as string
  const out = write(r, disk, `a: ${ph}\nb: ${ph}\nc: ${ph}\n`)
  assert.equal(out.input.content, `a: ${GH}\nb: ${ph}\nc: ${ph}\n`, 'greedy, in order: the first copy is restored')
  assert.equal(out.restored, 1)
  assert.equal(out.left, 2)
  const two = `a: ${GH}\nb: ${GH}\n`
  const r2 = make()
  const ph2 = tagsOf(seen(r2, two))[0] as string
  assert.equal(write(r2, two, `x: ${ph2}\ny: ${ph2}\nz: ${ph2}\n`).input.content, `x: ${GH}\ny: ${GH}\nz: ${ph2}\n`)
})

test('a placeholder already on disk, a forged tag and an unknown tag stay as text', () => {
  const r = make()
  const onDisk = '[REDACTED:GITHUB_PAT ...abcd #aaaaaaaaaaaaa]'
  const disk = `old: ${onDisk}\nnew: ${GH}\n`
  seen(r, disk)
  const forged = '[REDACTED:SECRET #bbbbbbbbbbbbb]'
  const out = write(r, disk, `old: ${onDisk}\nforged: ${forged}\n`)
  assert.equal(out.input.content, `old: ${onDisk}\nforged: ${forged}\n`)
  assert.equal(out.restored, 0)
})

test('only a rule that says hide is restored; a block or warn is not', () => {
  const block = make({ checker: createChecker({ actions: { 'github-pat': 'block' } }).checker })
  const disk = `a: ${GH}\n`
  const redacted = seen(block, disk)
  assert.ok(redacted !== disk)
  assert.equal(write(block, disk, redacted).input.content, redacted)
  const warn = make({ checker: createChecker({ actions: { 'github-pat': 'warn' } }).checker })
  assert.equal(write(warn, disk, seen(warn, disk)).restored, 0)
})

test('a tag that stands for two different written forms is not restored', () => {
  const disk = `plain: ${GH}\n${plant({ kind: 'github-pat', value: GH, text: GH }, 'base64')}\n`
  const r = make()
  const redacted = seen(r, disk)
  assert.equal(new Set(tagsOf(redacted).map(t => /#([a-z2-7]{13})\]/.exec(t)?.[1])).size, 1, 'one tag for both')
  const out = write(r, disk, redacted)
  assert.equal(out.input.content, redacted)
  assert.equal(out.restored, 0)
})

test('a value too long to remember is not restored', () => {
  const long = 'x1'.repeat(4500)
  const r = make()
  const disk = `password: ${long}\n`
  const redacted = seen(r, disk)
  assert.ok(!redacted.includes(long))
  const out = write(r, disk, redacted)
  assert.equal(out.input.content, redacted)
  assert.equal(out.restored, 0)
  assert.equal(out.left, 1)
})

test('a full catch list: a value that cannot be remembered is not restored', () => {
  const r = make({ maxCatches: 1 })
  const disk = `a: ${GH}\nb: ${GL}\n`
  const redacted = seen(r, disk)
  const out = write(r, disk, redacted)
  assert.equal(out.restored, 1, 'the one that fitted')
  assert.equal(out.left, 1)
  assert.equal(out.input.content?.toString().includes(GH) !== out.input.content?.toString().includes(GL), true)
})

test('a letters-only password found by its label stays hidden when it moves off the label (D-071)', () => {
  const r = make()
  const disk = `password: ${LETTERS}\n`
  const redacted = seen(r, disk)
  assert.ok(!redacted.includes(LETTERS))
  assert.ok(seen(r, `echo ${LETTERS}`).includes(LETTERS), 'before put-back a bare copy is not remembered')
  const out = write(r, disk, redacted)
  assert.equal(out.input.content, disk)
  assert.ok(!r.redactText(`bare ${LETTERS} copy`, { deadline: dl() }).text.includes(LETTERS), 'after a restore it is remembered')
})

test('nothing else is touched in the input, and bad field types do not throw', () => {
  const r = make()
  const disk = `a: ${GH}\n`
  const redacted = seen(r, disk)
  const bad = { file_path: '/p/app.yaml', content: 5 as unknown as string, extra: { keep: true } }
  const out = restoreInput(r, { tool: 'Write', file: '/p/app.yaml', disk, input: bad, deadline: dl() })
  assert.deepEqual(out.input, bad)
  const mixed = restoreInput(r, { tool: 'Edit', file: '/p/app.yaml', disk, input: { file_path: '/p/app.yaml', old_string: redacted, new_string: 7 as unknown as string }, deadline: dl() })
  assert.equal(mixed.restored, 1, 'the old text restores; the field of the wrong type is left alone')
  assert.equal(mixed.input.old_string, disk)
  assert.equal(mixed.input.new_string, 7)
  const w = write(r, disk, redacted)
  assert.equal(w.input.file_path, '/p/app.yaml')
})

test('running out of time restores nothing and says the check is incomplete (R-12)', () => {
  const r = make()
  const disk = `a: ${GH}\n`
  const redacted = seen(r, disk)
  const out = write(r, disk, redacted, { deadline: performance.now() - 1 })
  assert.equal(out.complete, false)
  assert.equal(out.restored, 0)
  assert.equal(out.input.content, redacted)
})

// ---------------------------------------------------------------------------------------------------------
// restoreInput: Edit
// ---------------------------------------------------------------------------------------------------------

test('an Edit through a placeholder line finds the real line and writes the real value', () => {
  const r = make()
  const disk = `name: demo\ntoken: ${GH}\nport: 1\n`
  const redacted = seen(r, disk)
  const line = redacted.split('\n')[1] as string
  const out = edit(r, disk, line, line.replace('token', 'api_token'))
  assert.equal(out.input.old_string, `token: ${GH}`)
  assert.equal(out.input.new_string, `api_token: ${GH}`)
  assert.equal(out.restored, 2)
  assert.equal(out.left, 0)
})

test('an Edit may not add a second copy: a new_string with more copies than old_string keeps the extra as text', () => {
  const r = make()
  const disk = `token: ${GH}\n`
  const redacted = seen(r, disk).trimEnd()
  const ph = tagsOf(redacted)[0] as string
  const out = edit(r, disk, redacted, `${redacted}\nbackup: ${ph}`)
  assert.equal(out.input.new_string, `token: ${GH}\nbackup: ${ph}`)
  assert.equal(out.left, 1)
})

test('an Edit that never touched the placeholder cannot bring one in', () => {
  const r = make()
  const disk = `token: ${GH}\nport: 1\n`
  const ph = tagsOf(seen(r, disk))[0] as string
  const out = edit(r, disk, 'port: 1', `port: 2 ${ph}`)
  assert.equal(out.input.new_string, `port: 2 ${ph}`)
  assert.equal(out.restored, 0)
})

test('an Edit with replace_all restores each copy once per match', () => {
  const r = make()
  const disk = `a:\n  token: ${GH}\nb:\n  token: ${GH}\n`
  const redacted = seen(r, disk)
  const line = '  ' + (redacted.split('\n')[1] as string).trim()
  const out = edit(r, disk, line, line.replace('token', 'key'), true)
  assert.equal(out.input.old_string, `  token: ${GH}`)
  assert.equal(out.input.new_string, `  key: ${GH}`)
  assert.equal(out.left, 0)
})

test('a failed Edit stays as Claude wrote it, so no error can echo a real value', () => {
  const r = make()
  const disk = `token: ${GH}\n`
  const ph = tagsOf(seen(r, disk))[0] as string
  const input = { file_path: '/p/app.yaml', old_string: `key: ${ph}`, new_string: `key: ${ph}2` }
  const out = restoreInput(r, { tool: 'Edit', file: '/p/app.yaml', disk, input, deadline: dl() })
  assert.deepEqual(out, { input, restored: 0, left: 2, complete: true })
})

test('an Edit with an empty old_string is left alone', () => {
  const r = make()
  const disk = `token: ${GH}\n`
  const ph = tagsOf(seen(r, disk))[0] as string
  const out = edit(r, disk, '', `x ${ph}`)
  assert.equal(out.restored, 0)
})

// ---------------------------------------------------------------------------------------------------------
// restoreInput: what must never leak out of it
// ---------------------------------------------------------------------------------------------------------

test('the hits asked for with sources are not in what a normal call returns', () => {
  const r = make()
  const plain = r.redactText(`a: ${GH}`, { deadline: dl() })
  assert.ok(plain.hits.every(h => h.source === undefined && h.at === undefined))
  const withSources = r.redactText(`a: ${GH}`, { deadline: dl(), sources: true })
  assert.ok(withSources.hits.every(h => typeof h.source === 'string'))
})

test('keepHidden: a registered or caught value is kept, an unknown tag is not', () => {
  const r = make({ registered: [{ value: 'Reg-' + 'Zq7Kd93mLx', label: 'mine', added: '2026-11-03' }] })
  const out = r.redactText(`a: Reg-Zq7Kd93mLx and ${GH}`, { deadline: dl() })
  for (const h of out.hits) assert.equal(r.keepHidden(h.tag), true)
  assert.equal(r.keepHidden('aaaaaaaaaaaaa'), false)
})
