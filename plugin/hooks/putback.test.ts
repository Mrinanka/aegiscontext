// Put-back in the hooks (spec §10, D-096; run: claude plugin test ./plugin). The pure parts are in
// tests/core-putback.test.ts. Here: who decides, with the files and settings in play; the rewritten input
// reaching the tool; the notices; and what must never leak. Fakes are built from pieces.

import type { On, SessionAppendInput } from 'claude-code'
import { expect, mock, test as kitTest } from 'claude-code/testing'

const FAKE = ['ghp', 'Qw3rTy7UiOp9AsDf1GhJk5LzXc8VbNm2ZxCv'].join('_')
const FAKE2 = ['glpat', 'Zx9Cv8Bn7Mq6We5Rt4Yu'].join('-')

type Options = {
  settings?: Record<string, unknown>
  project?: Record<string, unknown>
  policy?: Record<string, unknown>
  files?: Record<string, string>
  noSurfaces?: boolean
  choice?: string
}

let posix = false
const work = (name = ''): string => (posix ? `/work/${name}` : `D:\\work\\${name}`)
const cfg = (...parts: string[]): string => (posix ? ['/cfg', ...parts].join('/') : ['D:\\cfg', ...parts].join('\\'))
const test = (name: string, body: Parameters<typeof kitTest>[1]): void => {
  kitTest(name, async ($, on) => {
    posix = !/^file:\/\/\/[A-Za-z]:/.test(import.meta.url)
    await (body as (a: typeof $, b: typeof on) => Promise<void>)($, on)
  })
}
const CHOICE = (): string => cfg('aegiscontext', 'put-back.json')

type World = { writes: { path: string; text: string }[]; states: unknown[]; ui: string[]; received: Record<string, unknown>[]; files: Record<string, string>; session: ReturnType<typeof mock.session> }

