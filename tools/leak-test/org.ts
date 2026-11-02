// The kit's guarded and organization modes (plan step 6, spec §5.3 and §22).
//
//   --guarded  the tool loaded as a user plugin on a machine with a real managed settings file. Claude Code's
//              built-in guard (`sec-default@builtin`) seats itself outermost there and passes some events past
//              user-tier mods. The kit measures which doors that opens; GUARDED_OPEN lists them, and the run
//              fails if a listed door is clean or any other door leaks, so the limit in spec §22 stays true.
//              With --hold, the managed file sets on_check_failure: hold, and the same doors must be refused.
//   --org      the organization install: a folder marketplace on the machine, the plugin enabled by managed
//              settings and named in `prependPlugins`, so it runs in the outermost tier. Every door must be clean.
//
// Both write the machine's managed settings file, so they run in CI only (D-020). Each run's debug log is the
// proof that the tool sat in the tier under test, and that the pass-over warning came where it must and nowhere
// else; a log without that proof makes the run invalid, never clean.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { guardWarning } from '../../src/core/guard-check.ts'
import { orgPluginSnippet } from '../../src/core/snippet.ts'
import { releaseFolder, writeArchive } from '../release/pack.ts'
import type { LoginPlan } from './login.ts'
import { GUARDED_ONLY, SCENARIOS, type Scenario } from './scenarios.ts'

export type TierMode = 'guarded' | 'org'

/**
 * Doors the built-in guard passes over for a user-tier plugin, as `scenario/door`. These are measured in CI
 * (`npm run leak-test:guarded`) and every one must leak there. Spec §22 lists the same doors.
 *
 * Measured in CI on 2026-11-01 (Claude Code 2.1.316; the same on macOS, Windows and Linux): project instruction files
 * and settings-hook context leak (7 of 7 fakes each). `mention-file` was expected to leak and stayed clean, so it is
 * not listed. `skill-text` joined from the binary's list of passed-over rows (door `tool-message` from the Skill tool).
 * The compaction summary is stored raw, and the resume check then holds the next message, so the model is
 * not sent it (scenario `compaction-held`); the hold, not the hiding, is what stops it.
 */
export const GUARDED_OPEN: string[] = ['claude-md/claude-md', 'hook-context/hook-context', 'skill-text/skill']

/** The scenarios of the guarded run: all of them, with the compaction door replaced by the one that proves the hold. */
export const guardedScenarios = (): Scenario[] => [...SCENARIOS.filter(s => s.name !== 'compaction'), ...GUARDED_ONLY]

/** The answer that stands in for a request under hold (`guardHeld`). */
export const GUARDED_HOLD_MESSAGE = /this request was not sent/

/** The doors that leak under `allow`, now each to be refused: no request leaves, and the person is told why. */
export const guardedHoldScenarios = (): Scenario[] =>
  GUARDED_OPEN.map(door => {
    const s = SCENARIOS.find(x => x.name === door.split('/')[0])
    if (!s) throw new Error(`no scenario for ${door}`)
    return { ...s, heldMessage: GUARDED_HOLD_MESSAGE }
  })

/** The organization install cannot run the resume door: it needs a run made before the tool was installed. */
export const ORG_SCENARIOS: string[] = [
  'prompt-typed', 'prompt-pasted', 'read-file', 'mention-file', 'bash-output', 'bash-failed', 'bash-large',
  'mcp-result', 'subagent-read', 'compaction', 'claude-md', 'hook-context', 'skill-text',
]

/** The plugin's name in the marketplace, the way the settings name it. */
export const ORG_PLUGIN_ID = 'aegiscontext@aegiscontext'

/** The managed settings of the organization install, pointing at a marketplace folder. */
export function orgManagedContent(marketplaceDir: string): ReturnType<typeof orgPluginSnippet> {
  return orgPluginSnippet(marketplaceDir)
}

/**
 * What an administrator puts on each machine: a release archive of the committed tree, unpacked, with the one folder
 * it holds moved to `dir`. The parent of `dir` must exist.
 */
export function buildMarketplaceFolder(dir: string, repo: string): void {
  const version = (JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { version: string }).version
  const tag = `v${version}`
  const work = fs.mkdtempSync(`${dir}-unpack-`)
  try {
    const name = `${releaseFolder(tag)}.tar.gz`
    writeArchive(repo, tag, path.join(work, name))
    // Relative: GNU tar reads "C:" in an absolute Windows path as a remote host.
    const t = spawnSync('tar', ['-xzf', name], { cwd: work, encoding: 'utf8' })
    if (t.status !== 0) throw new Error(`tar failed: ${(t.stderr || t.error?.message || '').trim().slice(0, 200)}`)
    fs.renameSync(path.join(work, releaseFolder(tag)), dir)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

const MODULE_LINE = /hooks module (\S+) loaded \([^)]*?\btier (\w+)\)/g

/**
 * What a debug log must show for a run to count: our plugin loaded in the tier under test, and no sign that
 * the built-in guard was left out. Returns the problem, or undefined when the log proves the tier.
 */
export function tierProblem(log: string, mode: TierMode, plan?: LoginPlan): string | undefined {
  if (/\bnot seated\b/.test(log)) return 'the debug log says the built-in guard was "not seated", so the machine is not set up as the run claims'
  const want = mode === 'org' ? 'prepend' : 'user'
  const ours = [...log.matchAll(MODULE_LINE)].filter(m => (m[1] ?? '').startsWith('aegiscontext@'))
  if (ours.length === 0) return 'the debug log shows the tool never loaded its hooks module'
  const wrong = ours.find(m => m[2] !== want)
  if (wrong) return `the tool loaded in tier ${wrong[2]}, not tier ${want}`
  if (mode === 'guarded' && !/sec-default@builtin seated outermost/.test(log)) return 'the debug log never shows the built-in guard seated; the managed settings file may not have been read'
  if (mode === 'org' && !/sec-default@builtin seated by managed prependPlugins/.test(log)) return 'the debug log never shows the built-in guard seated by prependPlugins'
  // Also proves no managed file was left on the machine: with one, the log gives that as the reason instead.
  if (plan !== undefined && !log.includes(`sec-default@builtin seated outermost: the organization is ${plan}`)) return `the debug log never shows the built-in guard seated by a ${plan} login`
  return undefined
}

/**
 * What the plugin's log must show in an observe run. Every fake being seen proves nothing by itself, because a tool
 * that never ran gives the same result; the log's "would have hidden" lines are what separate the two.
 */
export function observeProblem(log: string): string | undefined {
  if (log.includes('"action":"hide"')) return 'the plugin hid a value in observe mode'
  if (!log.includes('"action":"would-hide"')) return 'the plugin log has no "would have hidden" line, so nothing proves observe mode ran'
  return undefined
}

/**
 * The pass-over warning against the debug logs of one scenario's runs (`$.ui.log` writes there): the organization
 * install must never show it, and a guarded scenario that sent a request must. A scenario stopped before any request
 * proves nothing either way, since the warning comes at the first main step.
 */
export function warningProblem(log: string, mode: TierMode, sentRequest: boolean): string | undefined {
  const shown = log.includes(guardWarning())
  if (mode === 'org' && shown) return 'the debug log shows the pass-over warning, so a guard passed the organization install over'
  if (mode === 'guarded' && sentRequest && !shown) return 'a request was sent under the guard and the debug log shows no pass-over warning'
  return undefined
}
