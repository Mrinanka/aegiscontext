// The rewrite test's scratch mod (step 8, spike S7). It holds no secret: a harmless word stands in.
// It answers three questions about Claude Code, with files in <cwd>/.rw/ as the switches:
//   rewrite  a Write or Edit input has PLACEHOLDER replaced by WORD before the tool runs
//   hide     every row the conversation keeps has WORD replaced by PLACEHOLDER (as the real tool would)
//   (neither switch: the control, so the test can fail)
// It also writes the count of rewritten inputs to <cwd>/.rw/seen.

import type { Register } from 'claude-code'

const WORD = ['rewrite', 'marker', 'zq41'].join('-')
const PLACEHOLDER = ['[REDACTED', 'rw0001]'].join(':')

const swap = (s: string, from: string, to: string): string => s.split(from).join(to)

export const register: Register = on => {
  on('session.append', async ($, e, next) => {
    const dir = (await $.session.cwd()) + '/.rw'
    if (!(await $.fs.exists(dir + '/hide'))) return next(e)
    const message = JSON.parse(swap(JSON.stringify(e.message), WORD, PLACEHOLDER))
    return next({ ...e, message })
  })

  on('tool.call', async ($, e, next) => {
    const dir = (await $.session.cwd()) + '/.rw'
    if (!(await $.fs.exists(dir + '/rewrite')) || (e.tool !== 'Write' && e.tool !== 'Edit')) return next(e)
    const changes: Record<string, unknown> = {}
    for (const key of ['content', 'old_string', 'new_string']) {
      const value = (e as unknown as Record<string, unknown>)[key]
      if (typeof value === 'string' && value.includes(PLACEHOLDER)) changes[key] = swap(value, PLACEHOLDER, WORD)
    }
    await $.fs.write(dir + '/seen', Object.keys(changes).join(','))
    return next({ ...e, ...changes } as typeof e)
  })
}