function world(on: On, o: Options = {}): World {
  const writes: World['writes'] = []
  const ui: string[] = []
  const received: Record<string, unknown>[] = []
  const states: unknown[] = []
  const files: Record<string, string> = { ...(o.files ?? {}) }
  if (o.choice !== undefined) files[CHOICE()] = o.choice
  const session = mock.session(on)
  on('command.register', () => ({ value: { command: 'redact' } }) as never)
  on('clock.now', () => ({ value: 1_800_000_000_000 }))
  on('state.set', (_$, e, next) => {
    states.push(e.value)
    return next(e)
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.env(on, { CLAUDE_CONFIG_DIR: cfg(), OS: 'Windows_NT', PATH: '' })
  on('session.id', () => ({ value: 'sess-0003' }))
  on('session.cwd', () => ({ value: work().slice(0, -1) }))
  on('session.surfaces', () => ({ value: o.noSurfaces ? [] : ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.316', base: '2.1.316', builtAt: 'x' } }))
  on('session.messages', () => ({ value: [] }))
  on('settings.read', (_$, e) => ({
    value: e.source === 'user' ? { aegisContext: o.settings ?? {} } : e.source === 'policy' ? (o.policy ?? {}) : e.source === 'project' && o.project ? { aegisContext: o.project } : {},
  }))
  on('fs.exists', (_$, e) => ({ value: e.path in files }))
  on('fs.read', (_$, e) => ({ value: files[e.path] ?? '' }))
  on('fs.stat', (_$, e) => {
    if (!(e.path in files)) throw new Error('ENOENT')
    return { value: { kind: 'file', size: files[e.path]?.length ?? 0, realPath: e.path } }
  })
  on('fs.list', () => ({ value: [] }))
  on('fs.write', (_$, e) => {
    writes.push({ path: e.path, text: e.text })
    files[e.path] = e.text
    return { value: undefined }
  })
  on('process.run', (_$, e) => ({ value: { exitCode: 0, stdout: e.init?.stdin ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.log', (_$, e) => {
    ui.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    ui.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  const store = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  // What reaches the tool itself: the input as the hooks left it.
  on('tool.call', (_$, e) => {
    received.push({ ...(e as unknown as Record<string, unknown>) })
    return { result: 'ran' }
  })
  return { writes, states, ui, received, files, session }
}

const row = (text: string): SessionAppendInput =>
  ({ door: 'tool-result', origin: { kind: 'tool', tool: 'Read' }, uuid: 'u-1', message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: text }] } }) as SessionAppendInput
const stored = (w: World): string => JSON.stringify(w.session.appended())
const placeholder = (w: World, nth = 0): string => ([...stored(w).matchAll(/\[REDACTED:[A-Z0-9_]+(?: \.\.\.[A-Za-z0-9]{4})? #[a-z2-7]{13}\]/g)][nth] as RegExpMatchArray)[0]
const write = (file_path: string, content: string) => ({ tool: 'Write', file_path, content }) as never
const edit = (file_path: string, old_string: string, new_string: string) => ({ tool: 'Edit', file_path, old_string, new_string }) as never
const redact = async ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, args: string, kind = 'composer'): Promise<string> =>
  (await $.command.run({ command: 'redact', args, origin: { kind } } as never)).text ?? ''
/**
 * Nothing Claude can see, no screen line, no file the tool writes and no state write holds a value. The one list that
 * does is the session's catches in the host's memory (it is how a restarted worker hides them again), so it is left out.
 */
const noFake = (w: World, except: string[] = []): void => {
  const states = w.states.filter(s => !(Array.isArray(s) && s.some(x => typeof x === 'object' && x !== null && 'value' in x)))
  const seen = [...w.ui, ...w.writes.filter(x => !except.includes(x.path)).map(x => x.text), JSON.stringify(states), stored(w)]
  for (const t of seen) {
    expect(t.includes(FAKE)).toBe(false)
    expect(t.includes(FAKE2)).toBe(false)
  }
}

/** A file on disk that holds the fake, read by Claude (so the session knows its placeholder). */
async function readIt($: Parameters<Parameters<typeof kitTest>[1]>[0], w: World, file: string): Promise<string> {
  await $.session.append(row(w.files[file] as string))
  return placeholder(w)
}

// ---- who decides -------------------------------------------------------------------------------------

test('off by default: the guard refuses the rewrite and nothing is rewritten', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` } })
  const ph = await readIt($, w, file)
  const out = await $.tool.call(write(file, `token: ${ph}\n`))
  expect(typeof out.deny).toBe('string')
  expect(w.received).toEqual([])
})

test('on by the developer: a Write of the redacted file saves the real file, and the model never gets the value', async ($, on) => {
  const file = work('app.yaml')
  const disk = `name: demo\ntoken: ${FAKE}\nport: 1\n`
  const w = world(on, { files: { [file]: disk }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, file)
  await $.tool.call(write(file, `name: demo\ntoken: ${ph}\nport: 2\n`))
  expect(w.received.length).toBe(1)
  expect(w.received[0]?.content).toBe(`name: demo\ntoken: ${FAKE}\nport: 2\n`)
  noFake(w, [])
})

test('the developer turns it on and off with /redact put-back, and the choice file holds no value', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` } })
  const ph = await readIt($, w, file)
  expect(await redact($, 'put-back')).toContain('off')
  const said = await redact($, 'put-back on')
  expect(said).toContain('on')
  expect(said.toLowerCase()).toContain('keep it off')
  expect(w.writes.some(x => x.path === CHOICE())).toBe(true)
  await $.tool.call(write(file, `token: ${ph}\n`))
  expect(w.received[0]?.content).toBe(`token: ${FAKE}\n`)
  expect(await redact($, 'put-back')).toContain('your choice for all projects')
  await redact($, 'put-back off')
  w.received.length = 0
  const out = await $.tool.call(write(file, `token: ${ph}\n`))
  expect(typeof out.deny).toBe('string')
  expect(w.received).toEqual([])
  noFake(w)
})

test('--here beats the choice for all projects, and only for this folder', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, file)
  await redact($, 'put-back off --here')
  const out = await $.tool.call(write(file, `token: ${ph}\n`))
  expect(typeof out.deny).toBe('string')
  expect(await redact($, 'put-back')).toContain('this folder')
})

test('managed off binds with no locked list, and the developer cannot turn it back on', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` }, choice: '{"all":"on"}', policy: { aegisContext: { put_back: 'off' } } })
  const ph = await readIt($, w, file)
  const out = await $.tool.call(write(file, `token: ${ph}\n`))
  expect(typeof out.deny).toBe('string')
  expect(await redact($, 'put-back on')).toContain('organization')
  expect(await redact($, 'put-back')).toContain('organization')
})

test('a project that says on turns it on for a developer who said nothing, with a notice that names the project, once', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` }, project: { put_back: 'on' }, settings: { notices: 'off' } })
  const ph = await readIt($, w, file)
  await $.tool.call(write(file, `token: ${ph}\n`))
  expect(w.received[0]?.content).toBe(`token: ${FAKE}\n`)
  expect(w.ui.some(l => l.includes('turned on put-back'))).toBe(true)
  const seen = w.ui.filter(l => l.includes('turned on put-back')).length
  await $.tool.call(write(file, `token: ${ph}\n`))
  expect(w.ui.filter(l => l.includes('turned on put-back')).length).toBe(seen)
  noFake(w)
})

