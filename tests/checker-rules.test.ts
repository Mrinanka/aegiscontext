// The converted Gitleaks rules: the vendored file, the generated data, and one set
// of tests per rule (a sample built from its own pattern is found, a near miss is
// not, the worst case finishes, a rejected rule says why).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createChecker, LABEL_RULE_ID, TRUNCATED_KEY_RULE_ID, URL_RULE_ID } from '../src/checker/index.ts'
import { ruleSource, toSpec } from '../src/checker/convert.ts'
import { parse } from '../src/checker/re/parse.ts'
import { OWN_RULES } from '../src/checker/own-rules.generated.ts'
import { REJECTIONS, RULES, BUILD_WARNINGS, GITLEAKS_COMMIT, GITLEAKS_VERSION, GLOBAL_ALLOW } from '../src/checker/rules.generated.ts'
import { expected, TOML_PATH } from '../tools/rules/build.ts'
import { parseToml } from '../tools/rules/toml.ts'
import { rng, sample } from '../tools/rules/sample.ts'
import { falseAlarmFiles } from '../tools/test-sets/false-alarm.ts'
import type { RawRule } from '../src/checker/types.ts'

const root = path.join(import.meta.dirname, '..')
const tomlText = fs.readFileSync(TOML_PATH, 'utf8')
const raws = parseToml(tomlText).rules as unknown as RawRule[]
const INTERNAL = [LABEL_RULE_ID, URL_RULE_ID, TRUNCATED_KEY_RULE_ID]

// The upstream file at this commit has SHA-256 e163e53b…329caf. Ours lacks the
// gcp-api-key allowlist, whose 16 entries are whole key-shaped strings (D-039).
test('the vendored Gitleaks file is the pinned one', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(TOML_PATH)).digest('hex')
  assert.equal(sha, '82578aef8999fdb3d55c58745ba49d195fd3fad01e8309f0be76823e91b9b3ab')
  assert.equal(GITLEAKS_VERSION, 'v8.30.1')
  assert.equal(GITLEAKS_COMMIT, '83d9cd684c87d95d656c1458ef04895a7f1cbd8e')
  assert.ok(fs.existsSync(path.join(root, 'third_party', 'gitleaks', 'LICENSE')))
})

test('the generated rules are current (npm run rules:build)', () => {
  const have = fs.readFileSync(path.join(root, 'src', 'checker', 'rules.generated.ts'), 'utf8')
  assert.equal(have, expected())
})

test('converted plus rejected is all 222 rules, and every rejection has a reason', () => {
  assert.equal(raws.length, 222)
  assert.equal(RULES.length + REJECTIONS.length, 222)
  const ids = new Set([...RULES.map(r => r.id), ...REJECTIONS.map(r => r.id)])
  assert.equal(ids.size, 222)
  for (const r of REJECTIONS) assert.ok(r.reason.length > 10, r.id)
})

test('the rejected rules are the known ones, with the reasons that were reviewed', () => {
  assert.deepEqual(
    REJECTIONS.map(r => r.id),
    ['facebook-access-token', 'kubernetes-secret-yaml', 'pkcs12-file'],
  )
  const why = Object.fromEntries(REJECTIONS.map(r => [r.id, r.reason]))
  assert.match(why['pkcs12-file'] as string, /file name/)
  assert.match(why['facebook-access-token'] as string, /literal/)
  assert.match(why['kubernetes-secret-yaml'] as string, /too high/)
})

test('a rejection or warning never carries pattern text', () => {
  const patterns = raws.map(r => r.regex).filter((r): r is string => !!r)
  for (const text of [...REJECTIONS.map(r => r.reason), ...BUILD_WARNINGS]) {
    for (const p of patterns) assert.ok(!text.includes(p.slice(0, 12)), text)
  }
})

test('every rule has keywords of 2 or more characters, lowercase, and a bounded area', () => {
  for (const r of RULES) {
    assert.ok(r.keywords.length > 0, r.id)
    for (const k of r.keywords) {
      assert.ok(k.length >= 2, `${r.id}: ${k}`)
      assert.equal(k, k.toLowerCase(), r.id)
    }
    assert.ok(r.area > 0 && r.area <= 2 * 16384 + 100, `${r.id}: ${r.area}`)
  }
})

test('derived keywords: each difference from Gitleaks is classified, and the count is pinned', () => {
  const counts: Record<string, number> = {}
  for (const r of RULES) counts[r.keywordNote ?? 'none'] = (counts[r.keywordNote ?? 'none'] ?? 0) + 1
  const allowed = new Set(['same', 'derived longer', 'overlapping', 'upstream keyword not in the pattern', 'none upstream'])
  for (const k of Object.keys(counts)) assert.ok(allowed.has(k), k)
  // Pinned so that a changed conversion shows up in review.
  assert.deepEqual(counts, EXPECTED_NOTES, JSON.stringify(counts))
})
const EXPECTED_NOTES: Record<string, number> = { same: 162, 'derived longer': 34, overlapping: 10, 'upstream keyword not in the pattern': 13 }

