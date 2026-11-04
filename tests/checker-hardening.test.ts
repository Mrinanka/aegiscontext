// Findings from step 2's /verify: each case here leaked, hung or crashed before it
// was fixed. Fake values are built from pieces at test time.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createChecker } from '../src/checker/index.ts'
import { analyze } from '../src/checker/re/analyze.ts'
import { parse } from '../src/checker/re/parse.ts'
import { ruleSource, toSpec } from '../src/checker/convert.ts'
import { RULES } from '../src/checker/rules.generated.ts'
import { TOML_PATH } from '../tools/rules/build.ts'
import { parseToml } from '../tools/rules/toml.ts'
import { rng, sample } from '../tools/rules/sample.ts'
import { makeFake, humanWord, pick, seededSource } from '../tools/test-sets/fakes.ts'
import { speedSet } from '../tools/test-sets/speed.ts'
import fs from 'node:fs'
import type { RawRule } from '../src/checker/types.ts'

const root = path.join(import.meta.dirname, '..')
const { checker } = createChecker()
const src = seededSource('hardening-test')
const value = (n = 4): string => `${humanWord(src)}${pick(src, '0123456789', n)}`
const BS = '\\'

function hidden(text: string, file?: string): string[] {
  checker.clearLines()
  const r = checker.scan(text, file === undefined ? {} : { file })
  assert.equal(r.complete, true)
  return r.findings.map(f => text.slice(f.start, f.end))
}

const covers = (text: string, v: string): boolean => hidden(text).some(h => h.includes(v))

/** Runs a scan in its own process, so a hang fails the test instead of stopping the run. */
function inChild(body: string, timeout = 30_000): { status: number | null; stdout: string } {
  const url = pathToFileURL(path.join(root, 'src', 'checker', 'index.ts')).href
  const script = `import { createChecker } from ${JSON.stringify(url)}\n${body}`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', timeout })
  return { status: r.status, stdout: r.stdout }
}

// ---- can't get stuck (R-15) ------------------------------------------------------------

test('a custom pattern with too much total work is rejected, however it is spelled', () => {
  for (const pattern of ['[a-z]{0,1000}[a-z0-9]{0,1000}token!', 'token[a-z]{0,1000}[a-z0-9]{0,1000}!', 'token[a-z]{0,300}[a-z0-9]{0,300}[a-z_]{0,300}!']) {
    const { errors } = createChecker({ custom: [{ id: 'c', label: 'C', keyword: 'token', pattern }] })
    assert.equal(errors.length, 1, pattern)
    assert.match(errors[0]?.reason ?? '', /too high/)
  }
})

test('ordinary custom patterns are still accepted', () => {
  for (const [pattern, keyword] of [['acme_[a-z0-9]{32}', 'acme_'], ['acme_[a-z0-9]+', 'acme_'], ['acme_\\w{8,64}-[0-9]{4}', 'acme_']] as const) {
    const { errors } = createChecker({ custom: [{ id: 'c', label: 'C', keyword, pattern }] })
    assert.deepEqual(errors, [], pattern)
  }
})

test('the worst custom patterns the check accepts cannot run past the budget', () => {
  // Just under the limit: one with a literal start, one with a run of letters first.
  for (const pattern of ['token[a-z]{0,50}[a-z0-9]{0,50}!', '[a-z]{0,50}[a-z0-9]{0,50}token!']) {
    const r = inChild(`
      const { checker, errors } = createChecker({ budgetMs: 1000, custom: [{ id: 'c', label: 'C', keyword: 'token', pattern: ${JSON.stringify(pattern)} }] })
      if (errors.length > 0) throw new Error('rejected')
      const t0 = performance.now()
      checker.scan(('token ' + 'a'.repeat(400) + ' ').repeat(5000))
      console.log(Math.round(performance.now() - t0))
    `)
    assert.equal(r.status, 0, `${pattern}: hung or rejected`)
    assert.ok(Number(r.stdout.trim()) < 5000, `${pattern}: ${r.stdout.trim()} ms`)
  }
})

