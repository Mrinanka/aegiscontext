// The panes behind `/redact add`, `learn` and `remove` (spec §8). A value goes from the field to the OS
// store and nowhere else: it is never drawn back, never put in $.state and makes no row. What $.state
// holds for these panes is names, dates, lengths and ticks. The field has no masking, so a value shows
// while it is typed (plan step 4, section 6).

import type { EngineInterface, UiRenderInput } from 'claude-code'
import { addToList, removeFromList } from './backends.ts'
import { now } from './lib/core/decoder.ts'
import { validRegistered } from './lib/core/envfile.ts'
import { outboundText } from './lib/core/outbound.ts'
import { StoreFull } from './lib/core/store.ts'
import { writeLog } from './log-file.ts'
import { ready, registeredChanged } from './runtime.ts'

const ADD_PANE = 'aegiscontext-add'
const LEARN_PANE = 'aegiscontext-learn'
const REMOVE_PANE = 'aegiscontext-remove'

/** The values `/redact learn` found, by row id, in the worker's memory only. */
export const learnValues = new Map<string, string>()
/** The values `/redact remove` listed, by row id, in the worker's memory only. A restarted worker has none. */
export const removeValues = new Map<string, string>()

async function today($: EngineInterface): Promise<string> {
  return new Date(await $.clock.now()).toISOString().slice(0, 10)
}

/** R-07: how many times a value is in this session's stored history. */
async function timesSent($: EngineInterface, value: string): Promise<number> {
  const rt = await ready($)
  const history = (await $.session.messages({ as: 'api' })) as unknown as { content: { type?: string }[] }[]
  const deadline = now() + 3000
  let n = 0
  for (const m of history) {
    const text = outboundText(m.content.filter(b => b.type !== 'image' && b.type !== 'document'))
    n += rt.redactor.findKnown(text, deadline).hits.filter(h => rt.redactor.valueOfTag(h.tag) === value).length
  }
  return n
}

function storeWords(error: unknown): string {
  return error instanceof StoreFull ? 'The list is full for this password store, so nothing was saved.' : 'The password store did not take it, so nothing was saved.'
}

async function submitAdd($: EngineInterface, value: string): Promise<void> {
  const note = { plugin: 'aegiscontext', key: 'addNote' } as const
  const problem = validRegistered(value)
  if (problem) {
    await $.state.set(note, { text: `That value is ${problem}. It must be 6 to 8,192 characters.`, isError: true })
    return
  }
  const held = (await $.state.get(note)).value?.text
  const label = held?.startsWith('Label: ') ? held.slice(7) : 'registered'
  try {
    await addToList($, [{ value, label, added: await today($) }])
  } catch (error) {
    await $.state.set(note, { text: storeWords(error), isError: true })
    return
  }
  registeredChanged()
  const sent = await timesSent($, value).catch(() => 0)
  await $.ui.close({ id: ADD_PANE })
  $.ui.log(sent > 0 ? `Saved. This value was already sent to the model ${sent} times this session. Consider rotating it.` : 'Saved. It is hidden from now on.')
}

async function saveLearned($: EngineInterface): Promise<void> {
  const rows = (await $.state.get({ plugin: 'aegiscontext', key: 'learnRows' })).value ?? []
  const added = await today($)
  const ticked = rows.filter(r => r.ticked).flatMap(r => {
    const value = learnValues.get(r.id)
    return value === undefined ? [] : [{ value, label: r.key, added }]
  })
  // The same rule as /redact add: a value under 6 characters would hide every "true" or "3000" it meets.
  const entries = ticked.filter(e => validRegistered(e.value) === undefined)
  const skipped = ticked.length - entries.length
  try {
    const saved = await addToList($, entries)
    learnValues.clear()
    registeredChanged()
    await $.ui.close({ id: LEARN_PANE })
    const already = entries.length - saved
    $.ui.log(
      `saved ${saved} of ${rows.length} values.` +
        (skipped > 0 ? ` ${skipped} skipped: a value must be 6 to 8,192 characters.` : '') +
        (already > 0 ? ` ${already} already saved.` : ''),
    )
  } catch (error) {
    await $.state.set({ plugin: 'aegiscontext', key: 'learnNote' }, { text: storeWords(error), isError: true })
  }
}

