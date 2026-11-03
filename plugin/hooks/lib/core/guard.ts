// The overwrite guard and the placeholder notice (spec §10, R-11). Claude only saw the redacted file,
// so rewriting it can swap a real secret for its placeholder and lose the secret. A real value is
// never put back; the change is refused instead.

import { findPlaceholders } from './placeholder.ts'
import type { Redacted, RedactTextOptions } from './session.ts'

/** What the guard needs of a Redactor. */
export type GuardRedactor = {
  redactText(text: string, o: RedactTextOptions): Redacted
  valueOfTag(tag: string): string | undefined
}

/**
 * The file's text after an Edit, or undefined when `old` isn't in it (the Edit then fails by itself). Claude Code
 * matches a CRLF file as LF and keeps CRLF when it saves (2.1.316, measured), so that is tried after an exact match.
 */
export function applyEdit(disk: string, old: string, next: string, all: boolean): string | undefined {
  if (old === '') return undefined
  const swap = (text: string): string => (all ? text.split(old).join(next) : text.replace(old, () => next))
  if (disk.includes(old)) return swap(disk)
  if (!disk.includes('\r\n')) return undefined
  const lf = disk.replace(/\r\n/g, '\n')
  return lf.includes(old) ? swap(lf).replace(/\r?\n/g, '\r\n') : undefined
}

export type PlaceholderAt = { line: number; tag: string; label: string }

const parts = (text: string): { label: string; tag: string } => ({
  label: (/^\[REDACTED:([A-Z0-9_]+)/.exec(text) as RegExpExecArray)[1] as string,
  tag: (/#([a-z2-7]{13})\]$/.exec(text) as RegExpExecArray)[1] as string,
})

/** Each placeholder in the text, with its line, counted from 1. */
export function placeholdersIn(text: string): PlaceholderAt[] {
  const out: PlaceholderAt[] = []
  let line = 1
  let at = 0
  for (const [s, e] of findPlaceholders(text)) {
    for (let i = text.indexOf('\n', at); i >= 0 && i < s; i = text.indexOf('\n', i + 1)) line++
    at = s
    out.push({ line, ...parts(text.slice(s, e)) })
  }
  return out
}

export type OverwriteCheck = { path: string; disk: string; after: string; deadline: number }
export type OverwriteResult = { blocked: boolean; tags: string[]; complete: boolean }

/**
 * A value as the file holds it, whatever view it was seen through: a Read numbers each line, so a multi-line value
 * seen there holds `\n     6→` (or a tab) where the file has `\n`. Line endings are left out on both sides.
 */
const asOnDisk = (value: string): string => value.replace(/\r/g, '').replace(/\n[ \t]*\d+[→\t]/g, '\n')

/**
 * Blocked when a secret in the file on disk is gone from the new text and its placeholder is there.
 * A placeholder this session has no value for may come from an earlier session: same kind counts.
 * A placeholder it knows counts when its value is the lost one seen through a Read (spec §10, R-11).
 */
export function checkOverwrite(r: GuardRedactor, c: OverwriteCheck): OverwriteResult {
  const scan = r.redactText(c.disk, { file: c.path, deadline: c.deadline })
  const secrets = scan.hits.filter(h => h.action !== 'warn')
  if (secrets.length === 0) return { blocked: false, tags: [], complete: scan.complete }
  const lost = new Map<string, { label: string; value: string | undefined }>()
  for (const h of secrets) {
    const value = r.valueOfTag(h.tag)
    if (value === undefined || !c.after.includes(value)) lost.set(h.tag, { label: h.label, value })
  }
  const labels = new Set([...lost.values()].map(l => l.label))
  const tags = new Set<string>()
  for (const p of placeholdersIn(c.after)) {
    if (lost.has(p.tag)) {
      tags.add(p.tag)
      continue
    }
    const known = r.valueOfTag(p.tag)
    if (known === undefined) {
      if (labels.has(p.label) && !c.disk.includes(`#${p.tag}]`)) for (const [tag, l] of lost) if (l.label === p.label) tags.add(tag)
    } else if (known.includes('\n')) {
      const seen = asOnDisk(known)
      for (const [tag, l] of lost) if (l.value !== undefined && l.value.includes('\n') && asOnDisk(l.value) === seen) tags.add(tag)
    }
  }
  return { blocked: tags.size > 0, tags: [...tags], complete: scan.complete }
}
