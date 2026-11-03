// Hook tests (run: claude plugin test ./plugin). Nothing sits beneath the plugin, so each `$` call it
// makes is answered here. Fakes are built from pieces.

import type { On, SessionAppendInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const FAKE = ['ghp', 'Qw3rTy7UiOp9AsDf1GhJk5LzXc8VbNm2ZxCv'].join('_')
const PW = ['Autumn', '2026', 'xk'].join('')
const SESSION = 'sess-0001'

type World = { writes: { path: string; text: string }[]; stores: unknown[]; states: unknown[]; ui: string[]; session: ReturnType<typeof mock.session> }

type WorldOptions = { clock?: boolean; session?: () => string; state?: unknown; exists?: (path: string) => boolean; os?: string; refuseState?: () => boolean }

function world(on: On, settings: Record<string, unknown> = {}, o: WorldOptions = {}): World {
  const writes: World['writes'] = []
  const stores: unknown[] = []
  const states: unknown[] = []
  const ui: string[] = []
  if (o.clock !== false) mock.clock(on, { now: 1_800_000_000_000 })
  mock.env(on, { CLAUDE_CONFIG_DIR: 'D:\\cfg', ...(o.os ? { OS: o.os } : {}) })
  on('session.id', () => ({ value: o.session?.() ?? SESSION }))
  on('session.cwd', () => ({ value: 'D:\\work' }))
  on('settings.read', (_$, e) => ({ value: e.source === 'user' ? { aegisContext: settings } : {} }))
  on('fs.exists', (_$, e) => ({ value: o.exists?.(e.path) ?? false }))
  on('fs.list', () => ({ value: [] }))
  on('fs.write', (_$, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('state.get', () => ({ value: { value: o.state, version: o.state ? 1 : 0 } }))
  on('state.set', (_$, e, next) => {
    // A throw here only skips this hook, and the kit's own state store answers. An oversized value is refused.
    if (o.refuseState?.()) return next({ ...e, value: 'x'.repeat(5_000_000) })
    states.push(e.value)
    return { value: { isSet: true, version: 1 } }
  })
  on('ui.log', (_$, e) => {
    ui.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    ui.push(e.text)
    return { value: undefined }
  })
  const store = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    stores.push(e.value)
    store.set(e.key, e.value)
    return { value: undefined }
  })
  return { writes, stores, states, ui, session: mock.session(on) }
}

function toolResult(text: string): SessionAppendInput {
  return {
    door: 'tool-result',
    origin: { kind: 'tool', tool: 'Bash' },
    uuid: 'u-1',
    message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: text }] },
  } as SessionAppendInput
}

test('a tool result holding a secret is stored with a placeholder', async ($, on) => {
  const w = world(on)
  await $.session.append(toolResult(`token ${FAKE} ok`))
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes(FAKE)).toBe(false)
  expect(stored.includes('[REDACTED:')).toBe(true)
})

test('a fake reaches no file write, state write, store write or screen line', async ($, on) => {
  const w = world(on)
  await $.session.append(toolResult(`password=${PW} and ${FAKE}`))
  await $.session.append(toolResult(`again ${FAKE}`))
  for (const text of [...w.writes.map(x => x.text), ...w.ui, JSON.stringify(w.stores)]) {
    expect(text.includes(FAKE)).toBe(false)
    expect(text.includes(PW)).toBe(false)
  }
  expect(w.writes.some(x => x.path.includes('aegiscontext'))).toBe(true)
})

test('a row before session.start still works, and the marker is written at session.start', async ($, on) => {
  const w = world(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.append(toolResult(`early ${FAKE}`))
  expect(JSON.stringify(w.session.appended()).includes(FAKE)).toBe(false)
  await $.session.start({ cwd: 'D:\\work', surface: 'terminal', isInteractive: false })
  const marker = w.writes.find(x => x.path.includes('markers'))
  expect(marker?.text.includes('"running":true')).toBe(true)
})

test('a hook that fails: allow lets the row through with a warning', async ($, on) => {
  const w = world(on, {}, { clock: false })
  on('clock.now', () => {
    throw new Error('boom')
  })
  await $.session.append(toolResult(`x ${FAKE}`))
  expect(w.ui.some(l => l.includes('reached the model unchecked'))).toBe(true)
  expect(JSON.stringify(w.session.appended()).includes('withheld')).toBe(false)
})

test('a hook that fails: hold withholds the row, and the warning holds no content', async ($, on) => {
  const w = world(on, { on_check_failure: 'hold' }, { clock: false })
  on('clock.now', () => {
    throw new Error('boom')
  })
  await $.session.append(toolResult(`x ${FAKE}`))
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes('withheld')).toBe(true)
  expect(stored.includes(FAKE)).toBe(false)
  expect(w.ui.join(' ').includes(FAKE)).toBe(false)
})

