// AegisContext's own rules for popular keys that Gitleaks lacks (D-105): built and
// tested like the Gitleaks rules. Fake keys are built from pieces at run time.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createChecker, LABEL_RULE_ID, TRUNCATED_KEY_RULE_ID, URL_RULE_ID } from '../src/checker/index.ts'
import { ruleSource } from '../src/checker/convert.ts'
import { analyze } from '../src/checker/re/analyze.ts'
import { parse } from '../src/checker/re/parse.ts'
import { shannon } from '../src/checker/entropy.ts'
import { RULES } from '../src/checker/rules.generated.ts'
import { OWN_RAW } from '../src/checker/own-rules.ts'
import { OWN_REJECTIONS, OWN_RULES } from '../src/checker/own-rules.generated.ts'
import { expectedOwn, OWN_GENERATED_PATH } from '../tools/rules/build.ts'
import { rng, sample } from '../tools/rules/sample.ts'
import { falseAlarmFiles } from '../tools/test-sets/false-alarm.ts'

const root = path.join(import.meta.dirname, '..')
const INTERNAL = [LABEL_RULE_ID, URL_RULE_ID, TRUNCATED_KEY_RULE_ID]
const GITLEAKS_IDS = RULES.map(r => r.id)
const OWN_IDS = OWN_RULES.map(r => r.id)

// ---- fake key pieces: never a whole key in source ------------------------------------------

const POOL = 'Kq7ZxM2vRb9LdT4wYn8Hc5JsGf6VaE1uNoI0XtDyBrCpPjUeSgFiWhQzAkmlO3'
const HEXPOOL = '3f9a1c7e5b2d8046'
/** n letters/digits, all different while n <= 62. */
const alnum = (n: number, off = 0): string => Array.from({ length: n }, (_, i) => POOL[(off + i * 7) % 62]).join('')
/** n lowercase hex characters, evenly spread. */
const hex = (n: number, off = 0): string => Array.from({ length: n }, (_, i) => HEXPOOL[(off + i * 5) % 16]).join('')

test('the fake-key pools are sound', () => {
  assert.equal(POOL.length, 62)
  assert.equal(new Set(POOL).size, 62)
  assert.equal(HEXPOOL.length, 16)
  assert.equal(new Set(HEXPOOL).size, 16)
})