// ---- a crash lets content through ------------------------------------------------------

test('a very large group of overlapping findings does not crash the scan', () => {
  const r = inChild(`
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const parts = []
    for (let i = 0; i < 140000; i++) {
      let s = 'AK' + 'IA', x = (i * 2654435761 + 7) >>> 0
      for (let j = 0; j < 16; j++) { x = (x * 1103515245 + 12345) >>> 0; s += letters[(x >>> 16) % 32] }
      parts.push(s)
    }
    const { checker } = createChecker({ budgetMs: 60000 })
    const q = String.fromCharCode(34)
    const res = checker.scan('password=' + q + parts.join(' ') + q + '\\n')
    console.log(res.findings.length)
  `, 60_000)
  assert.equal(r.status, 0, 'the scan threw')
  assert.equal(r.stdout.trim(), '1')
})

// ---- escaped text ----------------------------------------------------------------------

test('a label right after an escaped newline or tab is still a label', () => {
  const v = value()
  for (const esc of ['n', 'r', 't']) {
    assert.ok(covers(`{"c":"A=1${BS}${esc}password=${v}${BS}n"}`, v), esc)
    assert.ok(covers(`{"c":"A=1${BS}${BS}${esc}pwd=${v}"}`, v), `double ${esc}`)
  }
})

test('a word that merely starts with n, r or t after a backslash is unchanged', () => {
  const v = value()
  assert.deepEqual(hidden(`C:${BS}data${BS}bypass=${v}\n`), [])
})

test('an escaped quote does not end a quoted value', () => {
  const v = value()
  const text = `"password": "ab${BS}"${v}"\n`
  assert.ok(covers(text, v))
  assert.ok(covers(text, 'ab'))
  assert.ok(covers(`password='ab${BS}'${v}'\n`, v))
  assert.ok(covers(`{${BS}"password${BS}":${BS}"ab${BS}${BS}${BS}"${v}${BS}"}\n`, v))
})

test('a backslash at the end of a quoted value still closes it', () => {
  const v = value()
  assert.deepEqual(hidden(`password="${v}${BS}${BS}" tail\n`), [`${v}${BS}${BS}`])
})

// ---- Sourcegraph ------------------------------------------------------------------------

test('Sourcegraph tokens are found, and a bare git hash is not', () => {
  const hex = pick(src, '0123456789abcdef', 40)
  const mid = pick(src, '0123456789abcdef', 16)
  const a = ['sgp', hex].join('_')
  const b = ['sgp', mid, hex].join('_')
  const c = ['sgp', 'local', hex].join('_')
  for (const t of [a, b, c]) assert.ok(covers(`seen ${t} here\n`, t), t.length.toString())
  assert.deepEqual(hidden(`commit ${hex}\n`), [])
})

// ---- speed ------------------------------------------------------------------------------

test('a flood of curl words finishes on 2 MB', () => {
  for (const unit of ['curl ', 'curl -H ', 'curl -u ']) {
    const text = unit.repeat(Math.ceil((2 * 1024 * 1024) / unit.length))
    const { checker: c } = createChecker()
    const t0 = performance.now()
    const r = c.scan(text)
    assert.equal(r.complete, true, unit)
    assert.ok(performance.now() - t0 < 3000, unit)
  }
})

