// The doors: every way a secret can reach the model (spec §6, plan 1a). Each
// scenario is one or more `claude -p` runs in a fresh folder, played against the
// mock. Each door gets its own fakes, in several forms, and a witness: a harmless
// token next to them that proves the door was really used.
//
// Fakes never appear in a tool call the mock sends: a command names a file, and
// the file holds the fake. Only the compaction summary comes from the mock itself,
// because there the model repeating a secret is the thing under test.

import path from 'node:path'
import type { ParsedRequest, Reply, Script } from './server.ts'

export type Ctx = {
  dir: string
  /** The door's witness and fakes, one per line. */
  block: (door: string) => string
  witness: (door: string) => string
  /** The witness and the door's fake values, one per line, with no label or other sign. */
  bare: (door: string) => string
}

export type Run = {
  prompt: (c: Ctx) => string
  /** Piped to `claude -p` on stdin, as pasted text. */
  stdin?: (c: Ctx) => string
  /** Resume the session of the scenario's first run. */
  resume?: boolean
  /** Run without the tool, as a session recorded before it was installed. */
  withoutPlugin?: boolean
  script: (c: Ctx) => Script
}

export type Scenario = {
  name: string
  doors: string[]
  /** Only requests from this run on count, for a door about what a later run sends. */
  countFromRun?: number
  files?: (c: Ctx) => Record<string, string | Uint8Array>
  /** The door whose block a connected tool returns. */
  mcp?: string
  /** The door whose block a settings hook adds as context. */
  contextHook?: string
  /** With the tool on, this door is proven by being stopped: no request, and this on stdout. */
  heldMessage?: RegExp
  /** The same, when the backup lock is the tool: a blocked prompt is shown with the lock's own reason. */
  heldBackup?: RegExp
  /** Saves the door's values in the real OS store first (needs --allow-real-store, except on Windows). */
  seedStore?: string
  runs: Run[]
}

/** What `claude -p` prints when the backup lock stops a prompt. */
const BACKUP_BLOCKED = /aegiscontext \(backup lock\): your message holds a secret/

export const MCP_TOOL = 'mcp__leak__get_note'

export const ALLOWED_TOOLS = ['Read', 'Bash', 'PowerShell', 'Agent', 'Task', 'Skill', MCP_TOOL]

const LARGE_OUTPUT = 200 * 1024

const text = (t: string): Reply => ({ kind: 'text', text: t })
const tool = (name: string, input: Record<string, unknown>): Reply => ({ kind: 'tool', name, input })

const isSummaryRequest = (r: ParsedRequest): boolean => /summary of the conversation|detailed summary|summarize the conversation/i.test(r.lastUserText)
const isSub = (r: ParsedRequest): boolean => r.firstUserText.includes('SUBAGENT-TASK')
const assistantTurns = (r: ParsedRequest): number => r.messages.filter(m => m.role === 'assistant').length
const subagentTool = (r: ParsedRequest): string => (r.toolNames.includes('Agent') ? 'Agent' : 'Task')
// Git Bash is optional on Windows; without it Claude Code offers PowerShell (docs: setup).
const shellTool = (r: ParsedRequest): string => (r.toolNames.includes('Bash') ? 'Bash' : 'PowerShell')

type Step = (r: ParsedRequest) => Reply

function steps(main: Step[], opts: { sub?: Step[]; summary?: string } = {}): Script {
  return r => {
    if (isSummaryRequest(r)) return text(opts.summary ?? 'Summary: nothing to note.')
    if (!r.hasTools) return text('ok')
    const k = assistantTurns(r)
    if (isSub(r)) return (opts.sub ?? [])[k]?.(r) ?? text('sub-done')
    return main[k]?.(r) ?? text('done')
  }
}

const read = (c: Ctx, file: string): Step => () => tool('Read', { file_path: path.join(c.dir, file) })
const shell = (command: string): Step => r => tool(shellTool(r), { command, description: 'leak test command' })

