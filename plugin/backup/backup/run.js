// One run of the backup lock for one hook event: settings, checker, saved values, decision, log.
// Loaded by main.ts only after the marker said the main lock is not alive, so standing down costs little.
//
// The log goes to <config>/aegiscontext/log/<date>-<session>.backup.jsonl, a file of its own so the main
// lock's writes and these never meet. Every line is cleaned with the same redactor (R-17).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChecker } from '../checker/index.js';
import { backendFor } from '../core/backends.js';
import { appendLine, formatLine, ROLLOVER_BYTES } from '../core/log.js';
import { NO_ALLOW, Redactor } from '../core/session.js';
import { checkerOptions, compileAllow } from '../core/settings.js';
import { loadList } from '../core/store.js';
import { decide, failureAnswer } from './act.js';
import { SESSION_ID } from './marker.js';
import { nodeExec, readOnlyFiles, thisOS } from './os.js';
import { loadBackupSettings, nodeSettingsIO } from './settings.js';
const BUDGET_MS = 4000;
function realpath(p) {
    try {
        return fs.realpathSync.native(p);
    }
    catch {
        return undefined;
    }
}
function readFile(p) {
    try {
        return fs.readFileSync(p, 'utf8');
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return undefined;
        throw e;
    }
}
async function loadSecrets(o) {
    if (o.loadSecrets)
        return o.loadSecrets();
    try {
        const store = backendFor(thisOS(), { exec: nodeExec, files: readOnlyFiles(path.join(o.configDir, 'aegiscontext', 'store')) });
        const loaded = await loadList(store);
        return { entries: loaded.entries, ...(loaded.warning ? { warning: loaded.warning } : {}) };
    }
    catch {
        return { entries: [], warning: 'the saved secrets could not be loaded' };
    }
}
/** One log line per entry, in a file of this backup lock's own. A failure to write is not allowed to stop the hook. */
function writeLog(configDir, session, entries, clean) {
    if (entries.length === 0)
        return;
    const id = typeof session === 'string' && SESSION_ID.test(session) ? session : 'unknown-session';
    try {
        const dir = path.join(configDir, 'aegiscontext', 'log');
        fs.mkdirSync(dir, { recursive: true });
        const date = new Date(entries[0]?.t ?? Date.now()).toISOString().slice(0, 10);
        let part = 1;
        const file = (n) => path.join(dir, `${date}-${id}.backup${n > 1 ? `.${n}` : ''}.jsonl`);
        while (fs.existsSync(file(part)) && fs.statSync(file(part)).size >= ROLLOVER_BYTES)
            part++;
        const lines = entries.map(e => formatLine(e, clean)).join('\n');
        fs.appendFileSync(file(part), appendLine('', lines).text);
    }
    catch {
        process.stderr.write('aegiscontext backup lock: could not write its log file\n');
    }
}
const merge = (answer, warnings) => {
    if (warnings.length === 0)
        return answer;
    const note = `aegiscontext (backup lock): ${warnings.join(' ')}`;
    const prior = typeof answer?.systemMessage === 'string' ? `${answer.systemMessage} ` : '';
    return { ...(answer ?? {}), systemMessage: `${prior}${note}` };
};
/** For an input that could not be read or was too big: settings only, no checker, so the failure rule still applies. */
export function runUnreadable(event, o, cwd, kind) {
    const loaded = loadBackupSettings({ configDir: o.configDir, cwd: cwd ?? process.cwd(), platform: o.platform ?? process.platform, policyFiles: o.policyFiles ?? [], io: nodeSettingsIO });
    return failureAnswer(event, loaded.settings, kind).answer;
}
export async function runBackup(input, o) {
    const event = typeof input.hook_event_name === 'string' ? input.hook_event_name : '';
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
    const loaded = loadBackupSettings({ configDir: o.configDir, cwd, platform: o.platform ?? process.platform, policyFiles: o.policyFiles ?? [], io: nodeSettingsIO });
    const settings = loaded.settings;
    const warnings = [];
    const entries = [];
    for (const p of loaded.problems)
        entries.push({ t: Date.now(), event: 'notice', door: 'settings', detail: p });
    // Notices name a source and a setting, never a value. A managed one is also how a test sees that a real managed file was read.
    for (const n of loaded.notices)
        entries.push({ t: Date.now(), event: 'notice', door: 'settings', detail: n });
    if (loaded.problems.length > 0)
        warnings.push(`a settings problem was found (${loaded.problems.length}); see the log.`);
    const { checker, errors } = createChecker(checkerOptions(settings));
    for (const r of errors)
        entries.push({ t: Date.now(), event: 'notice', door: 'settings', detail: `custom rule ${r.id} refused: ${r.reason}` });
    const { allow, errors: allowErrors } = compileAllow(settings.allow);
    for (const e of allowErrors)
        entries.push({ t: Date.now(), event: 'notice', door: 'settings', detail: e });
    const saved = await loadSecrets(o);
    if (saved.warning) {
        entries.push({ t: Date.now(), event: 'failure', door: 'store', detail: saved.warning });
        warnings.push('the saved secrets could not be read, so only shapes and labels are being checked.');
    }
    const redactor = new Redactor({ checker, registered: saved.entries, hints: settings.hints === 'on', allow: allow ?? NO_ALLOW });
    const clean = (t) => redactor.redactText(t, { deadline: performance.now() + 500 }).text;
    const dataDir = path.join(o.configDir, 'aegiscontext');
    const own = [dataDir];
    const landed = realpath(dataDir);
    if (landed !== undefined && landed !== dataDir)
        own.push(landed);
    // With the home folder, the working folder and the OS, so a path is read the way Claude Code expands it (D-098).
    const platform = o.platform ?? process.platform;
    const roots = {
        own,
        config: o.configDir,
        caseless: platform !== 'linux',
        home: o.home ?? os.homedir(),
        cwd,
        windows: platform === 'win32',
        configVar: o.configVar ?? Boolean(process.env.CLAUDE_CONFIG_DIR),
    };
    let answer;
    try {
        const out = decide(input, { redactor, settings, roots, budgetMs: o.budgetMs ?? BUDGET_MS, readFile, realpath });
        answer = out.answer;
        entries.push(...out.entries);
    }
    catch {
        const f = failureAnswer(event, settings, 'error', input.tool_response);
        answer = f.answer;
        entries.push(...f.entries);
    }
    writeLog(o.configDir, input.session_id, entries, clean);
    return merge(answer, warnings);
}