test('the curl rules need curl before the flag, on any line within reach', () => {
  const token = 'Zq7' + 'Xk2' + 'Pm9' + 'Wd4'
  const header = `-H "X-Api-Key: ${token}"`
  const only = createChecker({ off: [...RULES.map(r => r.id).filter(x => x !== 'curl-auth-header'), 'password-label', 'url-password', 'private-key-truncated'] }).checker
  const found = (t: string): boolean => only.scan(t).findings.some(f => t.slice(f.start, f.end) === token)
  assert.ok(found(`curl https://x.test ${header}\n`))
  assert.ok(found(`curl https://x.test \\\n  ${header}\n`))
  assert.ok(found(`curl ${'a'.repeat(900)} ${header}\n`))
  assert.ok(!found(`wget ${header}\n`))
  assert.ok(!found(`recurl ${header}\n`))
  assert.ok(!found(`curl ${'a'.repeat(1100)} ${header}\n`))
  const user = createChecker({ off: [...RULES.map(r => r.id).filter(x => x !== 'curl-auth-user'), 'password-label', 'url-password', 'private-key-truncated'] }).checker
  assert.deepEqual(user.scan('docker run -u root:root nginx\n').findings, [])
})

test('one slow rule cannot stop the others from running', () => {
  // Rules run in order, so the slow one comes first and the quick one after it.
  const { checker: c, errors } = createChecker({
    budgetMs: 1000,
    custom: [
      { id: 'a-slow', label: 'SLOW', keyword: 'slow', pattern: 'slow[a-z]{0,50}[a-z0-9]{0,50}!' },
      { id: 'b-quick', label: 'QUICK', keyword: 'quick_', pattern: 'quick_[0-9]{8}' },
    ],
  })
  assert.deepEqual(errors, [])
  const r = c.scan(`${'slowaaaa'.repeat(250_000)}\nzz ${['quick', '12345678'].join('_')} zz\n`)
  assert.equal(r.complete, false, 'the input should be slow enough to matter')
  assert.ok(r.findings.some(f => f.ruleId === 'b-quick'), 'the rule after the slow one never ran')
})

test('the speed set holds a curl flood', () => {
  const item = speedSet().find(x => x.id === 'adversarial-curl-flood')
  assert.ok(item)
  assert.ok(item.text().length >= 2 * 1024 * 1024)
})

// ---- the end part of a name ------------------------------------------------------------

test('a long label ending a name with no separator is still a label', () => {
  const v = value()
  for (const name of ['PGPASSWORD', 'dbpassword', 'adminpassword', 'MYSQLPASSWORD', 'authtoken', 'accesstoken', 'CSRFTOKEN', 'dbsecret', 'dbpasswd', 'myapikey']) {
    assert.deepEqual(hidden(`${name}=${v}\n`), [v], name)
  }
})

test('short labels still need a boundary', () => {
  const v = value()
  for (const name of ['bypass', 'compass', 'monkey', 'hockey', 'oauth', 'caccess']) assert.deepEqual(hidden(`${name} = ${v}\n`), [], name)
})

// ---- values that only look like code ----------------------------------------------------

test('a dotted value is code outside a source file only if it ends in the label', () => {
  const pw = 'Harbor' + '.Meadow'
  assert.ok(covers(`DB_PASSWORD=${pw}\n`, pw))
  assert.ok(covers(`password=admin.x26\n`, 'admin.x26'))
  assert.deepEqual(hidden(`DB_PASSWORD=${pw}\n`, 'a.ts'), [])
  for (const code of ['password = config.password\n', 'secret = settings.SECRET_KEY\n', 'token = response.access_token\n', 'password = user.Password\n']) {
    assert.deepEqual(hidden(code), [], code)
  }
})

test('environment lookups stay harmless', () => {
  for (const code of ['const token = process.env.X\n', 'secret = import.meta.env.VITE_SECRET\n', 'pass = os.environ.get("PW")\n']) assert.deepEqual(hidden(code), [], code)
})

test('a call must be closed, and its arguments may hold commas', () => {
  const open = 'Summer' + '(2026'
  assert.ok(covers(`password=${open}\n`, open))
  assert.deepEqual(hidden('token = getToken(a, b)\n'), [])
  assert.deepEqual(hidden('password = hash(salt, value)\n'), [])
  assert.deepEqual(hidden('secret = ENV["SECRET"]\n'), [])
})

