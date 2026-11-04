// The tested-versions list (spec §4, §20, R-01). The CLI's pinned version (2.1.317), the earlier pin 2.1.316,
// the VS Code extension's own copy of Claude Code (check 0.10), and the `stable` channel's 2.1.309 (the full kit, step 6).

export const TESTED_VERSIONS: readonly string[] = ['2.1.317', '2.1.316', '2.1.314', '2.1.309']

export const isTested = (version: string): boolean => TESTED_VERSIONS.includes(version)

export function versionWarning(version: string): string | undefined {
  if (isTested(version)) return undefined
  return `Claude Code ${version.slice(0, 32)} is not on the tested list (${TESTED_VERSIONS.join(', ')}); it keeps working, but check it with /redact self-check.`
}

/** How many session starts with one untested version show the warning (R-01, D-103). Doctor says it every time. */
export const WARN_SESSIONS = 2
const MAX_KEPT = 20

/** Untested versions already warned about, oldest first, each with how many session starts showed it. */
export type Warned = [string, number][]

function readWarned(stored: unknown): Warned {
  if (!Array.isArray(stored)) return []
  return stored.filter((e): e is [string, number] =>
    Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && Number.isInteger(e[1]) && (e[1] as number) >= 0)
}

/**
 * The warning for this session start, if it is still due, and the record to keep for the next. A tested version
 * never warns and leaves the record as it was. A damaged record counts as empty, so it errs toward warning.
 */
export function nextWarning(version: string, stored: unknown): { line?: string; warned: Warned } {
  const warned = readWarned(stored)
  const line = versionWarning(version)
  if (!line) return { warned }
  const key = version.slice(0, 32)
  const seen = warned.find(e => e[0] === key)?.[1] ?? 0
  if (seen >= WARN_SESSIONS) return { warned }
  const next: Warned = [...warned.filter(e => e[0] !== key), [key, seen + 1]]
  return { line, warned: next.slice(-MAX_KEPT) }
}