// Run by the shell tool, so it works in Bash and PowerShell on every OS.
const PRINT = [
  "import fs from 'node:fs'",
  'const [file, fail] = process.argv.slice(2)',
  'const text = fs.readFileSync(file, "utf8")',
  'if (fail) { process.stderr.write(text); process.exit(3) }',
  'process.stdout.write(text)',
].join('\n')

const crlf = (s: string): string => s.replace(/\n/g, '\r\n')

export const SCENARIOS: Scenario[] = [
  {
    name: 'prompt-typed',
    doors: ['prompt'],
    heldBackup: BACKUP_BLOCKED,
    runs: [{ prompt: c => `My notes:\n${c.block('prompt')}\nPlease reply.`, script: () => steps([]) }],
  },
  {
    name: 'prompt-pasted',
    doors: ['pasted'],
    heldBackup: BACKUP_BLOCKED,
    runs: [{ prompt: () => 'Look at the pasted text and reply.', stdin: c => c.block('pasted'), script: () => steps([]) }],
  },
  {
    name: 'read-file',
    doors: ['read'],
    files: c => ({ 'notes.txt': crlf(`line one\n${c.block('read')}\nligne trois ✓ 日本語\n`) }),
    runs: [{ prompt: () => 'Read notes.txt.', script: c => steps([read(c, 'notes.txt')]) }],
  },
  {
    name: 'mention-file',
    doors: ['mention'],
    files: c => ({ 'mention.txt': `line one\n${c.block('mention')}\n` }),
    runs: [{ prompt: () => 'Look at @mention.txt and reply.', script: () => steps([]) }],
  },
  {
    name: 'bash-output',
    doors: ['bash'],
    files: c => ({ 'print.mjs': PRINT, 'out.txt': `${c.block('bash')}\n` }),
    runs: [{ prompt: () => 'Show out.txt.', script: () => steps([shell('node print.mjs out.txt')]) }],
  },
  {
    name: 'bash-failed',
    doors: ['failed'],
    files: c => ({ 'print.mjs': PRINT, 'err.txt': `${c.block('failed')}\n` }),
    runs: [{ prompt: () => 'Run the failing command.', script: () => steps([shell('node print.mjs err.txt fail')]) }],
  },
  {
    name: 'bash-large',
    doors: ['large'],
    files: c => ({ 'print.mjs': PRINT, 'big.txt': `${c.block('large')}\n${'filler line of harmless log text\n'.repeat(Math.ceil(LARGE_OUTPUT / 33))}` }),
    runs: [{ prompt: () => 'Show big.txt.', script: () => steps([shell('node print.mjs big.txt')]) }],
  },
  {
    name: 'mcp-result',
    doors: ['mcp'],
    mcp: 'mcp',
    // Connected tools are deferred, so they aren't in the request's tool list; calling one by name works.
    runs: [{ prompt: () => 'Use the note tool, then reply.', script: () => steps([() => tool(MCP_TOOL, {})]) }],
  },
  {
    name: 'subagent-read',
    doors: ['subagent'],
    files: c => ({ 'sub.txt': `${c.block('subagent')}\n` }),
    runs: [{
      prompt: () => 'Ask a helper to read sub.txt.',
      script: c => steps(
        [r => tool(subagentTool(r), { description: 'read notes', prompt: 'SUBAGENT-TASK: read sub.txt and report', subagent_type: 'general-purpose' })],
        { sub: [read(c, 'sub.txt')] },
      ),
    }],
  },
  {
    name: 'compaction',
    doors: ['earlier', 'summary'],
    countFromRun: 1,
    runs: [
      { prompt: c => `Remember this:\n${c.block('earlier')}\nReply.`, script: () => steps([]) },
      { prompt: () => '/compact', resume: true, script: c => steps([], { summary: `Summary of the chat:\n${c.block('summary')}` }) },
      { prompt: () => 'Reply with ok.', resume: true, script: () => steps([]) },
    ],
  },
  {
    name: 'resume',
    doors: ['history'],
    countFromRun: 1,
    heldMessage: /history contains \d+ secrets/,
    runs: [
      { prompt: c => `Remember this:\n${c.block('history')}\nReply.`, withoutPlugin: true, script: () => steps([]) },
      { prompt: () => 'Reply with ok.', resume: true, script: () => steps([]) },
    ],
  },
  {
    name: 'claude-md',
    doors: ['claude-md'],
    files: c => ({ 'CLAUDE.md': `# Project notes\n\n${c.block('claude-md')}\n` }),
    runs: [{ prompt: () => 'Reply with ok.', script: () => steps([]) }],
  },
  {
    name: 'hook-context',
    doors: ['hook-context'],
    contextHook: 'hook-context',
    runs: [{ prompt: () => 'Reply with ok.', script: () => steps([]) }],
  },
  {
    name: 'skill-text',
    doors: ['skill'],
    files: c => ({ [path.join('.claude', 'skills', 'leak-note', 'SKILL.md')]: `---\nname: leak-note\ndescription: A short note for this project.\n---\n\n${c.block('skill')}\n` }),
    runs: [{ prompt: () => 'Use the leak-note skill.', script: () => steps([() => tool('Skill', { skill: 'leak-note' })]) }],
  },
]

