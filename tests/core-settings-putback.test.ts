// The put_back setting (spec §10 and §14, D-096): what counts from each level. The developer's own choice is not
// a setting; it is made with /redact put-back and kept in the tool's data folder (tests/core-putback.test.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, LOCK_NAMES, resolveSettings } from '../src/core/settings.ts'

const pb = (sources: Parameters<typeof resolveSettings>[0]) => resolveSettings(sources).settings.put_back

test('the default is nothing said: not off by managed, no repo value', () => {
  assert.deepEqual(DEFAULTS.put_back, { managedOff: false })
  assert.deepEqual(pb({}), { managedOff: false })
})

test('managed off binds with no locked list', () => {
  assert.deepEqual(pb({ policy: { put_back: 'off' } }), { managedOff: true })
})

test('managed on is ignored, with a notice: an organization can forbid put-back, not switch it on', () => {
  const r = resolveSettings({ policy: { put_back: 'on' } })
  assert.deepEqual(r.settings.put_back, { managedOff: false })
  assert.ok(r.notices.some(n => n.startsWith('policy:') && n.includes('put_back')), r.notices.join('|'))
  assert.equal(r.ok, true)
})

test('locked put_back means off, and a project cannot say otherwise', () => {
  const r = resolveSettings({ policy: { locked: ['put_back'] }, project: { put_back: 'on' } })
  assert.deepEqual(r.settings.put_back, { managedOff: true })
  assert.ok(r.notices.some(n => n.includes('put_back') && n.includes('locked')), r.notices.join('|'))
})

test('put_back is a lock name, and only managed settings may lock it', () => {
  assert.ok(LOCK_NAMES.includes('put_back'))
  const user = resolveSettings({ user: { locked: ['put_back'] } })
  assert.equal(user.settings.put_back.managedOff, false)
  assert.ok(user.notices.some(n => n.includes('locked')))
})

test('a user-level put_back is ignored with a notice that points to the command', () => {
  for (const value of ['on', 'off']) {
    const r = resolveSettings({ user: { put_back: value } })
    assert.deepEqual(r.settings.put_back, { managedOff: false }, value)
    const note = r.notices.find(n => n.startsWith('user:') && n.includes('put_back'))
    assert.ok(note, value)
    assert.ok(note.includes('/redact put-back'), note)
  }
})

test('a project, local or flag source can say on or off: the one exception to "stricter only"', () => {
  for (const source of ['project', 'local', 'flag'] as const) {
    const on = resolveSettings({ [source]: { put_back: 'on' } })
    assert.deepEqual(on.settings.put_back, { managedOff: false, repo: 'on' }, source)
    assert.ok(!on.notices.some(n => n.includes('stricter')), `${source}: no "stricter" refusal`)
    assert.deepEqual(pb({ [source]: { put_back: 'off' } }), { managedOff: false, repo: 'off' }, source)
  }
})

test('any project-level off beats an on, whatever the order', () => {
  assert.equal(pb({ project: { put_back: 'on' }, local: { put_back: 'off' } }).repo, 'off')
  assert.equal(pb({ project: { put_back: 'off' }, local: { put_back: 'on' } }).repo, 'off')
  assert.equal(pb({ project: { put_back: 'off' }, flag: { put_back: 'on' } }).repo, 'off')
  assert.equal(pb({ project: { put_back: 'on' }, flag: { put_back: 'on' } }).repo, 'on')
})

test('managed off and a project on: managed off still shows, so the table gives off', () => {
  assert.deepEqual(pb({ policy: { put_back: 'off' }, project: { put_back: 'on' } }), { managedOff: true, repo: 'on' })
})

test('a bad value is an error for that source and never echoes the value', () => {
  const r = resolveSettings({ project: { put_back: 'S3cret-looking-value' } })
  assert.equal(r.ok, false)
  assert.ok(r.errors.some(e => e.startsWith('project: put_back')))
  assert.ok(!r.errors.join('|').includes('S3cret'))
  assert.deepEqual(r.settings.put_back, { managedOff: false }, 'a broken project source is left out on its own')
  const num = resolveSettings({ policy: { put_back: 1 } })
  assert.equal(num.ok, false)
})

test('a broken managed source falls back to the last good settings, put_back included', () => {
  const good = resolveSettings({ policy: { put_back: 'off' } }).settings
  const r = resolveSettings({ policy: { put_back: 'perhaps' } }, { lastGood: good })
  assert.equal(r.settings.put_back.managedOff, true)
})

test('put_back does not change any other setting', () => {
  const a = resolveSettings({ project: { put_back: 'on' } }).settings
  const { put_back: _ignored, ...rest } = a
  const { put_back: _also, ...base } = DEFAULTS
  assert.deepEqual(rest, base)
})
