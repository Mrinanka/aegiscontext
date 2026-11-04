// The checker: text in, positions of secrets out. One keyword pass over the whole
// text, then each rule runs only near its keyword hits, in pieces of bounded size,
// inside a time budget. Imports nothing from Node, so it runs in the mod too.

import { Aho } from './aho.ts'
import { convertCustom, type CustomRuleInput } from './convert.ts'
import { shannon } from './entropy.ts'
import { checkAuthHeader, checkBearer, checkCommandPassword } from './credentials.ts'
import { checkLabel, checkUrlPassword, LABELS, type LabelDef } from './labels.ts'
import { scanPersonal } from './personal.ts'
import { checkTruncatedKey } from './private-key.ts'
import { OWN_RULES } from './own-rules.generated.ts'
import { GLOBAL_ALLOW, RULES } from './rules.generated.ts'
import type { Action, AllowList, CompiledRule, Finding, RegexSpec, Rejection, ScanResult } from './types.ts'

export const LABEL_RULE_ID = 'password-label'
export const URL_RULE_ID = 'url-password'
export const TRUNCATED_KEY_RULE_ID = 'private-key-truncated'
export const EMAIL_RULE_ID = 'personal-email'
export const PHONE_RULE_ID = 'personal-phone'

export type CheckerOptions = {
  /** Rule ids to turn off. */
  off?: string[]
  /** Per-rule action; the default is hide. */
  actions?: Record<string, Action>
  custom?: CustomRuleInput[]
  /** Also find email addresses and phone numbers (rule ids personal-email and personal-phone). Off by default (D-037). */
  personalData?: boolean
  /** Time budget for one scan; the default is 4000. */
  budgetMs?: number
  /** For tests: act as an engine without the `d` regex flag. */
  noIndices?: boolean
}

export type ScanOptions = {
  /** The file the text came from, if known (path conditions and source-file rules use it). */
  file?: string
  /** Time budget for this scan, in place of the checker's own. Lets several layers share one deadline. */
  budgetMs?: number
}

export type Checker = {
  scan(text: string, options?: ScanOptions): ScanResult
  /** Does nothing. A repeated-line memory used to be forgotten here; step 5 removed it because it gained no speed (spec §18). Kept so callers need no change. */
  clearLines(): void
  readonly ruleCount: number
}

const PIECE = 65_536
const DEFAULT_BUDGET_MS = 4000
/** One rule may use this share of the budget, so a slow rule can't stop the rest running. */
const RULE_SHARE = 4

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const HAS_INDICES = (() => {
  try {
    new RegExp('', 'd')
    return true
  } catch {
    return false
  }
})()

type Runtime = {
  rule: CompiledRule
  kind: Finding['kind']
  action: Action
  re: RegExp | null
  pathRe: RegExp | undefined
  leadingRe: RegExp | undefined
}

const plainCache = new Map<string, RegExp>()
function plain(spec: RegexSpec): RegExp {
  const key = `${spec.flags}/${spec.source}`
  let re = plainCache.get(key)
  if (!re) {
    re = new RegExp(spec.source, spec.flags)
    plainCache.set(key, re)
  }
  return re
}

type Raw = { start: number; end: number; ruleId: string; label: string; kind: Finding['kind']; action: Action; showHint: boolean; rank: number }

const ACTION_RANK: Record<Action, number> = { warn: 0, hide: 1, block: 2 }

function merge(raws: Raw[]): Finding[] {
  const sorted = raws.filter(r => r.end > r.start).sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Finding[] = []
  let group: Raw[] = []
  let groupEnd = -1
  const flush = (): void => {
    if (group.length === 0) return
    // A specific format beats a generic one, and a generic one beats a label; then the longest span wins.
    // Plain loops: a group can hold hundreds of thousands of findings, too many to spread.
    let best = group[0] as Raw
    let action = best.action
    let start = best.start
    let showHint = true
    for (const g of group) {
      if (g.rank < best.rank || (g.rank === best.rank && g.end - g.start > best.end - best.start)) best = g
      if (ACTION_RANK[g.action] > ACTION_RANK[action]) action = g.action
      if (g.start < start) start = g.start
      if (!g.showHint) showHint = false
    }
    out.push({ start, end: groupEnd, ruleId: best.ruleId, label: best.label, kind: best.kind, action, showHint })
    group = []
  }
  for (const r of sorted) {
    if (group.length > 0 && r.start >= groupEnd) flush()
    group.push(r)
    groupEnd = group.length === 1 ? r.end : Math.max(groupEnd, r.end)
  }
  flush()
  return out
}

