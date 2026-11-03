// The log-like false-alarm set (plan step 5 item 7). The false-alarm set of step 1 is TypeScript sources, but
// the text Bash and MCP tools return is mostly logs, so false alarms are measured on log-like text as well:
// access logs, application logs, JSON logs, stack traces, git output, hashes, UUIDs and IP addresses.
//
// Nothing in it is a secret: every value is a harmless identifier, hash, address or word that happens to sit
// beside a word like "token", "key" or "password". Hiding any of it counts as a false alarm.
//
// WRITTEN BY THE SAME PERSON WHO TUNED THE CHECKER AGAINST IT, so it can flatter the tuning: it is a first set,
// not a verdict (docs/engineering/targets.md says so). Built from a fixed seed, so each run measures the same bytes.

import { pick, seededSource, type Source } from './fakes.ts'

export type LogFile = { name: string; text: string }

const HEX = '0123456789abcdef'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'orders', 'billing', 'search', 'inventory', 'catalog', 'gateway', 'worker', 'cache', 'queue', 'mailer', 'reports']
const LEVELS = ['INFO', 'INFO', 'INFO', 'DEBUG', 'WARN', 'ERROR']
const METHODS = ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE']
const PATHS = [
  '/api/v1/items', '/api/v1/users/{n}', '/auth/login', '/auth/password/reset', '/auth/token/refresh', '/settings/api-keys', '/api/v2/keys/list',
  '/static/app.{h8}.js', '/health', '/metrics', '/api/v1/orders/{n}/items', '/oauth/token', '/account/password', '/docs/secrets-management',
]
const QUERIES = ['', '', '?page={n}&sort=desc', '?q=password+reset', '?key=name&order=asc', '?token_type=bearer', '?id={n}&format=json', '?secret=false', '?api_key_id={n}']
const AGENTS = ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/118.0 Safari/537.36', 'curl/8.4.0', 'python-requests/2.31.0', 'Go-http-client/2.0']

type Rng = { int(n: number): number; of<T>(xs: readonly T[]): T; hex(n: number): string; uuid(): string; ip(): string; word(): string }