type Fake = { id: string; key: string; label: string }
const FAKES: Fake[] = [
  { id: 'openrouter-api-key', key: ['sk-or', '-v1-', hex(64, 3)].join(''), label: 'OPENROUTER_API_KEY' },
  { id: 'groq-api-key', key: ['gsk', '_', alnum(52, 5)].join(''), label: 'GROQ_API_KEY' },
  { id: 'xai-api-key', key: ['xai', '-', alnum(60, 9)].join(''), label: 'XAI_API_KEY' },
  { id: 'deepseek-api-key', key: ['sk', '-', hex(32, 7)].join(''), label: 'DEEPSEEK_API_KEY' },
  { id: 'replicate-api-token', key: ['r8', '_', alnum(37, 11)].join(''), label: 'REPLICATE_API_TOKEN' },
  { id: 'fireworks-api-key', key: ['fw', '_', alnum(24, 13)].join(''), label: 'FIREWORKS_API_KEY' },
  { id: 'together-api-key', key: ['tgp', '_v1_', alnum(43, 15), '-', alnum(4, 2)].join(''), label: 'TOGETHER_API_KEY' },
  { id: 'cerebras-api-key', key: ['csk', '-', alnum(48, 17)].join(''), label: 'CEREBRAS_API_KEY' },
  { id: 'elevenlabs-api-key', key: ['sk', '_', hex(48, 9)].join(''), label: 'ELEVENLABS_API_KEY' },
  { id: 'langsmith-api-key', key: ['lsv2', '_pt_', alnum(32, 19), '_', alnum(10, 3)].join(''), label: 'LANGSMITH_API_KEY' },
  { id: 'langfuse-secret-key', key: ['sk', '-lf-', hex(8, 1), '-', hex(4, 2), '-', hex(4, 3), '-', hex(4, 4), '-', hex(12, 5)].join(''), label: 'LANGFUSE_SECRET_KEY' },
  { id: 'pinecone-api-key', key: ['pcsk', '_', alnum(6, 21), '_', alnum(58, 4)].join(''), label: 'PINECONE_API_KEY' },
  { id: 'tavily-api-key', key: ['tvly', '-dev-', alnum(32, 23)].join(''), label: 'TAVILY_API_KEY' },
  { id: 'supabase-access-token', key: ['sbp', '_', hex(40, 11)].join(''), label: 'SUPABASE_ACCESS_TOKEN' },
  { id: 'supabase-secret-key', key: ['sb_', 'secret', '_', alnum(30, 25), '_', alnum(8, 6)].join(''), label: 'SUPABASE_SECRET_KEY' },
  { id: 'vercel-access-token', key: ['vcp', '_', alnum(40, 27)].join(''), label: 'VERCEL_ACCESS_TOKEN' },
  { id: 'docker-hub-pat', key: ['dckr', '_pat_', alnum(27, 29), '-', alnum(3, 1)].join(''), label: 'DOCKER_HUB_PAT' },
  { id: 'google-oauth-client-secret', key: ['GOCSPX', '-', alnum(28, 31)].join(''), label: 'GOOGLE_OAUTH_CLIENT_SECRET' },
  { id: 'stripe-webhook-secret', key: ['whsec', '_', alnum(40, 33)].join(''), label: 'STRIPE_WEBHOOK_SECRET' },
  { id: 'resend-api-key', key: ['re', '_', alnum(8, 35), '_', alnum(24, 8)].join(''), label: 'RESEND_API_KEY' },
  { id: 'neon-api-key', key: ['napi', '_', alnum(52, 37)].join(''), label: 'NEON_API_KEY' },
  { id: 'render-api-key', key: ['rnd', '_', alnum(32, 39)].join(''), label: 'RENDER_API_KEY' },
  { id: 'tailscale-key', key: ['tskey', '-auth-', alnum(12, 41), 'CNTRL', '-', alnum(32, 12)].join(''), label: 'TAILSCALE_KEY' },
  { id: 'figma-pat', key: ['figd', '_', alnum(40, 43)].join(''), label: 'FIGMA_PAT' },
  { id: 'exa-api-key', key: ['exa', '_', alnum(36, 47), '-', alnum(4, 5)].join(''), label: 'EXA_API_KEY' },
  { id: 'cartesia-api-key', key: ['sk_', 'car', '_', alnum(32, 49)].join(''), label: 'CARTESIA_API_KEY' },
  { id: 'e2b-api-key', key: ['e2b', '_', hex(40, 13)].join(''), label: 'E2B_API_KEY' },
  { id: 'runpod-api-key', key: ['rpa', '_', alnum(48, 51)].join(''), label: 'RUNPOD_API_KEY' },
  { id: 'apify-api-token', key: ['apify', '_api_', alnum(36, 53)].join(''), label: 'APIFY_API_TOKEN' },
  { id: 'browserbase-api-key', key: ['bb', '_live_', alnum(30, 55), '_', alnum(6, 7)].join(''), label: 'BROWSERBASE_API_KEY' },
  { id: 'trigger-dev-secret-key', key: ['tr', '_prod_', alnum(30, 57)].join(''), label: 'TRIGGER_DEV_SECRET_KEY' },
  { id: 'inngest-signing-key', key: ['signkey', '-prod-', hex(64, 2)].join(''), label: 'INNGEST_SIGNING_KEY' },
  { id: 'unkey-root-key', key: ['unkey', '_', alnum(30, 59)].join(''), label: 'UNKEY_ROOT_KEY' },
  { id: 'expo-access-token', key: ['exp', '_', alnum(40, 61)].join(''), label: 'EXPO_ACCESS_TOKEN' },
  { id: 'posthog-personal-api-key', key: ['phx', '_', alnum(43, 1)].join(''), label: 'POSTHOG_PERSONAL_API_KEY' },
  { id: 'axiom-api-token', key: ['xaat', '-', alnum(8, 3), '-', alnum(4, 9), '-', alnum(4, 15), '-', alnum(4, 21), '-', alnum(12, 27)].join(''), label: 'AXIOM_API_TOKEN' },
  { id: 'polar-access-token', key: ['polar', '_oat_', alnum(40, 35)].join(''), label: 'POLAR_ACCESS_TOKEN' },
  { id: 'mem0-api-key', key: ['m0', '-', alnum(40, 14), '_', alnum(4, 8)].join(''), label: 'MEM0_API_KEY' },
  { id: 'statsig-secret-key', key: ['secret', '-', alnum(40, 16)].join(''), label: 'STATSIG_SECRET_KEY' },
  { id: 'loops-api-key', key: ['loops', '_', hex(32, 6)].join(''), label: 'LOOPS_API_KEY' },
]