function allowed(a: AllowList, secret: string, matchText: string, line: string): boolean {
  if (secret === '') return false
  const target = a.target === 'match' ? matchText : a.target === 'line' ? line : secret
  const regexAllowed = a.regexes.length > 0 && a.regexes.some(r => plain(r).test(target))
  let stopAllowed = false
  if (a.stopwords.length > 0) {
    const lower = secret.toLowerCase()
    stopAllowed = a.stopwords.some(w => lower.includes(w))
  }
  if (a.and) {
    const checks: boolean[] = []
    if (a.regexes.length > 0) checks.push(regexAllowed)
    if (a.stopwords.length > 0) checks.push(stopAllowed)
    return checks.length > 0 && checks.every(Boolean)
  }
  return regexAllowed || stopAllowed
}

/** Whether `word`, as a whole word, ends within `within` characters before `at`. */
function wordBefore(text: string, word: string, within: number, at: number): boolean {
  const low = at - within - word.length
  for (let k = text.lastIndexOf(word, at - word.length); k >= 0 && k >= low; k = k === 0 ? -1 : text.lastIndexOf(word, k - 1)) {
    const before = k === 0 ? 0x20 : text.charCodeAt(k - 1)
    const after = text.charCodeAt(k + word.length)
    if (!isWordChar(before) && !isWordChar(after)) return true
  }
  return false
}

const isWordChar = (c: number): boolean => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f

type Handler =
  | { t: 'rule'; index: number }
  | { t: 'label'; def: LabelDef }
  | { t: 'url' }
  | { t: 'pkey' }
  | { t: 'auth' }
  | { t: 'bearer' }
  | { t: 'command' }

