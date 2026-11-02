// The notes added to Claude's instructions (spec §5.1, §9). They are fixed text, the same for a whole thread, because
// changing one later breaks the prompt cache. The put-back note exists only while put-back is on (D-096).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { NOTE_ID, PLACEHOLDER_NOTE, PUT_BACK_NOTE, PUT_BACK_NOTE_ID } from '../src/core/note.ts'

test('the placeholder note is the one that was released: put-back must not change it', () => {
  // Read from src/core/note.ts at the start of step 8, before put-back.
  assert.equal(createHash('sha256').update(PLACEHOLDER_NOTE).digest('hex'), 'fea8c6505804cc403d5a5445d0bfcd900016906f88dda302c7ad09b95b57750d')
  assert.equal(NOTE_ID, 'aegiscontext:placeholders')
})

test('the put-back note has its own id and says what changes', () => {
  assert.notEqual(PUT_BACK_NOTE_ID, NOTE_ID)
  assert.match(PUT_BACK_NOTE_ID, /^aegiscontext:/)
  for (const word of ['Edit', 'placeholder', 'already', 'new file']) assert.ok(PUT_BACK_NOTE.includes(word), word)
  assert.ok(PUT_BACK_NOTE.length < 1200, 'short, it is sent on every request')
})

test('the put-back note says the real value is still not available to Claude', () => {
  assert.match(PUT_BACK_NOTE, /not available to you|still can't see|never see/i)
})