// ---- the data ---------------------------------------------------------------------------------

test('the generated own rules are current (npm run rules:build)', () => {
  assert.equal(fs.readFileSync(OWN_GENERATED_PATH, 'utf8'), expectedOwn())
})

test('every own rule converts, with no rejection', () => {
  assert.deepEqual(OWN_REJECTIONS, [])
  assert.equal(OWN_RULES.length, OWN_RAW.length)
  assert.equal(OWN_RULES.length, 40)
})

test('own rule ids are unique and clash with no Gitleaks or internal id', () => {
  assert.equal(new Set(OWN_IDS).size, OWN_IDS.length)
  for (const id of OWN_IDS) {
    assert.ok(!GITLEAKS_IDS.includes(id), `${id} is a Gitleaks id`)
    assert.ok(!INTERNAL.includes(id), `${id} is an internal id`)
    assert.ok(!['personal-email', 'personal-phone'].includes(id), id)
  }
})

test('every own rule has a label from its id, keywords of 2+ lowercase characters, a bounded area, and an entropy floor', () => {
  for (const r of OWN_RULES) {
    assert.equal(r.label, r.id.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase())
    assert.ok(r.keywords.length > 0, r.id)
    for (const k of r.keywords) {
      assert.ok(k.length >= 2, `${r.id}: ${k}`)
      assert.equal(k, k.toLowerCase(), r.id)
    }
    assert.ok(r.area > 0 && r.area <= 2 * 16384 + 100, `${r.id}: ${r.area}`)
    assert.ok((r.entropy ?? 0) >= 3, `${r.id} has no entropy floor`)
  }
  assert.equal((OWN_RULES.find(r => r.id === 'fireworks-api-key') as { entropy?: number }).entropy, 4)
  assert.equal((OWN_RULES.find(r => r.id === 'resend-api-key') as { entropy?: number }).entropy, 3.5)
})

test('the fake table has one fake for each own rule', () => {
  assert.deepEqual(FAKES.map(f => f.id).sort(), [...OWN_IDS].sort())
})

// ---- one set of tests per rule ------------------------------------------------------------------

const others = (id: string): string[] => [...GITLEAKS_IDS, ...OWN_IDS.filter(x => x !== id), ...INTERNAL]
const MAX_TRIES = 120

