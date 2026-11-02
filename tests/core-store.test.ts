// The registered-secret store (spec §8.1, R-10, D-036), against a fake backend that can fail on any
// call. All or nothing: at every point a save can die, the old list must still load whole.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyList, loadList, removeEntries, saveList, StoreFull, type Backend, type SecretEntry } from '../src/core/store.ts'
import { backendFor, type Exec, type Files } from '../src/core/backends.ts'

const VALUE = ['Zq7', 'registered', 'Kd93mLx'].join('-')
const entry = (i: number, value = `${VALUE}-${i}`): SecretEntry => ({ value, label: 'my token', added: '2026-11-01' })
const many = (n: number): SecretEntry[] => Array.from({ length: n }, (_, i) => entry(i))

type Fake = Backend & { items: Map<string, string>; calls: string[]; failAt: number; ops: number; corrupt?: (name: string, text: string) => string }

function fake(pieceBytes = 200, maxPieces = 1000): Fake {
  const b: Fake = {
    id: 'fake',
    pieceBytes,
    maxPieces,
    items: new Map(),
    calls: [],
    failAt: Number.POSITIVE_INFINITY,
    ops: 0,
    status: async () => 'ok',
    hasList: async () => b.items.has('index'),
    put: async (name, text) => {
      b.ops++
      if (b.ops >= b.failAt) throw new Error('store went away')
      b.calls.push(`put ${name}`)
      b.items.set(name, b.corrupt ? b.corrupt(name, text) : text)
    },
    get: async name => b.items.get(name),
    del: async name => {
      b.calls.push(`del ${name}`)
      b.items.delete(name)
    },
  }
  return b
}

test('a small list is one piece, and comes back the same', async () => {
  const b = fake(100_000)
  await saveList(b, many(3))
  assert.deepEqual(await loadList(b), { entries: many(3) })
  assert.equal([...b.items.keys()].filter(k => k.startsWith('list-')).length, 1)
})

test('a large list is split into pieces no bigger than the store takes, through the same code', async () => {
  const b = fake(200)
  await saveList(b, many(50))
  const pieces = [...b.items].filter(([k]) => k.startsWith('list-'))
  assert.ok(pieces.length > 5)
  for (const [, text] of pieces) assert.ok(text.length <= 200)
  assert.deepEqual((await loadList(b)).entries, many(50))
})

test('no list saved yet: empty, with no warning', async () => {
  assert.deepEqual(await loadList(fake()), { entries: [] })
})

test('Unicode, quotes, backslashes and newlines survive', async () => {
  const b = fake()
  const odd = [entry(0, 'pässwörd "x" \\ 日本語 ✓\nline two'), entry(1, `it's $HOME %PATH%`)]
  await saveList(b, odd)
  assert.deepEqual((await loadList(b)).entries, odd)
})

test('what the store holds is not the value as written', async () => {
  const b = fake()
  await saveList(b, many(2))
  for (const text of b.items.values()) assert.equal(text.includes(VALUE), false)
})

test('all or nothing: a save that dies at any write leaves the old list working', async () => {
  const old = many(10)
  const next = many(25)
  const clean = fake()
  await saveList(clean, old)
  clean.ops = 0
  await saveList(clean, next)
  const writes = clean.ops
  assert.ok(writes > 3)
  for (let failAt = 1; failAt <= writes; failAt++) {
    const b = fake()
    await saveList(b, old)
    b.ops = 0
    b.failAt = failAt
    await assert.rejects(saveList(b, next), /store went away/)
    b.failAt = Number.POSITIVE_INFINITY
    assert.deepEqual(await loadList(b), { entries: old }, `failed at write ${failAt}`)
  }
})