function rng(seed: string): Rng {
  const src: Source = seededSource(seed)
  const int = (n: number): number => {
    const b = src(4)
    return ((b[0] as number) * 2 ** 24 + (b[1] as number) * 2 ** 16 + (b[2] as number) * 2 ** 8 + (b[3] as number)) % n
  }
  const hex = (n: number): string => pick(src, HEX, n)
  return {
    int,
    of: xs => xs[int(xs.length)] as (typeof xs)[number],
    hex,
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`,
    ip: () => `${1 + int(223)}.${int(256)}.${int(256)}.${1 + int(254)}`,
    word: () => pick(src, LOWER, 4 + int(6)),
  }
}

const fill = (r: Rng, t: string): string => t.replace(/\{n\}/g, () => String(1 + r.int(99_999))).replace(/\{h8\}/g, () => r.hex(8))
const stamp = (i: number): string => `2026-11-01T${String(Math.floor(i / 3600) % 24).padStart(2, '0')}:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.${String(i % 1000).padStart(3, '0')}Z`

function access(size: number): string {
  const r = rng('logs-access')
  const out: string[] = []
  for (let i = 0, have = 0; have < size; i++) {
    const line = `${r.ip()} - - [01/Nov/2026:${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')} +0000] "${r.of(METHODS)} ${fill(r, r.of(PATHS))}${fill(r, r.of(QUERIES))} HTTP/1.1" ${r.of([200, 200, 200, 204, 301, 401, 404, 500])} ${r.int(90_000)} "-" "${r.of(AGENTS)}" rid=${r.uuid()}\n`
    out.push(line)
    have += line.length
  }
  return out.join('')
}

function app(size: number): string {
  const r = rng('logs-app')
  const templates = [
    'user {n} requested a password reset',
    'token expired for session {h32}',
    'api key rotated: key_id={n} owner={w}',
    'auth: loading the secret store at vault://{w}/prod, version {n}',
    'failed to validate token: signature mismatch for kid={h16}',
    'password policy: min length 12, history {n}',
    'request {uuid} finished in {n}ms, cache key={h32}',
    'worker {n} picked up job {uuid} from queue {w}',
    'rate limit for key {h16} is 1000/min, used {n}',
    'rotating credentials for service {w}; next rotation in {n}h',
    'session {h32} created for user {n}, token_type=Bearer',
    'config: password_file=/etc/{w}/passwd, token_ttl=3600, secret_name={w}-secret',
    'checksum {h64} verified for artifact {w}-{n}.tar.gz',
    'connecting to {w}.internal:5432 as {w} (password from the environment)',
    'user {n} signed in from {ip}, key bindings loaded',
  ]
  const out: string[] = []
  for (let i = 0, have = 0; have < size; i++) {
    const t = r.of(templates)
    const text = t.replace(/\{n\}/g, () => String(1 + r.int(99_999))).replace(/\{h32\}/g, () => r.hex(32)).replace(/\{h16\}/g, () => r.hex(16)).replace(/\{h64\}/g, () => r.hex(64)).replace(/\{uuid\}/g, () => r.uuid()).replace(/\{ip\}/g, () => r.ip()).replace(/\{w\}/g, () => r.of(WORDS))
    const line = `${stamp(i)} ${r.of(LEVELS).padEnd(5)} [${r.of(WORDS)}-${r.int(8)}] ${text}\n`
    out.push(line)
    have += line.length
  }
  return out.join('')
}

function json(size: number): string {
  const r = rng('logs-json')
  const out: string[] = []
  for (let i = 0, have = 0; have < size; i++) {
    const rec = {
      ts: stamp(i),
      level: r.of(['info', 'info', 'warn', 'error']),
      msg: r.of(['login ok', 'token refreshed', 'password check', 'key lookup', 'secret fetched', 'session started']),
      user_id: 1 + r.int(99_999),
      request_id: r.uuid(),
      token_type: 'Bearer',
      password_required: r.int(2) === 0,
      key: r.of(['name', 'id', 'email', 'created_at']),
      api_key_id: r.hex(12),
      session: r.hex(32),
      ip: r.ip(),
      sha256: r.hex(64),
    }
    const line = `${JSON.stringify(rec)}\n`
    out.push(line)
    have += line.length
  }
  return out.join('')
}

function traces(size: number): string {
  const r = rng('logs-trace')
  const frames = ['validatePassword', 'refreshToken', 'loadSecrets', 'getApiKey', 'checkSignature', 'handleRequest', 'processTicksAndRejections', 'authenticate']
  const out: string[] = []
  for (let have = 0; have < size; ) {
    const err = r.of(["TypeError: Cannot read properties of undefined (reading 'token')", 'Error: password must not be empty', 'Error: invalid api key format', "ReferenceError: secret is not defined", 'Error: ECONNRESET'])
    const block = [`${err}`, ...Array.from({ length: 4 + r.int(6) }, () => `    at ${r.of(frames)} (/app/src/${r.of(WORDS)}/${r.of(WORDS)}.js:${1 + r.int(400)}:${1 + r.int(60)})`), ''].join('\n') + '\n'
    out.push(block)
    have += block.length
  }
  return out.join('')
}

function git(size: number): string {
  const r = rng('logs-git')
  const subjects = ['fix token refresh race', 'add password strength meter', 'rotate api key docs', 'bump deps', 'rename secret store module', 'handle expired session', 'update README']
  // Most diff lines hold no label word at all; one in about twenty does, as in real changes to code.
  const plainDiffs = ['-  retries: 3', '+  retries: 5', ' import { readFile } from "node:fs"', '+  const rows = items.map(x => x.id)', '-  timeout: 1000', '+  timeout: 3000', ' export function run(): void {', '+  logger.info("started")', ' }', '+  return result', '-  return null', ' ', '+// handle the empty case', '+  if (!rows.length) return', ' export default config', '+  name: string', '-  name: string | undefined']
  const labelDiffs = ['-  password: string', '+  password: SecretString', '-const token = getToken()', '+const token = await getToken()', ' export type Key = string', '+  // see the secret rotation runbook']
  const diffs = [...plainDiffs, ...plainDiffs, ...labelDiffs]
  const out: string[] = []
  for (let have = 0; have < size; ) {
    const block = [
      `commit ${r.hex(40)}`,
      `Author: ${r.word()} <${r.word()}@users.noreply.github.com>`,
      `Date:   Sat Nov 1 12:00:00 2026 +0000`,
      '',
      `    ${r.of(subjects)}`,
      '',
      `diff --git a/src/${r.of(WORDS)}.ts b/src/${r.of(WORDS)}.ts`,
      `index ${r.hex(7)}..${r.hex(7)} 100644`,
      ...Array.from({ length: 4 + r.int(6) }, () => r.of(diffs)),
      '',
      `Merge pull request #${1 + r.int(4000)} from ${r.word()}/fix-${r.of(['token', 'password', 'key', 'secret'])}-${r.of(['refresh', 'reset', 'rotation'])}`,
      '',
    ].join('\n') + '\n'
    out.push(block)
    have += block.length
  }
  return out.join('')
}

function ids(size: number): string {
  const r = rng('logs-ids')
  const out: string[] = []
  for (let have = 0; have < size; ) {
    const line = `${r.of(['sha256', 'etag', 'image', 'commit', 'request-id', 'trace', 'build'])}: ${r.of([r.hex(64), r.uuid(), r.hex(40), r.ip(), `sha256:${r.hex(64)}`, `W/"${r.hex(32)}"`])}\n`
    out.push(line)
    have += line.length
  }
  return out.join('')
}

export function logFiles(totalBytes = 1_100_000): LogFile[] {
  const each = Math.ceil(totalBytes / 7)
  return [
    { name: 'var/log/nginx/access.log', text: access(each) },
    { name: 'var/log/app/service.log', text: app(each) },
    { name: 'var/log/app/events.jsonl', text: json(each) },
    { name: 'var/log/app/errors.log', text: traces(each) },
    { name: 'repo/git-log.txt', text: git(each) },
    { name: 'repo/ids.txt', text: ids(each) },
    { name: 'var/log/app/service-2.log', text: app(each) },
  ]
}