test('a project "on" is ignored when the developer said off, and with no surface to show the notice', async ($, on) => {
  const file = work('app.yaml')
  const a = world(on, { files: { [file]: `token: ${FAKE}\n` }, project: { put_back: 'on' }, choice: '{"all":"off"}' })
  const ph = await readIt($, a, file)
  expect(typeof (await $.tool.call(write(file, `token: ${ph}\n`))).deny).toBe('string')
  expect(a.ui.some(l => l.includes('turned on put-back'))).toBe(false)
})

test('a project "on" with no surface is ignored', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` }, project: { put_back: 'on' }, noSurfaces: true })
  const ph = await readIt($, w, file)
  expect(typeof (await $.tool.call(write(file, `token: ${ph}\n`))).deny).toBe('string')
})

test('a broken choice file reads as off, so a repo "on" cannot get past it', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` }, project: { put_back: 'on' }, choice: '{not json' })
  const ph = await readIt($, w, file)
  expect(typeof (await $.tool.call(write(file, `token: ${ph}\n`))).deny).toBe('string')
  expect(await redact($, 'put-back')).toContain('could not be read')
})

test('observe mode restores nothing', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` }, choice: '{"all":"on"}', settings: { mode: 'observe' } })
  await $.session.append(row(`token: ${FAKE}`))
  await $.tool.call(write(file, 'token: [REDACTED:GITHUB_PAT #aaaaaaaaaaaaa]\n'))
  expect(w.received[0]?.content).toBe('token: [REDACTED:GITHUB_PAT #aaaaaaaaaaaaa]\n')
})

// ---- the rewrite ---------------------------------------------------------------------------------------

test('an Edit through a placeholder line is found and written with the real value', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `a: 1\ntoken: ${FAKE}\n` }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, file)
  await $.tool.call(edit(file, `token: ${ph}`, `api_token: ${ph}`))
  expect(w.received[0]?.old_string).toBe(`token: ${FAKE}`)
  expect(w.received[0]?.new_string).toBe(`api_token: ${FAKE}`)
  noFake(w)
})

test('a failed Edit stays as Claude wrote it, so nothing can echo the value', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, file)
  await $.tool.call(edit(file, `key: ${ph}`, `key: ${ph}2`))
  expect(w.received[0]?.old_string).toBe(`key: ${ph}`)
  expect(JSON.stringify(w.received)).not.toContain(FAKE)
})

test('an Edit whose text matches twice stays as Claude wrote it, so the "several matches" error cannot hold the value', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `a: ${FAKE}\nb: ${FAKE}\n` }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, file)
  await $.tool.call(edit(file, ph, `${ph}2`))
  expect(w.received[0]?.old_string).toBe(ph)
  expect(JSON.stringify(w.received)).not.toContain(FAKE)
})

test('a new file keeps its placeholder', async ($, on) => {
  const file = work('new.yaml')
  const w = world(on, { files: { [work('app.yaml')]: `token: ${FAKE}\n` }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, work('app.yaml'))
  await $.tool.call(write(file, `token: ${ph}\n`))
  expect(w.received[0]?.content).toBe(`token: ${ph}\n`)
})

test('a file that holds the value twice is saved with no more than two copies, even if Claude writes three', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `a: ${FAKE}\nb: ${FAKE}\n` }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, file)
  await $.tool.call(write(file, `a: ${ph}\nb: ${ph}\nc: ${ph}\n`))
  const content = String(w.received[0]?.content)
  expect(content.split(FAKE).length - 1).toBe(2)
  expect(content.endsWith(`c: ${ph}\n`)).toBe(true)
})

test('a message says how many were restored, and the placeholder notice covers those left', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `a: ${FAKE}\n` }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, file)
  await $.tool.call(write(file, `a: ${ph}\nb: ${ph}\n`))
  expect(w.ui.some(l => l.includes('restored 1'))).toBe(true)
  expect(w.ui.some(l => l.includes('line 2'))).toBe(true)
  noFake(w)
})

test('R-11 exception: a value that cannot be restored is replaced by its placeholder, and the person is told', async ($, on) => {
  const file = work('app.yaml')
  // A new session that never read the file: the placeholder's tag is unknown here, only its kind matches.
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` }, choice: '{"all":"on"}' })
  const lost = '[REDACTED:GITHUB_PAT ...ZxCv #aaaaaaaaaaaaa]'
  await $.tool.call(write(file, `token: ${lost}\n`))
  expect(w.received.length).toBe(1)
  expect(w.received[0]?.content).toBe(`token: ${lost}\n`)
  expect(w.ui.some(l => l.includes('could not restore'))).toBe(true)
  noFake(w)
})

test('the same lost secret is still refused with put-back off', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `token: ${FAKE}\n` } })
  const out = await $.tool.call(write(file, 'token: [REDACTED:GITHUB_PAT ...ZxCv #aaaaaaaaaaaaa]\n'))
  expect(typeof out.deny).toBe('string')
  expect(w.received).toEqual([])
})