export function createChecker(options: CheckerOptions = {}): { checker: Checker; errors: Rejection[] } {
  const off = new Set(options.off ?? [])
  const actions = options.actions ?? {}
  const defaultBudget = options.budgetMs ?? DEFAULT_BUDGET_MS
  const useIndices = HAS_INDICES && !options.noIndices
  const errors: Rejection[] = []
  const runtimes: Runtime[] = []
  // Own keys only: `constructor` is a valid rule id, and a plain lookup of it finds a function.
  const actionOf = (id: string): Action => (Object.hasOwn(actions, id) ? (actions[id] as Action) : 'hide')

  // The Gitleaks rules, then AegisContext's own for keys Gitleaks lacks (D-105): same kind, same switches.
  for (const rule of [...RULES, ...OWN_RULES]) {
    if (off.has(rule.id)) continue
    runtimes.push({ rule, kind: 'format', action: actionOf(rule.id), re: null, pathRe: undefined, leadingRe: undefined })
  }
  for (const c of options.custom ?? []) {
    if (off.has(c.id)) continue
    let result
    try {
      result = convertCustom(c)
    } catch {
      errors.push({ id: c.id, reason: 'the pattern could not be converted' })
      continue
    }
    if ('rejection' in result) errors.push(result.rejection)
    else runtimes.push({ rule: result.rule, kind: 'custom', action: actionOf(c.id), re: null, pathRe: undefined, leadingRe: undefined })
  }

  // One automaton for every keyword: rule keywords, label words, "://" and the key header.
  const words: string[] = []
  const handlers: Handler[][] = []
  const wordIndex = new Map<string, number>()
  const addWord = (w: string, h: Handler): void => {
    const key = w.toLowerCase()
    let i = wordIndex.get(key)
    if (i === undefined) {
      i = words.length
      words.push(key)
      handlers.push([])
      wordIndex.set(key, i)
    }
    ;(handlers[i] as Handler[]).push(h)
  }
  runtimes.forEach((rt, index) => rt.rule.keywords.forEach(k => addWord(k, { t: 'rule', index })))
  const labelsOn = !off.has(LABEL_RULE_ID)
  const urlOn = !off.has(URL_RULE_ID)
  const keyOn = !off.has(TRUNCATED_KEY_RULE_ID)
  const emailOn = options.personalData === true && !off.has(EMAIL_RULE_ID)
  const phoneOn = options.personalData === true && !off.has(PHONE_RULE_ID)
  if (labelsOn) {
    for (const def of LABELS) addWord(def.word, { t: 'label', def })
    addWord('authorization', { t: 'auth' })
    addWord('bearer', { t: 'bearer' })
    for (const w of ['mysql', 'mariadb', 'sshpass']) addWord(w, { t: 'command' })
  }
  if (urlOn) addWord('://', { t: 'url' })
  if (keyOn) addWord('private key', { t: 'pkey' })
  const aho = new Aho(words)

  function engine(rt: Runtime): RegExp {
    if (!rt.re) rt.re = new RegExp(rt.rule.source, `${rt.rule.flags}g${useIndices ? 'd' : ''}`)
    return rt.re
  }

  function pathAllows(rt: Runtime, file: string | undefined): boolean {
    if (!rt.rule.path || file === undefined) return true
    if (rt.pathRe === undefined) rt.pathRe = new RegExp(rt.rule.path.source, rt.rule.path.flags)
    return rt.pathRe.test(file.replace(/\\/g, '/'))
  }

  function leadingStart(rt: Runtime, text: string, start: number): number {
    const lead = rt.rule.leadingContext
    if (!lead) return start
    if (rt.leadingRe === undefined) rt.leadingRe = new RegExp(lead.set.source, lead.set.flags)
    let s = start
    while (s > 0 && start - s < lead.max && (rt.leadingRe as RegExp).test(text[s - 1] as string)) s--
    return s
  }

  function runRule(rt: Runtime, text: string, from: number, to: number, out: Raw[]): void {
    const re = engine(rt)
    const slice = text.slice(from, to)
    re.lastIndex = 0
    const rule = rt.rule
    let m: RegExpExecArray | null
    while ((m = re.exec(slice)) !== null) {
      if (m[0].length === 0) re.lastIndex++
      // The secret: the chosen group, else the first non-empty group, else the whole match.
      let g = 0
      if (m.length > 1) {
        if (rule.secretGroup > 0) {
          if (!m[rule.secretGroup]) continue
          g = rule.secretGroup
        } else {
          for (let k = 1; k < m.length; k++) {
            if (m[k]) {
              g = k
              break
            }
          }
        }
      }
      const matchStart = from + m.index
      if (rule.requiresBefore && !wordBefore(text, rule.requiresBefore.word, rule.requiresBefore.within, matchStart)) continue
      const spans: [number, number][] = []
      if (g === 0) {
        let s = matchStart
        let e = matchStart + m[0].length
        while (s < e && text.charCodeAt(s) === 0x0a) s++
        while (e > s && text.charCodeAt(e - 1) === 0x0a) e--
        spans.push([s, e])
      } else if (useIndices) {
        const ix = (m as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices?.[g]
        if (!ix) continue
        spans.push([from + ix[0], from + ix[1]])
      } else {
        // No group positions from the engine: cover every place the group's text occurs in the match.
        const piece = m[g] as string
        for (let at = m[0].indexOf(piece); at >= 0; at = m[0].indexOf(piece, at + 1)) spans.push([matchStart + at, matchStart + at + piece.length])
      }
      for (const [s, e] of spans) {
        const secret = text.slice(s, e)
        if (rule.entropy !== undefined && shannon(secret) <= rule.entropy) continue
        const mStart = leadingStart(rt, text, matchStart)
        const matchText = text.slice(mStart, matchStart + m[0].length).replace(/^\n+|\n+$/g, '')
        let line: string | null = null
        const getLine = (): string => {
          if (line === null) {
            // The line around the match, looked for within 2000 characters each way (never the whole text).
            let ls = mStart
            while (ls > 0 && mStart - ls < 2000 && text.charCodeAt(ls - 1) !== 0x0a) ls--
            const after = matchStart + m![0].length
            let le = after
            while (le < text.length && le - after < 2000 && text.charCodeAt(le) !== 0x0a) le++
            line = text.slice(ls, le)
          }
          return line
        }
        const lazyLine = rule.allow.concat(GLOBAL_ALLOW).some(a => a.target === 'line') ? getLine() : ''
        if (allowed(GLOBAL_ALLOW, secret, matchText, lazyLine)) continue
        if (rule.allow.some(a => allowed(a, secret, matchText, lazyLine))) continue
        out.push({ start: s, end: e, ruleId: rule.id, label: rule.label, kind: rt.kind, action: rt.action, showHint: true, rank: rule.id.includes('generic') ? 1 : 0 })
      }
    }
  }

  function scan(text: string, scanOptions: ScanOptions = {}): ScanResult {
    const t0 = now()
    if (text.length === 0) return { findings: [], complete: true }
    const file = scanOptions.file
    const raws: Raw[] = []
    // Areas to search for each rule, as [start, end] pairs, merged as they grow.
    const areas = new Map<number, number[]>()
    let lineStart = -1
    let lineEnd = -1
    let claimedTo = 0 // label values already covered up to here
    let keyTo = 0 // truncated key scanned up to here

    aho.search(text, (w, end) => {
      if (end > lineEnd || end - 1 < lineStart) {
        lineStart = text.lastIndexOf('\n', end - 1) + 1
        const nl = text.indexOf('\n', end - 1)
        lineEnd = nl < 0 ? text.length : nl
      }
      const wordLen = (words[w] as string).length
      const start = end - wordLen
      for (const h of handlers[w] as Handler[]) {
        switch (h.t) {
          case 'rule': {
            const rt = runtimes[h.index] as Runtime
            if (!pathAllows(rt, file)) break
            const s = Math.max(0, start - rt.rule.area)
            const e = Math.min(text.length, end + rt.rule.area)
            let list = areas.get(h.index)
            if (!list) areas.set(h.index, (list = []))
            if (list.length > 0 && s <= (list[list.length - 1] as number)) {
              if (e > (list[list.length - 1] as number)) list[list.length - 1] = e
            } else list.push(s, e)
            break
          }
          case 'label': {
            if (start < claimedTo) break
            const v = checkLabel(text, start, end, h.def, file, lineEnd)
            if (!v) break
            if (v.readTo > claimedTo) claimedTo = v.readTo
            if (v.end > v.start) {
              raws.push({ start: v.start, end: v.end, ruleId: LABEL_RULE_ID, label: 'PASSWORD', kind: 'label', action: actionOf(LABEL_RULE_ID), showHint: false, rank: 2 })
            }
            break
          }
          case 'auth':
          case 'bearer': {
            const v = h.t === 'auth' ? checkAuthHeader(text, end, lineEnd) : checkBearer(text, start, end, lineEnd)
            if (v) raws.push({ start: v.start, end: v.end, ruleId: LABEL_RULE_ID, label: 'AUTH_TOKEN', kind: 'label', action: actionOf(LABEL_RULE_ID), showHint: false, rank: 2 })
            break
          }
          case 'command': {
            const v = checkCommandPassword(text, start, end, lineEnd)
            if (v) raws.push({ start: v.start, end: v.end, ruleId: LABEL_RULE_ID, label: 'PASSWORD', kind: 'label', action: actionOf(LABEL_RULE_ID), showHint: false, rank: 2 })
            break
          }
          case 'url': {
            const v = checkUrlPassword(text, end)
            if (v) raws.push({ start: v.start, end: v.end, ruleId: URL_RULE_ID, label: 'URL_PASSWORD', kind: 'label', action: actionOf(URL_RULE_ID), showHint: false, rank: 2 })
            break
          }
          case 'pkey': {
            if (start < keyTo) break
            const v = checkTruncatedKey(text, start, end)
            if (v) {
              keyTo = v.end
              raws.push({ start: v.start, end: v.end, ruleId: TRUNCATED_KEY_RULE_ID, label: 'PRIVATE_KEY', kind: 'format', action: actionOf(TRUNCATED_KEY_RULE_ID), showHint: false, rank: 1 })
            }
            break
          }
        }
      }
    })

    if (emailOn || phoneOn) {
      for (const p of scanPersonal(text, { email: emailOn, phone: phoneOn })) {
        const email = p.kind === 'email'
        raws.push({ start: p.start, end: p.end, ruleId: email ? EMAIL_RULE_ID : PHONE_RULE_ID, label: email ? 'EMAIL' : 'PHONE', kind: 'format', action: actionOf(email ? EMAIL_RULE_ID : PHONE_RULE_ID), showHint: false, rank: 1 })
      }
    }

    let complete = true
    const budget = scanOptions.budgetMs ?? defaultBudget
    const share = budget / RULE_SHARE
    outer: for (const [index, list] of [...areas].sort((a, b) => a[0] - b[0])) {
      const rt = runtimes[index] as Runtime
      const overlap = Math.min(rt.rule.area, PIECE >> 1)
      const ruleStart = now()
      for (let k = 0; k < list.length; k += 2) {
        let from = list[k] as number
        const to = list[k + 1] as number
        for (;;) {
          const at = now()
          if (at - t0 >= budget) {
            complete = false
            break outer
          }
          if (at - ruleStart >= share) {
            complete = false
            continue outer
          }
          const pieceEnd = Math.min(to, from + PIECE)
          runRule(rt, text, from, pieceEnd, raws)
          if (pieceEnd >= to) break
          from = pieceEnd - overlap
        }
      }
    }

    return { findings: merge(raws), complete }
  }

  const checker: Checker = { scan, clearLines: () => undefined, ruleCount: runtimes.length }
  return { checker, errors }
}
