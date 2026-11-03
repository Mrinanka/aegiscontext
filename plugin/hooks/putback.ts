// Put-back in the hooks (spec §10, D-096): the developer's choice file, who decides right now, the notice that a
// project turned it on, and whether this session's instructions carry the extra note. The rules are in
// lib/core/putback.ts. Nothing here holds a value: the choice file keeps folder paths and on or off.

import type { EngineInterface } from 'claude-code'
import { osOf } from './backends.ts'
import { now as clock } from './lib/core/decoder.ts'
import { changeChoice, choiceFacts, folderKey, parseChoice, resolvePutBack, serializeChoice, type Choice, type PutBackDecision, type Switch } from './lib/core/putback.ts'
import { writeLog } from './log-file.ts'
import { dataDir, joinPath } from './paths.ts'
import type { Runtime } from './runtime.ts'

export const CHOICE_FILE = 'put-back.json'

export async function choicePath($: EngineInterface): Promise<string> {
  return joinPath(await dataDir($), CHOICE_FILE)
}

/** The file is not there: no choice. It is there and can't be trusted: unreadable, which reads as off. */
async function readChoice($: EngineInterface): Promise<{ choice: Choice; unreadable: boolean }> {
  try {
    const path = await choicePath($)
    if (!(await $.fs.exists(path))) return { choice: {}, unreadable: false }
    const choice = parseChoice(String(await $.fs.read(path)))
    return choice ? { choice, unreadable: false } : { choice: {}, unreadable: true }
  } catch {
    return { choice: {}, unreadable: true }
  }
}

export type PutBackNow = PutBackDecision & { folder: string }

/**
 * The folder a `--here` choice is for: the project root. A shell `cd` moves `cwd()` but not the root (R-18), and the
 * project settings are read for the root too.
 */
async function projectFolder($: EngineInterface): Promise<string> {
  return $.session.root()
}

/** Who decides, with the settings and the choice file as they are now (spec §10). */
export async function putBackNow($: EngineInterface, rt: Runtime): Promise<PutBackNow> {
  const { choice, unreadable } = await readChoice($)
  const folder = await projectFolder($)
  // Whether case counts only matters when there is a folder to compare (on macOS and Linux it starts a process).
  const hasFolders = Object.keys(choice.folders ?? {}).length > 0
  const caseless = hasFolders ? (await osOf($)) !== 'linux' : false
  const { all, here } = choiceFacts(choice, folder, caseless)
  const canShow = (await $.session.surfaces()).length > 0
  const settings = rt.settings.put_back ?? { managedOff: false }
  const decision = resolvePutBack({
    managedOff: settings.managedOff === true,
    ...(settings.repo ? { repo: settings.repo } : {}),
    ...(all ? { all } : {}),
    ...(here ? { here } : {}),
    canShow,
    unreadable,
    observe: rt.settings.mode === 'observe',
  })
  return { ...decision, folder }
}

/**
 * Saves the developer's choice for all projects, or for this folder only. Says whether the file was there and could
 * not be read: its earlier choices are then gone, and the person is told so.
 */
export async function saveChoice($: EngineInterface, value: Switch, here: boolean): Promise<{ replacedUnreadable: boolean }> {
  const { choice, unreadable } = await readChoice($)
  const caseless = (await osOf($)) !== 'linux'
  const next = changeChoice(choice, { value, ...(here ? { here: folderKey(await projectFolder($), caseless) } : {}) })
  await $.fs.write(await choicePath($), serializeChoice(next))
  return { replacedUnreadable: unreadable }
}

/** Shown once a session, always, even with `notices: off`: a project turned on something that is off by default. */
export async function repoNotice($: EngineInterface, rt: Runtime, now: PutBackNow): Promise<void> {
  if (!now.repoNotice) return
  const key = { plugin: 'aegiscontext', key: 'putBackNoticed' } as const
  if ((await $.state.get(key)).value === true) return
  await $.state.set(key, true)
  const name = rt.redactor.redactText(now.folder.slice(Math.max(now.folder.lastIndexOf('/'), now.folder.lastIndexOf('\\')) + 1), { deadline: clock() + 500 }).text
  const line = `This project (${name}) turned on put-back: when Claude writes a file that already holds a hidden value, the real value is put back as it saves. To turn it off for you, run /redact put-back off.`
  try {
    $.ui.log(line)
    $.ui.toast(line)
  } catch {
    // Showing a notice must never stop a tool call.
  }
  await writeLog($, [{ t: await $.clock.now(), event: 'notice', door: 'put-back', mode: rt.settings.mode, detail: 'a project turned put-back on' }], text => text)
}

/**
 * Whether this session's instructions carry the put-back note. Decided once, at the first compose, because the note
 * must be the same for the whole thread (spec §5.1): turning put-back on later takes effect at once for restoring,
 * and the note waits for a new session.
 */
export async function putBackNoteOn($: EngineInterface, rt: Runtime): Promise<boolean> {
  const key = { plugin: 'aegiscontext', key: 'putBackNote' } as const
  const kept = (await $.state.get(key)).value
  if (typeof kept === 'boolean') return kept
  const on = (await putBackNow($, rt)).on
  await $.state.set(key, on)
  return on
}
