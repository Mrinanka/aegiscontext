// Visible warnings (R-12). A failure always says so on screen and in the log; the same kind repeated
// is thrown at the person only a few times, then now and then, so a slow file doesn't bury the screen.
// The text never holds content.

import type { EngineInterface } from 'claude-code'

const counts = new Map<string, number>()

export function warn($: EngineInterface, kind: string, text: string): void {
  const n = (counts.get(kind) ?? 0) + 1
  counts.set(kind, n)
  if (n > 3 && n % 50 !== 0) return
  const line = `${text}${n > 3 ? ` (${n} times this session)` : ''}`
  try {
    $.ui.log(line)
    $.ui.toast(line)
  } catch {
    // Showing a warning must never stop a row being stored.
  }
}

export function resetWarnings(): void {
  counts.clear()
}