test('generics are code only in a source file', () => {
  const g = 'Hunter' + '<2026>'
  assert.ok(covers(`password=${g}\n`, g))
  assert.deepEqual(hidden(`password=${g}\n`, 'a.ts'), [])
})

test('only a letters-only "your-" value is a placeholder', () => {
  const v = value()
  assert.ok(covers(`password=your_${v}\n`, v))
  for (const p of ['your-password-here', 'your_api_key', 'YOUR-TOKEN']) assert.deepEqual(hidden(`password=${p}\n`), [], p)
})

// ---- header and command-line forms -----------------------------------------------------

const opaque = (): string => pick(src, 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', 28)

test('Authorization headers hide the credential, not the scheme', () => {
  const t = opaque()
  for (const line of [`Authorization: Bearer ${t}\n`, `authorization: bearer ${t}\r\n`, `"Authorization": "Bearer ${t}"\n`, `Authorization: Basic ${t}\n`, `Authorization: Token ${t}\n`, `Authorization: ${t}\n`, `curl.exe -H 'Authorization: Bearer ${t}' x\n`]) {
    assert.deepEqual(hidden(line), [t], line)
  }
})

test('a bearer token without the header word is hidden when it looks generated', () => {
  const t = opaque()
  assert.ok(covers(`headers = { "X-Auth": "Bearer ${t}" }\n`, t))
  assert.deepEqual(hidden(`headers = { "X": "Bearer ${t}" }\n`), [t])
})

test('header references and prose are left alone', () => {
  for (const line of ['Authorization: Bearer <token>\n', 'Authorization: Bearer $TOKEN\n', 'Authorization: Bearer ${TOKEN}\n', 'Authorization: Bearer {{ token }}\n', 'Authorization: Bearer {token}\n', 'Authorization: Bearer YOUR_TOKEN\n', 'headers["Authorization"] = "Bearer " + token\n', 'Pass the bearer token in the header.\n', 'Authorization: required\n', 'The Authorization header is missing\n']) {
    assert.deepEqual(hidden(line), [], line)
  }
})

test('a password flag followed by a value is hidden', () => {
  const v = value()
  for (const line of [`mysql --password ${v}\n`, `tool --token ${v} --verbose\n`, `tool --api-key ${v}\n`, `tool --db-password ${v}\n`, `tool --client-secret "${v}"\n`]) {
    assert.deepEqual(hidden(line), [v], line)
  }
})

test('flags with no real value are left alone', () => {
  for (const line of ['use the --password flag\n', 'see the --password option\n', 'tool --password --verbose\n', 'tool --password-file /run/pw\n', 'tool --password $PW\n', 'tool --token ${TOKEN}\n', 'tool --password\n']) {
    assert.deepEqual(hidden(line), [], line)
  }
})

test('mysql-style attached passwords are hidden', () => {
  const v = value()
  for (const line of [`mysql -uroot -p${v} app\n`, `mysqldump -h db -p${v}\n`, `mariadb -p'${v}'\n`, `sshpass -p ${v} ssh host\n`, `sshpass -p${v} ssh host\n`]) {
    assert.deepEqual(hidden(line), [v], line)
  }
  assert.deepEqual(hidden('mysql -uroot -pabc\n'), ['abc'])
})

test('other uses of -p are left alone', () => {
  for (const line of ['mkdir -p /srv/app\n', 'docker run -p 8080:80 nginx\n', 'docker run -p8080:80 nginx\n', 'ssh -p 2222 host\n', 'tsc -p .\n', 'mysql -p\n', 'mysql -uroot -p app\n', 'mysql -p$MYSQL_PWD\n']) {
    assert.deepEqual(hidden(line), [], line)
  }
})

test('the new forms answer to the password-label switch and action', () => {
  const t = opaque()
  const { checker: off } = createChecker({ off: ['password-label'] })
  assert.deepEqual(off.scan(`Authorization: Bearer ${t}\n`).findings, [])
  const { checker: warn } = createChecker({ actions: { 'password-label': 'warn' } })
  const f = warn.scan(`tool --password ${value()}\n`).findings
  assert.equal(f[0]?.action, 'warn')
  assert.equal(f[0]?.showHint, false)
})

// ---- the hand rewrites ------------------------------------------------------------------

const raws = parseToml(fs.readFileSync(TOML_PATH, 'utf8')).rules as unknown as RawRule[]

test('differential: the hand-rewritten rules find what upstream finds', () => {
  for (const id of ['curl-auth-header', 'curl-auth-user', 'sourcegraph-access-token']) {
    const raw = raws.find(r => r.id === id) as RawRule
    const rule = RULES.find(r => r.id === id) as (typeof RULES)[number]
    assert.ok(rule, id)
    const upstream = toSpec(raw.regex as string)
    const a = new RegExp(rule.source, `${rule.flags}g`)
    const b = new RegExp(upstream.source, `${upstream.flags}g`)
    const tree = parse(ruleSource(raw) as string)
    const r = rng(11)
    const first = (m: RegExpMatchArray): string | undefined => m.slice(1).find(x => x) ?? m[0]
    let compared = 0
    for (let i = 0; i < 200; i++) {
      const lead: string = rule.requiresBefore ? `${rule.requiresBefore.word} ` : ''
      const text: string = `a ${lead}${sample(tree.node, r, 6)} b\n`
      if (text.length > 900) continue
      assert.deepEqual([...text.matchAll(a)].map(first), [...text.matchAll(b)].map(first), id)
      compared++
    }
    assert.ok(compared > 50, `${id}: ${compared}`)
  }
})

test('aws-access-token has no entropy floor: a low-entropy key is hidden, and the documented EXAMPLE key stays allowed', () => {
  const { checker } = createChecker()
  const awsHit = (text: string, v: string) => checker.scan(text).findings.some(f => f.ruleId === 'aws-access-token' && text.slice(f.start, f.end) === v)
  // Built from pieces: a key of the right shape whose entropy is about 2.35, under upstream's floor of 3.
  const low = ['AK', 'IA', 'ABABABAB', 'CDCDCDCD'].join('')
  assert.ok(awsHit(`Error: ${low}\n`, low), 'a low-entropy key')
  // The kit's random AWS fakes: about 1 in 2,000 fell under the floor before this change.
  const src = seededSource('aws-entropy')
  for (let i = 0; i < 3000; i++) {
    const v = makeFake('aws-access-key', src).value
    assert.ok(awsHit(`Error: ${v}\n`, v), `seeded fake ${i}`)
  }
  const example = ['AK', 'IA', 'IOSFODNN7', 'EXAMPLE'].join('')
  assert.equal(awsHit(`key ${example}\n`, example), false, 'the EXAMPLE allowlist still applies')
  const raw = raws.find(r => r.id === 'aws-access-token') as RawRule
  assert.equal(raw.entropy, 3, 'upstream still sets the floor; the rewrite is what removes it')
  assert.equal((RULES.find(r => r.id === 'aws-access-token') as { entropy?: number }).entropy, undefined)
})

test('a sample cut below a rule\'s shortest possible match is not found', () => {
  for (const rule of RULES) {
    const raw = raws.find(r => r.id === rule.id) as RawRule
    const tree = parse(ruleSource(raw) as string)
    const min = analyze(tree.node).minLen
    const cut = sample(tree.node, rng(3), 4).slice(0, Math.max(0, min - 1))
    const { checker: one } = createChecker({ off: [...RULES.map(r => r.id).filter(x => x !== rule.id), 'password-label', 'url-password', 'private-key-truncated'] })
    assert.deepEqual(one.scan(cut).findings, [], rule.id)
  }
})
