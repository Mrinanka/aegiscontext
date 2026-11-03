// The tool protecting itself (spec §17, D-055): Claude's tool calls can't change its files, or the
// settings that would switch it off. The shell check reads text, so it is best effort: a command that
// hides what it does gets past it (spec §22).

export type Roots = {
  /** The data folder and the plugin folder. */
  own: readonly string[]
  /** Claude Code's config folder. */
  config: string
  /** Windows and macOS paths differ by case only in spelling. */
  caseless: boolean
  /** The home folder, so a command that names it as `~` or `$HOME` is read as the path it is. */
  home?: string
  /** The session's working folder, which a relative path starts from. */
  cwd?: string
  windows?: boolean
  /** `CLAUDE_CONFIG_DIR` is set, so `$CLAUDE_CONFIG_DIR` in a command names the config folder. */
  configVar?: boolean
}

export type Expand = { home: string; cwd: string; windows: boolean }

/** `/c/...`, `/cygdrive/c/...` or `/mnt/c/...` as the Windows path it names, or nothing. */
function driveForm(path: string): string | undefined {
  const m = /^\/(?:cygdrive\/|mnt\/)?([A-Za-z])(\/.*)?$/.exec(path)
  return m ? `${(m[1] as string).toUpperCase()}:${m[2] ?? '/'}` : undefined
}

const isAbsolute = (path: string, windows: boolean): boolean => (windows ? /^(?:[A-Za-z]:[\\/]|[\\/])/.test(path) : path.startsWith('/'))

/**
 * A tool's path as Claude Code reads it (2.1.316, read in its code): trimmed; `~` and `~/` are the home folder; on
 * Windows `/c/...` is `C:\...`; a relative path starts at the working folder. Not normalized: see `normalize`.
 */
export function expandPath(path: string, o: Expand): string {
  // On Windows the result uses backslashes, as Claude Code's own path joining does, so it can be read as it is.
  const native = (p: string): string => (o.windows ? p.replace(/\//g, '\\') : p)
  const join = (base: string, rest: string): string => native(`${base.replace(/[\\/]+$/, '')}/${rest}`)
  const t = path.trim()
  if (t === '') return o.cwd
  if (t === '~') return o.home
  if (t.startsWith('~/')) return join(o.home, t.slice(2))
  const p = (o.windows ? driveForm(t) : undefined) ?? t
  if (isAbsolute(p, o.windows)) {
    // A Windows path from the root of the drive stays on the working folder's drive.
    if (o.windows && /^[\\/](?![\\/])/.test(p) && /^[A-Za-z]:/.test(o.cwd)) return native(`${o.cwd.slice(0, 2)}${p}`)
    return native(p)
  }
  return join(o.cwd, p)
}

/** Top-level settings that can switch the tool off or change what it does. */
const KILL_SWITCHES = ['disableAllHooks', 'allowManagedHooksOnly', 'hooks', 'enabledPlugins', 'aegisContext'] as const
const KILL_ENV = 'CLAUDE_CODE_SIMPLE'
const CHANGES = /(?:^|[\s;&|(])(?:rm|rmdir|mv|cp|del|erase|rd|ren|rename|move|copy|truncate|tee|chmod|chown|ln|touch|Remove-Item|Rename-Item|Move-Item|Copy-Item|Set-Content|Add-Content|Clear-Content|Out-File|New-Item|ri|ni)\b|>|sed\s+(?:-\S*\s+)*-i|perl\s+-\S*i|(?:node|python3?|ruby|perl|deno|bun)\s+-\S*[ec]\b/i

export function normalize(path: string, caseless: boolean): string {
  const out: string[] = []
  const raw = path.replace(/\\/g, '/').split('/')
  raw.forEach((part, i) => {
    if (part === '..') {
      if (out.length > 1) out.pop()
    } else if (part !== '.' && (part !== '' || i === 0)) out.push(part)
  })
  const joined = out.join('/')
  return caseless ? joined.toLowerCase() : joined
}

const under = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`)

export function isProtected(path: string, r: Roots): boolean {
  const p = normalize(path, r.caseless)
  return r.own.some(root => under(p, normalize(root, r.caseless)))
}

export function isSettingsFile(path: string, r: Roots): boolean {
  const p = normalize(path, true)
  const name = p.slice(p.lastIndexOf('/') + 1)
  if (name === 'managed-settings.json') return true
  if (name !== 'settings.json' && name !== 'settings.local.json') return false
  return p.endsWith(`/.claude/${name}`) || p === `${normalize(r.config, true)}/${name}`
}

function parse(text: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(text === '' ? '{}' : text) as unknown
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** The setting a change would alter, if it is one that matters. */
export function blockedSettingsChange(before: string, after: string): string | undefined {
  const old = parse(before) ?? {}
  const next = parse(after)
  if (!next) return [...KILL_SWITCHES, KILL_ENV].find(k => after.includes(k))
  for (const key of KILL_SWITCHES) if (!same(old[key], next[key])) return key
  const env = (o: Record<string, unknown>): unknown => (o.env as Record<string, unknown> | undefined)?.[KILL_ENV]
  return same(env(old), env(next)) ? undefined : KILL_ENV
}

/** The command's text with quotes taken out, separators made `/` and `..` resolved, as paths are compared. */
const quotedOrBare = (command: string, caseless: boolean): string => normalize(command.replace(/["'`]/g, ''), caseless).replace(/\/+/g, '/')

