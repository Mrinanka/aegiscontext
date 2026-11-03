// The notes added to Claude's instructions (spec §9). Each must be the same for the whole thread, so each is a
// fixed string: changing one later would break the prompt cache.

export const NOTE_ID = 'aegiscontext:placeholders'

export const PLACEHOLDER_NOTE = [
  'Some values in this conversation are hidden. A hidden value shows as a placeholder such as [REDACTED:LABEL ...last4 #tag]: the label says what kind of value it was and the tag identifies it. A placeholder is not an error. The real value is not available to you.',
  '',
  '- Do not ask for a hidden value and do not try to guess it.',
  '- Do not use the Edit tool on a line that contains a placeholder. If you must rewrite a whole file, keep each line that holds a placeholder exactly as it is.',
  '- When a real value is needed, say which placeholder and ask the user to fill it in themselves.',
  '- Where you mean the same value, write the same placeholder.',
].join('\n')

/** Added only in a session that started with put-back on (spec §10, D-096). */
export const PUT_BACK_NOTE_ID = 'aegiscontext:put-back'

export const PUT_BACK_NOTE = [
  'Put-back is on in this session, which changes the Edit rule above. When you write a placeholder into a file that already holds that hidden value, the real value is put in as the file is saved. The real value is still not available to you.',
  '',
  '- You may rewrite such a file, and you may use the Edit tool on a line that contains a placeholder. Copy the placeholder exactly.',
  '- Write a placeholder no more times than the file already holds that value. A copy beyond that stays as the placeholder text.',
  '- A placeholder in a new file, or for a value the file does not hold, stays as text. The user fills those in.',
].join('\n')