test('the note about hidden values is the same on every turn', async ($, on) => {
  world(on)
  on('prompt.compose', () => ({ sections: [] }))
  const a = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  const b = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  expect(JSON.stringify(a).includes('hidden')).toBe(true)
})

// Each hook that rewrites: the same hiding, reached by its own door.

const submit = (text: string) => ({ text, wait: false, origin: { kind: 'user' } }) as never
const context = (text: string) => ({ blocks: [{ name: 'claudeMd', text }, { name: 'currentDate', text: 'today' }], instructionFiles: [] }) as never
const attachment = (text: string) => ({ type: 'todo_reminder', text, origin: { kind: 'engine' } }) as never

test('prompt.submit: the text that enters holds a placeholder', async ($, on) => {
  world(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  const out = await $.prompt.submit(submit(`token ${FAKE}`))
  expect(JSON.stringify(out).includes(FAKE)).toBe(false)
  expect(JSON.stringify(out).includes('[REDACTED:')).toBe(true)
})

test('prompt.context: an instruction block is rewritten and the others stay', async ($, on) => {
  world(on)
  on('prompt.context', (_$, e) => ({ blocks: e.blocks }))
  const out = await $.prompt.context(context(`notes ${FAKE}`))
  expect(JSON.stringify(out).includes(FAKE)).toBe(false)
  expect(JSON.stringify(out).includes('today')).toBe(true)
})

test('prompt.attachment: injected text is rewritten', async ($, on) => {
  world(on)
  on('prompt.attachment', (_$, e) => ({ text: e.text }))
  const out = await $.prompt.attachment(attachment(`x ${FAKE}`))
  expect(JSON.stringify(out).includes(FAKE)).toBe(false)
})

test('a rule set to block drops the prompt and withholds a row', async ($, on) => {
  const w = world(on, { rules: { actions: { 'github-pat': 'block' } } })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  const out = await $.prompt.submit(submit(`token ${FAKE}`))
  expect('drop' in out && typeof out.drop === 'string').toBe(true)
  await $.session.append(toolResult(`and ${FAKE} more`))
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes('withheld')).toBe(true)
  expect(stored.includes('more')).toBe(false)
})

// R-12: a failure is seen on screen and written to the log, whichever hook it was.

const failureLines = (w: World): string[] => w.writes.filter(x => x.path.includes('log')).flatMap(x => x.text.split('\n')).filter(l => l.includes('"event":"failure"'))

for (const [name, call] of [
  ['prompt.submit', ($: never) => ($ as { prompt: { submit: (x: never) => Promise<unknown> } }).prompt.submit(submit(`x ${FAKE}`))],
  ['prompt.context', ($: never) => ($ as { prompt: { context: (x: never) => Promise<unknown> } }).prompt.context(context(`x ${FAKE}`))],
  ['prompt.attachment', ($: never) => ($ as { prompt: { attachment: (x: never) => Promise<unknown> } }).prompt.attachment(attachment(`x ${FAKE}`))],
] as const) {
  test(`R-12: ${name} failing writes a log entry and a warning, and neither holds content`, async ($, on) => {
    const w = world(on, {}, { clock: false })
    let calls = 0
    on('clock.now', () => {
      calls++
      if (calls <= 2) throw new Error('boom')
      return { value: 1_800_000_000_000 }
    })
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('prompt.context', (_$, e) => ({ blocks: e.blocks }))
    on('prompt.attachment', (_$, e) => ({ text: e.text }))
    await call($ as never)
    expect(w.ui.some(l => l.includes('a check failed'))).toBe(true)
    expect(failureLines(w).length > 0).toBe(true)
    expect(JSON.stringify(w.writes).includes(FAKE)).toBe(false)
  })
}

