// aegiscontext's hooks (spec §5.1): every row, prompt and context block is cleaned before it is stored
// or sent. Each hook has a `.catch`, so a failure follows `on_check_failure` instead of the engine's
// default of letting the content through (R-03, spec §12).
//
// The bodies are in handlers.ts. The engine lets `$` pass only to functions declared or imported at
// the top of a file, so the hooks call those and keep `next` for themselves.

import type { Register, TurnStepChunk, TurnStepResult } from 'claude-code'
import { cleanAppend, cleanAttachment, cleanContext, cleanSubmit, failedAppend, failedAttachment, failedCompose, failedContext, failedGate, failedLifecycle, failedSubmit, PLACEHOLDER_NOTE, shutDown, startUp, stillRunning } from './handlers.ts'
import { NOTE_ID } from './lib/core/note.ts'
import { DOCTOR, doctor, isOwnCommandCall, isPerson, redactCommand } from './commands.ts'
import { checkMention, failedMention } from './mention.ts'
import { failureMode } from './runtime.ts'
import { resumeBlock, safeResumeBlock } from './resume.ts'
import { afterTool, askReason, beforeTool } from './tools.ts'
import { drawBanner } from './banner.tsx'
import { drawAdd, drawLearn, drawRemove } from './panes.tsx'
import { checkGuard, markComposeSeen, noteOrigin } from './guard.ts'

/** An answer in place of a request. The engine shows and records what a step streams, never what it returns. */
function* heldAnswer(e: { turnId: string; index: number }, answer: string): Generator<TurnStepChunk, TurnStepResult> {
  yield { kind: 'text', index: 0, text: answer }
  yield { kind: 'stop', stopReason: 'end_turn', usage: null }
  return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: null }
}