test('after a failed save, the next save works and leaves no strays', async () => {
  const b = fake()
  await saveList(b, many(10))
  b.ops = 0
  b.failAt = 3
  await assert.rejects(saveList(b, many(30)))
  b.failAt = Number.POSITIVE_INFINITY
  await saveList(b, many(4))
  assert.deepEqual((await loadList(b)).entries, many(4))
  const index = JSON.parse(atob(b.items.get('index') as string)) as { generation: number; pieces: number }
  const pieces = [...b.items.keys()].filter(name => name !== 'index')
  assert.equal(pieces.length, index.pieces, 'no pieces are left over')
  for (const name of pieces) assert.ok(name.startsWith(`list-${index.generation}-`), `${name} is left over`)
})

test('the index is written last, after every piece', async () => {
  const b = fake()
  await saveList(b, many(10))
  assert.equal(b.calls.filter(c => c.startsWith('put')).at(-1), 'put index')
})

test('a store that returns something else is caught before the save counts', async () => {
  const b = fake()
  await saveList(b, many(5))
  const before = new Map(b.items)
  b.corrupt = (name, text) => (name === 'index' ? text : text.slice(0, -3))
  await assert.rejects(saveList(b, many(20)), /read back/)
  b.corrupt = undefined
  assert.deepEqual(b.items.get('index'), before.get('index'))
  assert.deepEqual((await loadList(b)).entries, many(5))
})

test('shrinking the list clears the pieces no longer used', async () => {
  const b = fake(200)
  await saveList(b, many(50))
  await saveList(b, many(1))
  assert.equal([...b.items.keys()].filter(k => k.startsWith('list-')).length, 1)
  await saveList(b, [])
  assert.deepEqual((await loadList(b)).entries, [])
})

test('a missing piece gives a warning and no entries, never a partial list', async () => {
  const b = fake()
  await saveList(b, many(30))
  const piece = [...b.items.keys()].filter(k => k.startsWith('list-'))[1] as string
  b.items.delete(piece)
  const out = await loadList(b)
  assert.deepEqual(out.entries, [])
  assert.match(out.warning as string, /missing|incomplete/)
})

test('a changed piece fails the checksum: warning, no entries', async () => {
  const b = fake()
  await saveList(b, many(30))
  const piece = [...b.items.keys()].filter(k => k.startsWith('list-'))[0] as string
  const text = b.items.get(piece) as string
  b.items.set(piece, `${text[0] === 'A' ? 'B' : 'A'}${text.slice(1)}`)
  const out = await loadList(b)
  assert.deepEqual(out.entries, [])
  assert.match(out.warning as string, /checksum|damaged/)
})

test('a damaged index: warning, no entries', async () => {
  for (const text of ['not base64 !!', btoa('not json'), btoa('{"v":9}'), btoa('{"v":1,"generation":1,"pieces":-1,"checksum":"x","count":0}')]) {
    const b = fake()
    await saveList(b, many(2))
    b.items.set('index', text)
    const out = await loadList(b)
    assert.deepEqual(out.entries, [])
    assert.ok(out.warning)
  }
})

test('a warning never holds a value', async () => {
  const b = fake()
  await saveList(b, many(3))
  b.items.set('index', btoa(`{"v":1,"note":"${VALUE}"`))
  assert.equal((await loadList(b)).warning?.includes(VALUE), false)
})

test('the list is capped: saying so, and leaving the old list', async () => {
  const b = fake(100, 3)
  await saveList(b, many(1))
  await assert.rejects(saveList(b, many(200)), StoreFull)
  assert.deepEqual((await loadList(b)).entries, many(1))
})

test('a backend that fails while reading gives a warning, not a throw', async () => {
  const b = fake()
  await saveList(b, many(3))
  b.get = async () => {
    throw new Error('timed out')
  }
  const out = await loadList(b)
  assert.deepEqual(out.entries, [])
  assert.ok(out.warning)
})

test('no password store and no sign of a list: empty and quiet, because that machine is fine (spec §8.1)', async () => {
  const b = fake()
  b.hasList = async () => {
    throw new Error('no keyring')
  }
  b.status = async () => 'missing'
  assert.deepEqual(await loadList(b), emptyList('missing'))
  b.status = async () => 'locked'
  assert.deepEqual(await loadList(b), emptyList('locked'))
})