// The backup lock (spec §5.2) covers part of what the main lock does. Inside its limits a door must stay clean;
// outside them the kit runs the door expecting every fake to be seen, so the limits list is proven, not claimed.
export const BACKUP_INSIDE = ['prompt-typed', 'prompt-pasted', 'read-file', 'bash-output', 'bash-large', 'mcp-result', 'subagent-read']
export const BACKUP_OUTSIDE = ['mention-file', 'bash-failed', 'compaction-summary', 'resume', 'claude-md', 'hook-context', 'skill-text']

/** The summary door alone: the backup lock cannot clean a compaction summary, and the first prompt carries no fake for it to block. */
export const BACKUP_ONLY: Scenario[] = [
  {
    name: 'compaction-summary',
    doors: ['summary'],
    countFromRun: 1,
    runs: [
      { prompt: () => 'Remember: nothing in particular. Reply.', script: () => steps([]) },
      { prompt: () => '/compact', resume: true, script: c => steps([], { summary: `Summary of the chat:
${c.block('summary')}` }) },
      { prompt: () => 'Reply with ok.', resume: true, script: () => steps([]) },
    ],
  },
]

/**
 * The compaction summary under Claude Code's built-in guard (kit mode --guarded). The guard passes the `compaction` row
 * past a user-tier plugin, so the summary is stored raw; the resume check then sees it in the history and stops the next
 * message (R-06), so the model is never sent it. The door is proven by that stop: no request in the last run, and the
 * hold message on stdout. A person who runs `/redact allow` lifts the hold and sends it (spec §22).
 */
export const GUARDED_ONLY: Scenario[] = [
  {
    name: 'compaction-held',
    doors: ['summary'],
    countFromRun: 2,
    heldMessage: /history contains \d+ secrets/,
    runs: [
      { prompt: () => 'Remember: nothing in particular. Reply.', script: () => steps([]) },
      { prompt: () => '/compact', resume: true, script: c => steps([], { summary: `Summary of the chat:\n${c.block('summary')}` }) },
      { prompt: () => 'Reply with ok.', resume: true, script: () => steps([]) },
    ],
  },
]

/** Kept apart: they touch the OS password store, which is the machine's own on macOS and Linux. */
export const STORE_SCENARIOS: Scenario[] = [
  {
    name: 'registered',
    doors: ['registered'],
    seedStore: 'registered',
    files: c => ({ 'registered.txt': `line one\n${c.bare('registered')}\n` }),
    runs: [{ prompt: () => 'Read registered.txt.', script: c => steps([read(c, 'registered.txt')]) }],
  },
]