async function saveRemoved($: EngineInterface): Promise<void> {
  const note = { plugin: 'aegiscontext', key: 'removeNote' } as const
  const rows = (await $.state.get({ plugin: 'aegiscontext', key: 'removeRows' })).value ?? []
  const ticked = rows.filter(r => r.ticked)
  if (ticked.length === 0) {
    await $.state.set(note, { text: 'Nothing is ticked.', isError: true })
    return
  }
  const values = ticked.flatMap(r => removeValues.get(r.id) ?? [])
  if (values.length < ticked.length) {
    await $.state.set(note, { text: 'This list is out of date, so nothing was removed. Press Esc and run /redact remove again.', isError: true })
    return
  }
  let removed
  try {
    removed = await removeFromList($, values)
  } catch {
    await $.state.set(note, { text: 'The password store did not take it, so nothing was removed.', isError: true })
    return
  }
  removeValues.clear()
  registeredChanged()
  await $.state.set({ plugin: 'aegiscontext', key: 'removeRows' }, [])
  await $.ui.close({ id: REMOVE_PANE })
  const words = `${removed} saved value${removed === 1 ? '' : 's'}`
  await writeLog($, [{ t: await $.clock.now(), event: 'notice', door: 'command', where: 'remove', detail: `removed ${words}` }], t => t)
  $.ui.log(`Removed ${words}. A value with a known shape stays hidden by its rule.`)
}

async function toggleRemove($: EngineInterface, id: string): Promise<void> {
  const key = { plugin: 'aegiscontext', key: 'removeRows' } as const
  const rows = (await $.state.get(key)).value ?? []
  await $.state.set(key, rows.map(r => (r.id === id ? { ...r, ticked: !r.ticked } : r)))
}

async function toggle($: EngineInterface, id: string): Promise<void> {
  const key = { plugin: 'aegiscontext', key: 'learnRows' } as const
  const rows = (await $.state.get(key)).value ?? []
  await $.state.set(key, rows.map(r => (r.id === id ? { ...r, ticked: !r.ticked } : r)))
}

export async function drawAdd($: EngineInterface, e: UiRenderInput) {
  const { Box, Input, Text } = $.ui.resolve(e) as never as Record<string, (...a: never[]) => never>
  // This surface has no text field.
  if (!Input) return <Text>Open this session on a computer to add a secret.</Text>
  const note = (await $.state.get({ plugin: 'aegiscontext', key: 'addNote' })).value
  return (
    <Box flexDirection="column">
      <Text>Paste the secret and press Enter. It stays out of the chat. Esc cancels.</Text>
      <Input key="value" label="Secret: " autoFocus submitLabel="save" onSubmit={(value: string) => submitAdd($, value)} />
      {note ? <Text color={note.isError ? 'error' : undefined}>{note.text}</Text> : null}
    </Box>
  )
}

export async function drawRemove($: EngineInterface, e: UiRenderInput) {
  const { Box, Button, Text } = $.ui.resolve(e) as never as Record<string, (...a: never[]) => never>
  const rows = (await $.state.get({ plugin: 'aegiscontext', key: 'removeRows' })).value ?? []
  const note = (await $.state.get({ plugin: 'aegiscontext', key: 'removeNote' })).value
  return (
    <Box flexDirection="column">
      <Text>Tick what to stop remembering. Values are not shown. Esc cancels.</Text>
      {rows.map(r => (
        <Button key={r.id} plain label={`${r.ticked ? '[x]' : '[ ]'} ${r.label}, added ${r.added} (${r.length} characters)`} onPress={() => toggleRemove($, r.id)} />
      ))}
      <Button key="remove" variant="primary" label="Remove" onPress={() => saveRemoved($)} />
      {note ? <Text color={note.isError ? 'error' : undefined}>{note.text}</Text> : null}
    </Box>
  )
}

export async function drawLearn($: EngineInterface, e: UiRenderInput) {
  const { Box, Button, Text } = $.ui.resolve(e) as never as Record<string, (...a: never[]) => never>
  const rows = (await $.state.get({ plugin: 'aegiscontext', key: 'learnRows' })).value ?? []
  const note = (await $.state.get({ plugin: 'aegiscontext', key: 'learnNote' })).value
  return (
    <Box flexDirection="column">
      <Text>Tick what to remember. Values are not shown.</Text>
      {rows.slice(0, 200).map(r => (
        <Button key={r.id} plain label={`${r.ticked ? '[x]' : '[ ]'} ${r.key} (${r.length} characters) ${r.file}`} onPress={() => toggle($, r.id)} />
      ))}
      <Button key="save" variant="primary" label="Save" onPress={() => saveLearned($)} />
      {note ? <Text color={note.isError ? 'error' : undefined}>{note.text}</Text> : null}
    </Box>
  )
}
