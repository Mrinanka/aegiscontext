// Claude Code draws `$.ui.log` and `$.ui.toast` lines under the plugin's name (claude-code.d.ts, `plugin.name` and
// `ui.toast`), so a line that starts with the name shows it twice. Text the engine shows with no name (a deny, a drop,
// a dialog) keeps its own, and so does the banner, which is the plugin's own pane.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const hooks = path.join(import.meta.dirname, '..', 'plugin', 'hooks')
const sources = fs.readdirSync(hooks).filter(f => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))

test('no $.ui.log or $.ui.toast text in the hooks starts with the plugin name', () => {
  assert.ok(sources.length > 5, 'the hooks folder was not read')
  for (const f of sources) {
    const text = fs.readFileSync(path.join(hooks, f), 'utf8')
    const bad = text.match(/\$\.ui\.(?:log|toast)\([^\n]*aegiscontext: |\$\.ui\.(?:log|toast)\(\s*`aegiscontext: /)
    assert.equal(bad, null, `${f}: ${bad?.[0] ?? ''}`)
  }
})

test('warn() adds no name of its own', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(hooks, 'warn.ts'), 'utf8'), /aegiscontext: /)
})