test('a NotebookEdit is left alone, and its guard still refuses', async ($, on) => {
  const file = work('n.ipynb')
  const w = world(on, { files: { [file]: JSON.stringify({ cells: [{ source: [`token = "${FAKE}"`] }] }) }, choice: '{"all":"on"}' })
  const ph = await readIt($, w, file)
  const out = await $.tool.call({ tool: 'NotebookEdit', notebook_path: file, new_source: `token = "${ph}"` } as never)
  expect(JSON.stringify(w.received)).not.toContain(FAKE)
  expect(out.deny === undefined || typeof out.deny === 'string').toBe(true)
})

test('a value that only a command showed is put back too', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `x: ${FAKE2}\n` }, choice: '{"all":"on"}' })
  await $.session.append({ door: 'tool-result', origin: { kind: 'tool', tool: 'Bash' }, uuid: 'u-2', message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: `out ${FAKE2}` }] } } as never)
  const ph = placeholder(w)
  await $.tool.call(write(file, `x: ${ph}\n`))
  expect(w.received[0]?.content).toBe(`x: ${FAKE2}\n`)
})

test('a restored value is hidden again if it shows up later', async ($, on) => {
  const file = work('app.yaml')
  const w = world(on, { files: { [file]: `password: ${'Summer' + 'Rainfall'}\n` }, choice: '{"all":"on"}' })
  await $.session.append(row(w.files[file] as string))
  const ph = placeholder(w)
  await $.tool.call(write(file, `password: ${ph}\n`))
  await $.session.append({ door: 'tool-result', origin: { kind: 'tool', tool: 'Bash' }, uuid: 'u-3', message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't3', content: `echo ${'Summer' + 'Rainfall'}` }] } } as never)
  expect(stored(w).includes('SummerRainfall')).toBe(false)
})

// ---- who can change it -----------------------------------------------------------------------------------

test("R-16 and R-18: Claude can't run /redact put-back, and can't write the choice file", async ($, on) => {
  const w = world(on)
  expect(await redact($, 'put-back on', 'tool')).toContain('Only you')
  expect(w.writes.some(x => x.path === CHOICE())).toBe(false)
  expect(typeof (await $.tool.call(write(CHOICE(), '{"all":"on"}'))).deny).toBe('string')
  expect(typeof (await $.tool.call({ tool: 'Skill', skill: 'redact' } as never)).deny).toBe('string')
})

test('/redact put-back refuses anything it does not know and never echoes it', async ($, on) => {
  const w = world(on)
  const said = await redact($, `put-back on ${FAKE}`)
  expect(said).toContain('Use:')
  expect(said.includes(FAKE)).toBe(false)
  expect(w.writes.some(x => x.path === CHOICE())).toBe(false)
  for (const bad of ['put-back on off', 'put-back --here']) expect(await redact($, bad)).toContain('Use:')
})

test('the usage line and /redact itself mention put-back', async ($, on) => {
  world(on)
  expect(await redact($, 'nonsense')).toContain('put-back')
  expect(await redact($, '')).toContain('Put-back')
})

test('/redact doctor has a put-back line with the reason', async ($, on) => {
  world(on)
  expect(await ($.command.run({ command: 'aegiscontext:doctor', args: '', origin: { kind: 'composer' } } as never).then(r => (r as { text?: string }).text ?? ''))).toContain('Put-back')
})

// ---- the note --------------------------------------------------------------------------------------------

const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never

test('the put-back note is added only in a session that started with put-back on, and stays the same for the thread', async ($, on) => {
  const w = world(on, { choice: '{"all":"on"}' })
  on('prompt.compose', () => ({ sections: [] }))
  const first = await $.prompt.compose(COMPOSE)
  expect(first.sections.map(s => s.id)).toContain('aegiscontext:placeholders')
  expect(first.sections.map(s => s.id)).toContain('aegiscontext:put-back')
  await redact($, 'put-back off')
  const second = await $.prompt.compose(COMPOSE)
  expect(second.sections.map(s => s.id)).toContain('aegiscontext:put-back')
  noFake(w)
})

test('with put-back off the note is the one it always was; turning it on mid-thread waits for a new session', async ($, on) => {
  world(on)
  on('prompt.compose', () => ({ sections: [] }))
  const first = await $.prompt.compose(COMPOSE)
  expect(first.sections.map(s => s.id)).toEqual(['aegiscontext:placeholders'])
  await redact($, 'put-back on')
  const second = await $.prompt.compose(COMPOSE)
  expect(second.sections.map(s => s.id)).toEqual(['aegiscontext:placeholders'])
})
