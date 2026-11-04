// The Claude Code versions a pull request adds to the tested list, for .github/workflows/versions.yml.
// Usage: node tools/ci/added-versions.ts <base commit>   prints `versions=["2.1.318",...]` for $GITHUB_OUTPUT.
// The head list is read from the working tree, the base list from git. Every entry must be an exact version: anything
// else stops the run, so nothing odd ever reaches a shell or an npm install.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const LIST_FILE = path.join('src', 'core', 'versions.ts')
const EXACT = /^\d+\.\d+\.\d+$/

/** The versions in the TESTED_VERSIONS array of a versions.ts text, in order. Throws on anything it can't read. */
export function listedVersions(text: string): string[] {
  const body = /TESTED_VERSIONS[^=]*=\s*\[([^\]]*)\]/.exec(text)?.[1]
  if (body === undefined) throw new Error('no TESTED_VERSIONS array found')
  const items = body.split(',').map(s => s.trim()).filter(s => s !== '')
  return items.map(item => {
    const v = /^(['"])(.*)\1$/.exec(item)?.[2]
    if (v === undefined || !EXACT.test(v)) throw new Error(`not an exact version in TESTED_VERSIONS: ${item.slice(0, 40)}`)
    return v
  })
}

/** Versions in the head list that the base list lacks, in head order. No base list means all of them. */
export function addedVersions(head: string, base: string | undefined): string[] {
  const before = new Set(base === undefined ? [] : listedVersions(base))
  return listedVersions(head).filter(v => !before.has(v))
}

function main(): void {
  const baseSha = process.argv[2] ?? ''
  if (!/^[0-9a-f]{40}$/.test(baseSha)) throw new Error('usage: added-versions.ts <40-hex base commit>')
  const head = fs.readFileSync(LIST_FILE, 'utf8')
  let base: string | undefined
  try {
    base = execFileSync('git', ['show', `${baseSha}:${LIST_FILE.split(path.sep).join('/')}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    base = undefined
  }
  const added = addedVersions(head, base)
  console.error(added.length ? `versions to test: ${added.join(', ')}` : 'no version added to the tested list')
  console.log(`versions=${JSON.stringify(added)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main()