test('R-12: a check that could not finish hides what it found and warns; hold withholds', async ($, on) => {
  const w = world(on, { on_check_failure: 'hold' })
  // More decoded text than one layer may hold, so the decoder stops: a check failure with no timing in it.
  await $.session.append(toolResult(`${FAKE} ${'x%41 \\n'.repeat(1_400_000)}`))
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes('withheld')).toBe(true)
  expect(failureLines(w).length > 0).toBe(true)
})

test('the marker: running, not running at session.end, running again at the next prompt under the new id', async ($, on) => {
  let id = 'sess-0001'
  const w = world(on, {}, { session: () => id })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: id }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.session.start({ cwd: 'D:\\work', surface: 'terminal', isInteractive: false })
  await $.session.end({ reason: 'clear', sessionId: id } as never)
  const ended = w.writes.filter(x => x.path.includes('markers')).at(-1)
  expect(ended?.text.includes('"running":false')).toBe(true)
  id = 'sess-0002'
  await $.prompt.submit(submit('hello'))
  const next = w.writes.filter(x => x.path.includes('markers')).at(-1)
  expect(next?.path.includes('sess-0002')).toBe(true)
  expect(next?.text.includes('"running":true')).toBe(true)
})

test('catches kept in $.state come back after a worker restart, with their tags', async ($, on) => {
  const w = world(on, {}, { state: [{ value: PW, tag: 'abcdefghij234', label: 'PASSWORD', ruleId: 'password-label', showHint: false, caught: true }] })
  await $.session.append(toolResult(`bare ${PW} here`))
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes(PW)).toBe(false)
  expect(stored.includes('#abcdefghij234')).toBe(true)
})

test('a refused catch save says so, logs it, stores the row, and the next row tries again', async ($, on) => {
  let refuse = true
  const w = world(on, {}, { refuseState: () => refuse })
  await $.session.append(toolResult(`token ${FAKE} ok`))
  expect(w.states.length).toBe(0)
  expect(w.ui.some(l => l.includes('could not be kept'))).toBe(true)
  expect(w.writes.some(x => x.path.includes('log') && x.text.includes('catch-save'))).toBe(true)
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes(FAKE)).toBe(false)
  expect(stored.includes('[REDACTED:')).toBe(true)
  refuse = false
  await $.session.append(toolResult('nothing new in this one'))
  expect(w.states.length).toBe(1)
})

test('the log says which file, for Read, and no other tool sets the file name', async ($, on) => {
  const w = world(on)
  await $.session.append({ door: 'response', origin: { kind: 'model', model: 'm' }, uuid: 'u-2', message: { type: 'assistant', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'config/app.env' } }] } } as SessionAppendInput)
  await $.session.append({ ...toolResult(`x ${FAKE}`), origin: { kind: 'tool', tool: 'Read' } } as SessionAppendInput)
  expect(w.writes.some(x => x.path.includes('log') && x.text.includes('config/app.env'))).toBe(true)
})

test('a tool other than Read cannot make text count as a source file', async ($, on) => {
  const w = world(on)
  await $.session.append({ door: 'response', origin: { kind: 'model', model: 'm' }, uuid: 'u-3', message: { type: 'assistant', role: 'assistant', content: [{ type: 'tool_use', id: 't9', name: 'mcp__x__get', input: { path: 'a.ts' } }] } } as SessionAppendInput)
  await $.session.append({ ...toolResult('password = Hunter2Harbor'), message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't9', content: 'password = Hunter2Harbor' }] } } as SessionAppendInput)
  expect(JSON.stringify(w.session.appended()).includes('Hunter2Harbor')).toBe(false)
})

// The registered list, with PowerShell and the files simulated: DPAPI is a plain copy here.

const REGISTERED = ['Zq7', 'registered', 'Kd93mLx'].join('-')

const encode = (text: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/=+$/, '')

async function checksum(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
}