export const register: Register = on => {
  // All hiding: every row the conversation keeps passes through here before it is stored.
  on('session.append', async ($, e, next) => {
    const message = await cleanAppend($, e)
    return next(message === e.message ? e : { ...e, message })
  }).catch(async ($, e, next) => {
    // After next was called the row is stored; replay it as it settled.
    if (next.called) return next(e)
    const message = await failedAppend($, e, next.error.kind)
    return next(message === e.message ? e : { ...e, message })
  })

  // The prompt as typed, before it is recorded anywhere. A slash command's line goes to session.append.
  on('prompt.submit', async ($, e, next) => {
    await stillRunning($)
    if (e.command?.name !== 'redact' && e.command?.name !== DOCTOR) {
      const reason = await safeResumeBlock($)
      if (reason) return { drop: reason }
    }
    if (e.command) return next(e)
    const out = await cleanSubmit($, e)
    if ('drop' in out) return { drop: out.drop }
    return next({ ...e, text: out.text, ...(out.context ? { context: out.context } : {}) })
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    const out = await failedSubmit($, next.error.kind)
    return out && 'drop' in out ? { drop: out.drop } : next(e)
  })

  // The project's instruction files and other context blocks of a conversation's first message.
  on('prompt.context', async ($, e, next) => next({ ...e, blocks: await cleanContext($, e) })).catch(async ($, e, next) => {
    if (next.called) return next(e)
    return next({ ...e, blocks: await failedContext($, e, next.error.kind) })
  })

  // Messages the engine injects for the model, rendered per request (a second layer behind session.append).
  on('prompt.attachment', async ($, e, next) => next({ ...e, text: await cleanAttachment($, e) })).catch(async ($, e, next) => {
    if (next.called) return next(e)
    return next({ ...e, text: await failedAttachment($, e, next.error.kind) })
  })

  // The note is fixed text, added last, so it is the same for the whole thread and the prompt cache holds.
  on('prompt.compose', async ($, e, next) => {
    await markComposeSeen($)
    const out = await next(e)
    return { sections: [...out.sections, { id: NOTE_ID, text: PLACEHOLDER_NOTE, scope: 'session' as const }] }
  }).catch(async ($, e, next) => {
    await failedCompose($, next.error.kind)
    return next(e)
  })

  // A resumed history with a secret: compaction would send it too (R-06).
  on('session.compact', async ($, e, next) => {
    const reason = await resumeBlock($)
    return reason ? { skip: reason } : next(e)
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    const held = (await failureMode($)) === 'hold'
    await failedGate($, 'compact', 'compaction', next.error.kind, held)
    return held ? { skip: 'aegiscontext could not check this session, so it was not compacted.' } : next(e)
  })

  // The backstop for a turn with no prompt: the request is held and never sent.
  on('turn.step', async function* ($, e, next) {
    const reason = (await checkGuard($, e.agentId)) ?? (await resumeBlock($))
    if (!reason) return yield* next(e)
    return yield* heldAnswer(e, reason)
  }).catch(async function* ($, e, next) {
    // The request went, and this failure is its own. A stream's next would send it again, so pass the failure on.
    if (next.called) throw new Error(next.error.message ?? 'the request failed')
    const held = (await failureMode($)) === 'hold'
    await failedGate($, 'turn', 'a request to the model', next.error.kind, held)
    if (!held) return yield* next(e)
    return yield* heldAnswer(e, 'aegiscontext could not check this session, so the request was not sent.')
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    if (isOwnCommandCall(String(e.tool), input)) return { deny: 'Only the user can run this command.' }
    const deny = await beforeTool($, String(e.tool), input)
    if (deny) return { deny: `aegiscontext: ${deny}` }
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await afterTool($, String(e.tool), input).catch(() => undefined)
    return ran
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    const held = (await failureMode($)) === 'hold'
    await failedGate($, 'tool', 'a tool call', next.error.kind, held)
    return held ? { deny: 'aegiscontext could not check this call, so it was stopped.' } : next(e)
  })

  on('tool.check', async ($, e, next) => {
    const reason = await askReason($, e.tool, e.input)
    return reason ? { decision: 'ask' as const, reason } : next(e)
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    const held = (await failureMode($)) === 'hold'
    await failedGate($, 'tool-check', 'a tool call', next.error.kind, held)
    return held ? { decision: 'deny' as const, reason: 'aegiscontext could not check this call.' } : next(e)
  })

  on('prompt.mention', async ($, e, next) => {
    const out = await checkMention($, e.path)
    if (out === 'as-is') return next(e)
    if ('deny' in out) return { deny: out.deny }
    const read = await next({ ...e, path: out.path })
    // The engine would not attach the copy: the redacted text goes as context instead, never the file.
    return read.deny === undefined && read.type === null ? { ...read, context: [...(read.context ?? []), out.text] } : read
  }).catch(async ($, e, next) => {
    if (next.called) return next(e)
    const deny = await failedMention($, next.error.kind, (await failureMode($)) === 'hold')
    return deny ? { deny } : next(e)
  })

  // Our own `$.command.list()` call passes here with the tier this plugin sits in, which doctor reports.
  on('command.list', async (_$, e, next) => {
    noteOrigin(next.origin)
    return next(e)
  })

  on('command.run', { command: 'redact' }, async ($, e) => {
    if (!isPerson(e.origin?.kind)) return { text: 'Only you can run /redact.' }
    return { text: await redactCommand($, e.args) }
  })

  // The plain command answers when the hooks are off; while they run, this answers it instead (R-05).
  on('command.run', { command: DOCTOR }, async $ => ({ text: await doctor($) }))

  on('ui.render', { component: 'Pane', requestId: 'aegiscontext-add' }, ($, e) => drawAdd($, e))
  on('ui.render', { component: 'Pane', requestId: 'aegiscontext-learn' }, ($, e) => drawLearn($, e))
  on('ui.render', { component: 'Pane', requestId: 'aegiscontext-remove' }, ($, e) => drawRemove($, e))
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => drawBanner($, e, next))

  on('session.start', async ($, e, next) => {
    await startUp($)
    return next(e)
  }).catch(async ($, e, next) => {
    await failedLifecycle($, 'start', next.error.kind)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await shutDown($)
    return next(e)
  }).catch(async ($, e, next) => {
    await failedLifecycle($, 'end', next.error.kind)
    return next(e)
  })
}