/**
 * Each way a shell command may spell a root without hiding it: as it is, through the home folder (`~`, `$HOME`,
 * `$env:USERPROFILE`, `%USERPROFILE%`), through `$CLAUDE_CONFIG_DIR`, and on Windows as `/c/...` (Git Bash, WSL, Cygwin).
 */
function spellings(root: string, r: Roots): string[] {
  const n = normalize(root, r.caseless)
  const out = [n]
  const via = (base: string | undefined, names: string[]): void => {
    if (base === undefined) return
    const b = normalize(base, r.caseless)
    if (!under(n, b)) return
    const rest = n.slice(b.length)
    for (const name of names) out.push(`${r.caseless ? name.toLowerCase() : name}${rest}`)
  }
  via(r.home, ['~', '$HOME', '${HOME}', '$env:HOME', ...(r.windows ? ['$env:USERPROFILE', '${env:USERPROFILE}', '%USERPROFILE%', '%HOMEDRIVE%%HOMEPATH%'] : [])])
  if (r.configVar) via(r.config, ['$CLAUDE_CONFIG_DIR', '${CLAUDE_CONFIG_DIR}', '$env:CLAUDE_CONFIG_DIR', ...(r.windows ? ['%CLAUDE_CONFIG_DIR%'] : [])])
  if (r.windows) {
    const m = /^([a-z]):(\/.*)?$/i.exec(n)
    if (m) {
      const d = (m[1] as string).toLowerCase()
      const rest = m[2] ?? ''
      out.push(`/${d}${rest}`, `/mnt/${d}${rest}`, `/cygdrive/${d}${rest}`)
    }
  }
  return out
}

/** What a shell command would change that it must not, in a word, or nothing. */
export function shellChangesProtected(command: string, r: Roots): string | undefined {
  if (/\bclaude\s+plugins?\s+(?:disable|uninstall|remove)\b/i.test(command)) return 'the plugin'
  if (/\b(?:delete-generic-password\b.*aegiscontext|secret-tool\s+clear\b.*aegiscontext)/i.test(command)) return 'the saved secrets'
  if (!CHANGES.test(command)) return undefined
  const text = quotedOrBare(command, r.caseless)
  if (r.own.some(root => spellings(root, r).some(spelled => text.includes(spelled)))) return "the tool's own files"
  if (/\.claude[\\/]settings(?:\.local)?\.json|managed-settings\.json/i.test(command)) return 'Claude Code settings'
  if ([...KILL_SWITCHES.filter(k => k !== 'hooks' && k !== 'enabledPlugins'), KILL_ENV].some(k => command.includes(k)) && /settings/i.test(command)) return 'Claude Code settings'
  return undefined
}