test('the global true|false|null allowlist is anchored: a value merely holding "false" is not skipped', () => {
  const first = GLOBAL_ALLOW.regexes[0] as { source: string; flags: string }
  const re = new RegExp(first.source, first.flags)
  for (const v of ['true', 'FALSE', 'null']) assert.equal(re.test(v), true, v)
  const holder = 'zq7' + 'Xk2' + 'false' + 'Pm9Wd4Rt8'
  assert.equal(re.test(holder), false)
  assert.equal(re.test('nullable'), false)
})

// ---- one set of tests per rule ----------------------------------------------------------

const others = (id: string): string[] => [...RULES.map(r => r.id).filter(x => x !== id), ...OWN_RULES.map(r => r.id), ...INTERNAL]
const MAX_TRIES = 120

for (const rule of RULES) {
  const raw = raws.find(r => r.id === rule.id) as RawRule
  const tree = parse(ruleSource(raw) as string)

  test(`rule ${rule.id}: a sample from its own pattern is found; a near miss is not; the worst case is quick`, () => {
    const { checker } = createChecker({ off: others(rule.id) })
    assert.equal(checker.ruleCount, 1)
    const r = rng(Array.from(rule.id).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7))
    // Found, through the whole scan (keywords and area included).
    let found = false
    for (let i = 0; i < MAX_TRIES && !found; i++) {
      const s = sample(tree.node, r, 4 + (i % 12))
      const lead = rule.requiresBefore ? `${rule.requiresBefore.word} ` : ''
      for (const text of [s, `${lead}x ${s} y\n`, `${lead}${rule.keywords[0]} ${s}\n`, `${lead}line one\n${s}\nline three\n`]) {
        const res = checker.scan(text)
        if (res.findings.some(f => f.ruleId === rule.id)) {
          found = true
          break
        }
      }
      checker.clearLines()
    }
    assert.ok(found, `no sample of ${rule.id} was found in ${MAX_TRIES} tries`)

    // A near miss: the keyword and a few ordinary characters are not a match.
    for (const k of rule.keywords) {
      const res = checker.scan(`${k} ok\nplain words only\n`)
      assert.deepEqual(res.findings, [], `${rule.id}: ${k}`)
    }

    // Worst case: 100 KB built to make the engine work, in each of three shapes.
    const kw = rule.keywords[0] as string
    const dropped = sample(tree.node, rng(99), 8)
    const inputs = [
      `${kw} `.repeat(Math.ceil(100_000 / (kw.length + 1))),
      `${kw}${'a'.repeat(100_000)}`,
      dropped.slice(0, -1).repeat(Math.ceil(100_000 / Math.max(1, dropped.length - 1))),
      `${kw}${' '.repeat(100_000)}x`,
      `${kw}${'='.repeat(100_000)}`,
    ]
    for (const [n, text] of inputs.entries()) {
      checker.clearLines()
      const t0 = performance.now()
      const res = checker.scan(text.slice(0, 100_000))
      const ms = performance.now() - t0
      assert.ok(ms < 1500, `${rule.id}: worst-case input ${n} took ${Math.round(ms)} ms`)
      assert.equal(res.complete, true, `${rule.id}: input ${n} ran out of budget`)
    }
  })
}

for (const rj of REJECTIONS) {
  test(`rejected rule ${rj.id}: says why and is not in the checker`, () => {
    assert.ok(rj.reason.length > 0)
    assert.ok(!RULES.some(r => r.id === rj.id))
  })
}

// ---- the rewritten rules find what a plain translation finds --------------------------------

test('differential: dropping the leading prefix finds the same secrets as keeping it', () => {
  const files = falseAlarmFiles(root).slice(0, 60)
  const corpus = files.map(f => fs.readFileSync(f.file, 'utf8'))
  let compared = 0
  for (const rule of RULES.filter(r => r.leadingContext)) {
    const raw = raws.find(r => r.id === rule.id) as RawRule
    const plain = toSpec(ruleSource(raw) as string)
    const dropped = new RegExp(rule.source, `${rule.flags}g`)
    const full = new RegExp(plain.source, `${plain.flags}g`)
    const tree = parse(ruleSource(raw) as string)
    const r = rng(5)
    const texts = [...Array.from({ length: 30 }, () => `a ${sample(tree.node, r, 6)} b\n`), ...corpus.filter(t => rule.keywords.some(k => t.toLowerCase().includes(k)))]
    const groupOf = (m: RegExpExecArray): string | undefined => (rule.secretGroup > 0 ? m[rule.secretGroup] : (m.slice(1).find(x => x) ?? m[0]))
    for (const t of texts) {
      const a = [...t.matchAll(dropped)].map(m => groupOf(m))
      const b = [...t.matchAll(full)].map(m => groupOf(m))
      assert.deepEqual(a, b, `${rule.id} differs`)
      compared++
    }
  }
  assert.ok(compared > 100, `${compared}`)
})