test('a list that exists in a store that has gone away gives a warning', async () => {
  const b = fake()
  await saveList(b, many(2))
  b.status = async () => 'locked'
  const out = await loadList(b)
  assert.deepEqual(out.entries, [])
  assert.equal(out.unavailable, 'locked')
  assert.match(out.warning as string, /locked/)
})

// ---- the three OS stores, with the programs replaced ------------------------------------

type Call = { argv: readonly string[]; stdin: string | undefined }

function recording(answer: (c: Call) => { exitCode?: number; stdout?: string; stderr?: string }): { exec: Exec; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    exec: async (argv, init) => {
      const call = { argv, stdin: init?.stdin }
      calls.push(call)
      const a = answer(call)
      return { exitCode: a.exitCode ?? 0, stdout: a.stdout ?? '', stderr: a.stderr ?? '' }
    },
  }
}

function memoryFiles(): Files & { held: Map<string, string> } {
  const held = new Map<string, string>()
  return {
    held,
    read: async p => held.get(p) ?? '',
    write: async (p, t) => void held.set(p, t),
    exists: async p => held.has(p),
    path: name => `store/${name}.dpapi`,
  }
}

const SECRET_TEXT = `QUJD${'x'.repeat(40)}`

test('macOS: the value goes on stdin through security -i, never on a command line', async () => {
  const { exec, calls } = recording(() => ({}))
  const b = backendFor('macos', { exec, files: memoryFiles() })
  await b.put('list-1-0', SECRET_TEXT)
  assert.deepEqual(calls[0]?.argv, ['security', '-i'])
  assert.ok(calls[0]?.stdin?.includes(SECRET_TEXT))
  assert.ok(calls.every(c => !c.argv.some(a => a.includes(SECRET_TEXT))))
})

test('macOS: an error from inside security -i counts as a failed write', async () => {
  const { exec } = recording(() => ({ exitCode: 0, stderr: 'security: SecKeychainItemCreateFromContent: failed' }))
  await assert.rejects(backendFor('macos', { exec, files: memoryFiles() }).put('x', SECRET_TEXT))
})

test('macOS: an item that is not there reads as undefined', async () => {
  const { exec } = recording(() => ({ exitCode: 44, stderr: 'The specified item could not be found in the keychain.' }))
  assert.equal(await backendFor('macos', { exec, files: memoryFiles() }).get('x'), undefined)
})

test('Linux: the value goes on stdin to secret-tool', async () => {
  const { exec, calls } = recording(() => ({}))
  await backendFor('linux', { exec, files: memoryFiles() }).put('x', SECRET_TEXT)
  assert.equal(calls[0]?.argv[0], 'secret-tool')
  assert.equal(calls[0]?.stdin, SECRET_TEXT)
  assert.ok(calls.every(c => !c.argv.some(a => a.includes(SECRET_TEXT))))
})

test('Linux: lookup with no item reads as undefined; a missing keyring is an error, and locked', async () => {
  const gone = recording(() => ({ exitCode: 1 }))
  assert.equal(await backendFor('linux', { exec: gone.exec, files: memoryFiles() }).get('x'), undefined)
  const none = recording(() => ({ exitCode: 1, stderr: 'secret-tool: Cannot autolaunch D-Bus without X11' }))
  const b = backendFor('linux', { exec: none.exec, files: memoryFiles() })
  await assert.rejects(b.get('x'))
  assert.equal(await b.status(), 'locked')
})

test('a program that cannot start means no password store', async () => {
  const exec: Exec = async () => {
    throw new Error('ENOENT')
  }
  for (const os of ['macos', 'linux', 'windows'] as const) assert.equal(await backendFor(os, { exec, files: memoryFiles() }).status(), 'missing')
})

