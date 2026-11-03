// Step 0 "Done when" (docs/engineering/plan.md, "The 7 steps"): every kept check has a
// result in findings-step0.md, findings are applied to the spec, and no
// [Step 0] item is left. Red until step 0 is finished, by design.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8')

type Row = { id: string; cells: string[] }

// Table rows whose first cell is a check id like 0.1 or ~~0.12~~.
function checkRows(markdown: string): Row[] {
  return markdown
    .split('\n')
    .filter(line => /^\|\s*(~~)?0\.\d+/.test(line))
    .map(line => {
      const cells = line.split('|').slice(1, -1).map(c => c.trim())
      return { id: (cells[0] ?? '').replace(/~/g, ''), cells }
    })
}

const FINDINGS_COLUMNS = ['Check', 'Question', 'Result', 'Version', 'OS', 'Surface', 'Method', 'Evidence', 'Spec impact']

test('every check in the plan has a row in findings-step0.md', () => {
  const planned = checkRows(read('docs', 'engineering', 'plan.md')).map(r => r.id)
  const found = checkRows(read('docs', 'engineering', 'findings-step0.md')).map(r => r.id)
  assert.ok(planned.length >= 14, 'plan lists checks 0.1 to 0.14')
  assert.deepEqual(found, planned)
})

test('no kept check is still pending', () => {
  const pending = checkRows(read('docs', 'engineering', 'findings-step0.md'))
    .filter(r => r.cells[FINDINGS_COLUMNS.indexOf('Result')] === 'pending')
    .map(r => r.id)
  assert.deepEqual(pending, [])
})

test('every result row has a version, OS, surface, method and evidence', () => {
  const rows = checkRows(read('docs', 'engineering', 'findings-step0.md'))
  const missing: string[] = []
  for (const r of rows) {
    const result = r.cells[FINDINGS_COLUMNS.indexOf('Result')] ?? ''
    if (result.startsWith('parked')) continue
    assert.match(result, /^(yes|no|partly)\b/, `${r.id}: result is yes, no or partly`)
    for (const col of ['Version', 'OS', 'Surface', 'Method', 'Evidence', 'Spec impact']) {
      if ((r.cells[FINDINGS_COLUMNS.indexOf(col)] ?? '') === '') missing.push(`${r.id}: ${col}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('the spec has no [Step 0] item left', () => {
  const lines = read('docs', 'engineering', 'spec.md').split('\n').filter(l => l.includes('[Step 0]'))
  assert.deepEqual(lines, [])
})

test('no canary from a step 0 run is written in docs/', () => {
  const dir = path.join(root, 'docs')
  // Every .md under docs/, the engineering record in docs/engineering/ included.
  const files = (fs.readdirSync(dir, { recursive: true }) as string[]).filter(f => f.endsWith('.md'))
  assert.ok(files.some(f => f.includes('engineering')), 'the scan did not reach docs/engineering/')
  const hits = files.filter(f => /CANARY-[0-9a-f]{8,}/.test(fs.readFileSync(path.join(dir, f), 'utf8')))
  assert.deepEqual(hits, [])
})