for (const rule of OWN_RULES) {
  const raw = OWN_RAW.find(r => r.id === rule.id) as (typeof OWN_RAW)[number]
  const tree = parse(ruleSource(raw) as string)

  test(`own rule ${rule.id}: a sample from its own pattern is found; a near miss is not; the worst case is quick`, () => {
    const { checker } = createChecker({ off: others(rule.id) })
    assert.equal(checker.ruleCount, 1)
    const r = rng(Array.from(rule.id).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7))
    let found = false
    for (let i = 0; i < MAX_TRIES && !found; i++) {
      const s = sample(tree.node, r, 4 + (i % 12))
      for (const text of [s, `x ${s} y\n`, `${rule.keywords[0]} ${s}\n`, `line one\n${s}\nline three\n`]) {
        if (checker.scan(text).findings.some(f => f.ruleId === rule.id)) {
          found = true
          break
        }
      }
    }
    assert.ok(found, `no sample of ${rule.id} was found in ${MAX_TRIES} tries`)

    // A near miss: the keyword and ordinary words are not a match.
    for (const k of rule.keywords) assert.deepEqual(checker.scan(`${k} ok\nplain words only\n`).findings, [], `${rule.id}: ${k}`)

    // A sample cut below the shortest possible match is not found.
    const min = analyze(tree.node).minLen
    const cut = sample(tree.node, rng(3), 4).slice(0, Math.max(0, min - 1))
    assert.deepEqual(checker.scan(cut).findings, [], `${rule.id}: cut`)

    // Worst case: 100 KB built to make the engine work, in several shapes.
    const kw = rule.keywords[0] as string
    const dropped = sample(tree.node, rng(99), 8)
    const inputs = [
      `${kw} `.repeat(Math.ceil(100_000 / (kw.length + 1))),
      `${kw}${'a'.repeat(100_000)}`,
      dropped.slice(0, -1).repeat(Math.ceil(100_000 / Math.max(1, dropped.length - 1))),
      `${kw}${' '.repeat(100_000)}x`,
      `${kw}${'='.repeat(100_000)}`,
      `${kw}${'-'.repeat(100_000)}`,
      `${kw}${'_'.repeat(100_000)}`,
    ]
    for (const [n, text] of inputs.entries()) {
      const t0 = performance.now()
      const res = checker.scan(text.slice(0, 100_000))
      const ms = performance.now() - t0
      assert.ok(ms < 1500, `${rule.id}: worst-case input ${n} took ${Math.round(ms)} ms`)
      assert.equal(res.complete, true, `${rule.id}: input ${n} ran out of budget`)
    }
  })
}

// ---- a hand-built fake is found bare, in an env line and as a code argument ------------------------

for (const fake of FAKES) {
  test(`own rule ${fake.id}: a fake key is found bare, in an env line, in JSON and as a code argument, with its label`, () => {
    assert.match(fake.key, /^[\x21-\x7e]+$/)
    const contexts = [
      fake.key,
      `Here is my key: ${fake.key} please use it\n`,
      `SOME_SERVICE_TOKEN=${fake.key}\n`,
      `{"token": "${fake.key}"}`,
      `client = Client("${fake.key}")\n`,
      `client.init('${fake.key}', {})\n`,
      `echo ${fake.key}\\n`,
    ]
    // Only this rule on: the label is the rule's own.
    const { checker: one } = createChecker({ off: others(fake.id) })
    for (const text of contexts) {
      const found = one.scan(text).findings
      assert.equal(found.length, 1, `${fake.id}: ${text.slice(0, 40)}`)
      const f = found[0]!
      assert.equal(f.ruleId, fake.id)
      assert.equal(f.label, fake.label)
      assert.equal(f.kind, 'format')
      assert.equal(text.slice(f.start, f.end), fake.key, `${fake.id}: the span is the whole key`)
    }
    // Everything on: no part of the key is left in the open.
    const { checker: all } = createChecker()
    for (const text of contexts) {
      const covered = all.scan(text).findings
      const at = text.indexOf(fake.key)
      for (let i = at; i < at + fake.key.length; i++) assert.ok(covered.some(f => f.start <= i && i < f.end), `${fake.id}: position ${i - at} of ${text.slice(0, 30)} is open`)
    }
  })
}

