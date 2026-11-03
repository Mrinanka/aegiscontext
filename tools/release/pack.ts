// npm run release:pack -- <tag>   (plan step 6, spec §19)
//
// Makes the release archives of the committed tree: aegiscontext-<tag>.tar.gz and .zip, by `git archive`, and
// SHA256SUMS beside them. It refuses a tree that is not clean (a file changed, new or staged), a tag that is not
// v<version> or v<version>-rc.N, a tag whose version is not the one in package.json, and an output folder that
// already holds archives. It writes nothing when it refuses. It signs nothing and publishes nothing: the maintainer
// signs the tag (spec §19, D-094), and the release workflow makes a draft release.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const NAME = 'aegiscontext'
const TAG = /^v(\d+\.\d+\.\d+)(?:-rc\.\d+)?$/

export class ReleaseError extends Error {}

/** The problem with a tag, or undefined when it is v<version> (or -rc.N) and matches `version`. */
export function checkTag(tag: string, version: string): string | undefined {
  const m = TAG.exec(tag)
  if (!m) return `the tag "${tag.slice(0, 40)}" is not of the form v<major>.<minor>.<patch> or v<major>.<minor>.<patch>-rc.<n>`
  if (m[1] !== version) return `the tag ${tag} does not match the version ${version} in package.json`
  return undefined
}

function git(root: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) throw new ReleaseError(`git ${args[0]} failed: ${(r.stderr || r.error?.message || '').trim().slice(0, 200)}`)
  return r.stdout
}

export const sha256Of = (file: string): string => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

export type Sum = { hash: string; name: string }

export function parseSums(text: string): Sum[] {
  return text.split('\n').filter(l => l.trim() !== '').map(l => {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(l)
    if (!m) throw new ReleaseError(`bad line in SHA256SUMS: ${l.slice(0, 80)}`)
    return { hash: m[1] as string, name: m[2] as string }
  })
}

/** The problem with the archives in `dir` against its SHA256SUMS, or undefined when every one matches. */
export function verifySums(dir: string): string | undefined {
  const file = path.join(dir, 'SHA256SUMS')
  if (!fs.existsSync(file)) return `no SHA256SUMS in ${dir}`
  for (const s of parseSums(fs.readFileSync(file, 'utf8'))) {
    const target = path.join(dir, s.name)
    if (!fs.existsSync(target)) return `${s.name} is listed but missing`
    if (sha256Of(target) !== s.hash) return `${s.name} does not match its checksum`
  }
  return undefined
}

/** The one folder an archive holds, which is the marketplace folder (docs/managed.md). */
export const releaseFolder = (tag: string): string => `${NAME}-${tag}`

/** `git archive` of HEAD into `file`, in the format its name says. */
export function writeArchive(root: string, tag: string, file: string): void {
  git(root, ['archive', `--format=${file.endsWith('.zip') ? 'zip' : 'tar.gz'}`, `--prefix=${releaseFolder(tag)}/`, '-o', file, 'HEAD'])
}

export type PackOptions = { root: string; tag: string; out: string }

export function packRelease(o: PackOptions): { files: string[] } {
  const pkg = JSON.parse(fs.readFileSync(path.join(o.root, 'package.json'), 'utf8')) as { version: string }
  const bad = checkTag(o.tag, pkg.version)
  if (bad) throw new ReleaseError(bad)
  if (git(o.root, ['status', '--porcelain']).trim() !== '') throw new ReleaseError('the working tree is not clean (a file is changed, new or staged): commit or remove it first')
  const archives = ['tar.gz', 'zip'].map(ext => `${releaseFolder(o.tag)}.${ext}`)
  if (archives.some(f => fs.existsSync(path.join(o.out, f)))) throw new ReleaseError(`${o.out} already holds archives for ${o.tag}`)
  fs.mkdirSync(o.out, { recursive: true })
  for (const f of archives) writeArchive(o.root, o.tag, path.join(o.out, f))
  const sums = archives.map(f => `${sha256Of(path.join(o.out, f))}  ${f}\n`).join('')
  fs.writeFileSync(path.join(o.out, 'SHA256SUMS'), sums)
  const problem = verifySums(o.out)
  if (problem) throw new ReleaseError(`the checksums did not verify: ${problem}`)
  return { files: [...archives, 'SHA256SUMS'] }
}

function main(): void {
  const root = path.join(import.meta.dirname, '..', '..')
  const tag = process.argv[2]
  if (!tag) {
    console.error('usage: npm run release:pack -- <tag>   (for example v0.1.0-rc.1)')
    process.exit(2)
  }
  const out = path.join(root, 'dist', 'release')
  try {
    const r = packRelease({ root, tag, out })
    console.log(`wrote ${r.files.join(', ')} to ${out}`)
  } catch (e) {
    if (!(e instanceof ReleaseError)) throw e
    console.error(`release:pack: ${e.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
