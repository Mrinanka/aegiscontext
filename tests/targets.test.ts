// docs/engineering/targets.md and tools/measure/targets.ts must say the same numbers (plan step 5 item 9): a target that
// is published but not enforced, or enforced but not published, is no target.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TARGETS } from '../tools/measure/targets.ts'

const doc = fs.readFileSync(path.join(import.meta.dirname, '..', 'docs', 'engineering', 'targets.md'), 'utf8')
const table = doc.slice(doc.indexOf('## The targets'), doc.indexOf('## What changed in step 5'))
const comma = (n: number): string => n.toLocaleString('en-US')

test('every enforced number appears in the published table', () => {
  const row = (needle: string): string => table.split('\n').find(l => l.includes(needle)) ?? ''
  assert.ok(row('any item of the speed set').includes(`**${comma(TARGETS.pipelineMs)} ms**`))
  assert.ok(row('the backup lock').includes(`**${TARGETS.backupHookMs} ms**`))
  assert.ok(row('Catch rate').includes(`**${TARGETS.catchAtLeast} of ${TARGETS.catchOf}**`))
  assert.ok(row('Code set: harmless code').includes(`**${TARGETS.codeLeftAlone} of ${TARGETS.codeLeftAlone}**`))
  assert.ok(row('Code set twins').includes(`**${TARGETS.twinsHidden} of ${TARGETS.twinsHidden}**`))
  assert.ok(row('source files read with their file name').includes(`**${TARGETS.falseAlarmsPerMb.sourceWithFile}**`))
  assert.ok(row('the same files with no file name').includes(`**${TARGETS.falseAlarmsPerMb.sourceNoFile}**`))
  assert.ok(row('log-like text').includes(`**${TARGETS.falseAlarmsPerMb.logs}**`))
})

test('every row of the table has a number in bold, and the table holds no more rows than there are targets', () => {
  const rows = table.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| What') && !l.startsWith('|---'))
  assert.equal(rows.length, 8)
  for (const r of rows) assert.match(r, /\*\*[\d,.]+/)
})

test('the file says what the numbers are not, and that the log set was written by the tuner', () => {
  assert.match(doc, /written by the same person who tuned the checker/)
  assert.match(doc, /One computer/)
})

test('it holds no secret, not even a fake one written whole', () => {
  assert.ok(!/ghp_[A-Za-z0-9]{20}|AKIA[A-Z0-9]{12}|sk_live_/.test(doc))
})