test('Windows: the value goes to PowerShell on stdin, and only ciphertext reaches a file', async () => {
  const { exec, calls } = recording(c => ({ stdout: `CIPHER${(c.stdin ?? '').length}\r\n` }))
  const files = memoryFiles()
  const b = backendFor('windows', { exec, files })
  await b.put('list-1-0', SECRET_TEXT)
  assert.ok(calls.every(c => !c.argv.some(a => a.includes(SECRET_TEXT))))
  assert.equal(calls[0]?.stdin, SECRET_TEXT)
  assert.deepEqual([...files.held.values()], [`CIPHER${SECRET_TEXT.length}`])
})

test('Windows: a failed PowerShell writes nothing to the file', async () => {
  const { exec } = recording(() => ({ exitCode: 1, stderr: 'boom' }))
  const files = memoryFiles()
  await assert.rejects(backendFor('windows', { exec, files }).put('x', SECRET_TEXT))
  assert.equal(files.held.size, 0)
})

test('Windows: with no index file, no process is started', async () => {
  const { exec, calls } = recording(() => ({}))
  assert.equal(await backendFor('windows', { exec, files: memoryFiles() }).hasList(), false)
  assert.equal(calls.length, 0)
})

test('Windows: a removed item reads as gone, because a mod cannot delete a file', async () => {
  const { exec } = recording(c => ({ stdout: c.stdin ?? '' }))
  const files = memoryFiles()
  const b = backendFor('windows', { exec, files })
  await b.put('x', SECRET_TEXT)
  await b.del('x')
  assert.equal(await b.get('x'), undefined)
})

test('each store has a piece size and a cap', () => {
  for (const os of ['macos', 'linux', 'windows'] as const) {
    const b = backendFor(os, { exec: recording(() => ({})).exec, files: memoryFiles() })
    assert.ok(b.pieceBytes >= 1024, os)
    assert.ok(b.maxPieces >= 1, os)
  }
})

// ---- removing saved values (/redact remove) ------------------------------------------------------

test('removeEntries takes out what is named and keeps the rest in order', async () => {
  const b = fake()
  const list = many(5)
  await saveList(b, list)
  assert.equal(await removeEntries(b, [`${VALUE}-1`, `${VALUE}-3`]), 2)
  assert.deepEqual(await loadList(b), { entries: [list[0], list[2], list[4]] })
})

test('removeEntries: the last value leaves an empty list, and the next save works', async () => {
  const b = fake()
  await saveList(b, many(1))
  assert.equal(await removeEntries(b, [`${VALUE}-0`]), 1)
  assert.deepEqual(await loadList(b), { entries: [] })
  await saveList(b, many(2))
  assert.equal((await loadList(b)).entries.length, 2)
})

test('removeEntries: a value not on the list changes nothing and writes nothing', async () => {
  const b = fake()
  const list = many(2)
  await saveList(b, list)
  b.calls.length = 0
  assert.equal(await removeEntries(b, ['not on the list']), 0)
  assert.deepEqual(b.calls, [])
  assert.deepEqual(await loadList(b), { entries: list })
})

test('removeEntries is all or nothing: a save that dies at any write leaves the whole old list', async () => {
  const old = many(10)
  for (let failAt = 1; failAt <= 6; failAt++) {
    const b = fake()
    await saveList(b, old)
    b.ops = 0
    b.failAt = failAt
    await assert.rejects(removeEntries(b, [`${VALUE}-4`]), /store went away/)
    b.failAt = Number.POSITIVE_INFINITY
    assert.deepEqual(await loadList(b), { entries: old }, `failed at write ${failAt}`)
  }
})

test('removeEntries refuses a list it cannot read, so a damaged or locked list is never replaced', async () => {
  const damaged = fake()
  await saveList(damaged, many(3))
  damaged.items.delete('list-1-0')
  const before = new Map(damaged.items)
  await assert.rejects(removeEntries(damaged, [`${VALUE}-0`]))
  assert.deepEqual(damaged.items, before)
  const locked = fake()
  await saveList(locked, many(3))
  locked.status = async () => 'locked'
  locked.get = async () => undefined
  await assert.rejects(removeEntries(locked, [`${VALUE}-0`]), /locked/)
})