test('rules.off and rules.actions apply to an own rule', () => {
  const key = FAKES[0]!.key
  const { checker: off } = createChecker({ off: [...GITLEAKS_IDS, ...INTERNAL, 'openrouter-api-key'] })
  assert.deepEqual(off.scan(key).findings, [])
  const { checker: blocked } = createChecker({ off: [...GITLEAKS_IDS, ...INTERNAL], actions: { 'openrouter-api-key': 'block' } })
  assert.equal(blocked.scan(key).findings[0]!.action, 'block')
  const { checker: dflt } = createChecker({ off: [...GITLEAKS_IDS, ...INTERNAL] })
  assert.equal(dflt.scan(key).findings[0]!.action, 'hide')
})

// ---- false-alarm guards -----------------------------------------------------------------------------

test('identifiers and placeholders are left alone by the short-prefix rules', () => {
  const { checker } = createChecker({ off: [...GITLEAKS_IDS, ...INTERNAL] })
  const miss = (text: string): void => assert.deepEqual(checker.scan(text).findings, [], text)
  miss('x = re_match_group\n')
  miss('const m = re_match_group_1(text)')
  miss('let fw_version_major = 3')
  miss('fw_version_major_number_value')
  miss(`key = "gsk_${'x'.repeat(40)}"`)
  miss(`key = "xai-${'x'.repeat(40)}"`)
  miss(`key = "fw_${'x'.repeat(24)}"`)
  miss(`key = "rnd_${'0'.repeat(32)}"`)
  miss(`key = "sk-or-v1-${'0'.repeat(64)}"`)
  miss(`key = "sk_${'0'.repeat(48)}"`)
  miss('sk-learn is a python package; sk_learn too; rnd_seed = 4; csk-lib')
  // 40 hex after sk- is not a DeepSeek key (exactly 32).
  miss(`key = "sk-${hex(40, 3)}"`)
  // A live Stripe key keeps its own rule; ElevenLabs needs exactly 48 hex after sk_.
  miss(`key = "sk_live_${alnum(24, 5)}"`)
  // A public key is left alone.
  miss(`key = "pk-lf-${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}"`)
  // Clerk, WorkOS and UploadThing share Stripe's sk_live_ and sk_test_ prefixes: they are Stripe's rule's, not ours.
  miss(`key = "sk_test_${alnum(30, 3)}"`)
  miss(`key = "sk_live_${hex(64, 3)}"`)
  miss(`key = "sb_publishable_${alnum(30)}"`)
  // Resend needs the exact 8 + 24 shape.
  miss(`key = "re_${alnum(8)}_${alnum(10)}"`)
  // Placeholders and identifiers for the second batch.
  miss(`key = "phx_${'0'.repeat(43)}"`)
  miss(`const a = "secret-${'x'.repeat(40)}"; b = "m0-${'0'.repeat(40)}"`)
  miss('secret-manager-credentials-rotation-policy-enabled; m0-model-config-name-for-tests; secret-handshake')
  miss('const exp_value = 1; let polar_at_home = 2; unkey_lookup_table(); loops_per_second = 3')
  miss(`key = "re_${alnum(8)}_${alnum(30)}"`)
})

test('a fake Stripe live key is not relabelled as an ElevenLabs key', () => {
  const key = ['sk', '_live_', alnum(24, 5)].join('')
  const { checker } = createChecker()
  const found = checker.scan(`k=${key}\n`).findings
  assert.ok(found.length > 0)
  for (const f of found) assert.notEqual(f.ruleId, 'elevenlabs-api-key')
})

test('the own rules find nothing in the false-alarm set', () => {
  const { checker } = createChecker({ off: [...GITLEAKS_IDS, ...INTERNAL] })
  const files = falseAlarmFiles(root)
  assert.ok(files.length > 100)
  const hits: string[] = []
  for (const f of files) {
    const text = fs.readFileSync(f.file, 'utf8')
    for (const x of checker.scan(text, { file: f.name }).findings) hits.push(`${f.name}:${x.ruleId}:${shannon(text.slice(x.start, x.end)).toFixed(2)}`)
  }
  assert.deepEqual(hits, [])
})