test('a registered secret is loaded through the store and hidden', async ($, on) => {
  const list = encode(JSON.stringify([{ value: REGISTERED, label: 'my token', added: '2026-11-01' }]))
  const index = encode(JSON.stringify({ v: 1, generation: 1, pieces: 1, checksum: await checksum(list), count: 1 }))
  const w = world(on, {}, { os: 'Windows_NT', exists: path => path.includes('store') })
  on('fs.read', (_$, e) => ({ value: e.path.includes('index') ? index : list }))
  on('process.run', (_$, e) => ({ value: { exitCode: 0, stdout: e.init?.stdin ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  await $.session.append(toolResult(`a value ${REGISTERED} here`))
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes(REGISTERED)).toBe(false)
  expect(stored.includes('MY_TOKEN')).toBe(true)
  expect(JSON.stringify(w.writes).includes(REGISTERED)).toBe(false)
})

test('a store that fails gives a warning, and hiding carries on', async ($, on) => {
  const w = world(on, {}, { os: 'Windows_NT', exists: path => path.includes('store') })
  on('fs.read', () => ({ value: 'cipher' }))
  on('process.run', () => {
    throw new Error('powershell went away')
  })
  await $.session.append(toolResult(`token ${FAKE}`))
  expect(JSON.stringify(w.session.appended()).includes(FAKE)).toBe(false)
  expect(w.ui.some(l => l.includes('saved secrets'))).toBe(true)
})

test('no list saved: no process is started', async ($, on) => {
  let runs = 0
  const w = world(on, {}, { os: 'Windows_NT' })
  on('process.run', () => {
    runs++
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.append(toolResult('nothing here'))
  expect(runs).toBe(0)
  expect(w.ui.length).toBe(0)
})

// Found by pasting large inputs through a real session: a hook that dies sends its whole row unhidden.

const lines = (n: number): string => 'some plain text that goes on and on\n'.repeat(n)

test('a large base64 block next to a secret: the row is still cleaned, and the hook survives', async ($, on) => {
  const w = world(on)
  await $.session.append(toolResult(`token ${FAKE}\n${btoa(lines(40000))}`))
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes(FAKE)).toBe(false)
  expect(w.ui.join(' ').includes('a check failed')).toBe(false)
})

test('a private key in front of a large base64 block: the hook survives and hides both', async ($, on) => {
  const w = world(on)
  const key = ['-----BEGIN', 'RSA PRIVATE', 'KEY-----'].join(' ')
  await $.session.append(toolResult(`token ${FAKE}\n${key}\n${btoa(lines(40000))}`))
  const stored = JSON.stringify(w.session.appended())
  expect(stored.includes(FAKE)).toBe(false)
  expect(stored.includes('c29tZSBwbGFpbiB0ZXh0')).toBe(false)
  expect(w.ui.join(' ').includes('a check failed')).toBe(false)
})

// A value past the remembering limit is a known limit (spec §22): each door has to say it happened.

const TOO_LONG = 'Kq7'.repeat(2731)
const told = (w: World): string[] => w.ui.filter(l => l.includes('too long to remember'))

test('a value too long to remember: a row says so once, with no value on screen', async ($, on) => {
  const w = world(on)
  await $.session.append(toolResult(`password=${TOO_LONG}`))
  await $.session.append(toolResult(`password=${TOO_LONG}`))
  expect(told(w).length).toBe(2) // one call to warn: the log line and its toast
  expect(w.ui.join(' ').includes(TOO_LONG)).toBe(false)
  expect(w.ui.join(' ').includes('is full')).toBe(false)
  expect(JSON.stringify(w.session.appended()).includes(TOO_LONG)).toBe(false)
})

test('a value too long to remember: prompt.submit says so', async ($, on) => {
  const w = world(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.prompt.submit(submit(`password=${TOO_LONG}`))
  expect(told(w).length > 0).toBe(true)
})

test('a value too long to remember: prompt.context says so', async ($, on) => {
  const w = world(on)
  on('prompt.context', (_$, e) => ({ blocks: e.blocks }))
  await $.prompt.context(context(`password=${TOO_LONG}`))
  expect(told(w).length > 0).toBe(true)
})

test('a value too long to remember: prompt.attachment says so', async ($, on) => {
  const w = world(on)
  on('prompt.attachment', (_$, e) => ({ text: e.text }))
  await $.prompt.attachment(attachment(`password=${TOO_LONG}`))
  expect(told(w).length > 0).toBe(true)
})
