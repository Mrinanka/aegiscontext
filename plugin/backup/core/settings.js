// Settings (spec §14, R-13, R-14, R-15). Pure: the hooks read each source's `aegisContext` key and
// hand the values here.
//
// The levels, lowest first:
//   defaults  <  policy (managed)  <  user  <  project, local, flag (each treated as Project)
// Managed settings are the starting point and may `lock` settings; a locked setting keeps its
// managed value (or the default) whatever the user or a project says. The user can change anything
// else. A Project source can only make things stricter. A message never holds a setting's value,
// because an `allow` entry may itself be a secret.
import { convertAllowPattern } from '../checker/index.js';
export const DEFAULTS = {
    mode: 'enforce',
    personal_data: 'off',
    outbound: 'block',
    on_check_failure: 'allow',
    media: 'pass',
    hints: 'on',
    notices: 'on',
    rules: { off: [], custom: [], actions: {} },
    allow: [],
    secret_files: ['.env*'],
    log: { days: 30 },
    locked: [],
    put_back: { managedOff: false },
};
export const ENUMS = {
    mode: ['enforce', 'observe'],
    personal_data: ['on', 'off'],
    outbound: ['block', 'ask', 'warn', 'off'],
    on_check_failure: ['allow', 'hold'],
    media: ['pass', 'drop'],
    hints: ['on', 'off'],
    notices: ['on', 'off'],
};
/** How strict a value is: a Project source may only move up. */
const STRICT = {
    mode: ['observe', 'enforce'],
    personal_data: ['off', 'on'],
    outbound: ['off', 'warn', 'ask', 'block'],
    on_check_failure: ['allow', 'hold'],
    media: ['pass', 'drop'],
    hints: ['on', 'off'],
};
const ACTION_STRICT = ['warn', 'hide', 'block'];
export const LOCK_NAMES = ['mode', 'personal_data', 'outbound', 'on_check_failure', 'media', 'hints', 'notices', 'rules', 'rules.off', 'rules.custom', 'rules.actions', 'allow', 'secret_files', 'log', 'log.days', 'put_back'];
const KNOWN = new Set([...Object.keys(ENUMS), 'rules', 'allow', 'secret_files', 'log', 'locked', 'put_back']);
const MAX_ITEMS = 1000;
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isStringList = (v, max) => Array.isArray(v) && v.length <= MAX_ITEMS && v.every(x => isString(x, max));
function parseSource(name, raw) {
    const patch = { enums: {} };
    const errors = [];
    const notices = [];
    if (raw === undefined || raw === null)
        return { patch, errors, notices };
    const bad = (what, wants) => void errors.push(`${name}: ${what} ${wants}`);
    if (!isObject(raw)) {
        bad('aegisContext', 'must be an object');
        return { patch, errors, notices };
    }
    for (const key of Object.keys(raw))
        if (!KNOWN.has(key))
            notices.push(`${name}: unknown setting "${key.slice(0, 40)}" ignored`);
    for (const key of Object.keys(ENUMS)) {
        if (!(key in raw))
            continue;
        const v = raw[key];
        if (typeof v === 'string' && ENUMS[key].includes(v))
            patch.enums[key] = v;
        else
            bad(key, `must be one of ${ENUMS[key].join(', ')}`);
    }
    if ('rules' in raw) {
        const rules = raw.rules;
        if (!isObject(rules))
            bad('rules', 'must be an object');
        else {
            if ('off' in rules) {
                if (isStringList(rules.off, 64))
                    patch.off = rules.off;
                else
                    bad('rules.off', 'must be a list of rule ids');
            }
            if ('custom' in rules) {
                const list = rules.custom;
                const okShape = (c) => isObject(c) && typeof c.id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(c.id) && isString(c.label, 40) && isString(c.keyword, 64) && isString(c.pattern, 1000);
                if (Array.isArray(list) && list.length <= 100 && list.every(okShape))
                    patch.custom = list.map(c => ({ id: c.id, label: c.label, keyword: c.keyword, pattern: c.pattern }));
                else
                    bad('rules.custom', 'must be a list of { id, label, keyword, pattern }, each a short string (id: lower-case letters, digits and dashes)');
            }
            if ('actions' in rules) {
                const a = rules.actions;
                if (isObject(a) && Object.keys(a).length <= MAX_ITEMS && Object.entries(a).every(([k, v]) => k.length <= 64 && (v === 'hide' || v === 'block' || v === 'warn')))
                    patch.actions = { ...a };
                else
                    bad('rules.actions', 'must map rule ids to block, hide or warn');
            }
        }
    }
    if ('allow' in raw) {
        const a = raw.allow;
        if (Array.isArray(a) && a.length <= MAX_ITEMS && a.every(x => isString(x, 4096) || (isObject(x) && isString(x.pattern, 1000))))
            patch.allow = a.map(x => (typeof x === 'string' ? x : { pattern: x.pattern }));
        else
            bad('allow', 'must be a list of values or { pattern } entries');
    }
    if ('secret_files' in raw) {
        if (isStringList(raw.secret_files, 256))
            patch.secret_files = raw.secret_files;
        else
            bad('secret_files', 'must be a list of file patterns');
    }
    if ('log' in raw) {
        const log = raw.log;
        if (isObject(log) && 'days' in log && Number.isInteger(log.days) && log.days >= 1 && log.days <= 3650)
            patch.days = log.days;
        else
            bad('log.days', 'must be a whole number of days from 1 to 3650');
    }
    if ('put_back' in raw) {
        if (raw.put_back === 'on' || raw.put_back === 'off')
            patch.putBack = raw.put_back;
        else
            bad('put_back', 'must be one of on, off');
    }
    if ('locked' in raw) {
        if (name !== 'policy')
            notices.push(`${name}: "locked" is ignored; only managed settings can lock`);
        else if (isStringList(raw.locked, 40) && raw.locked.every(n => LOCK_NAMES.includes(n)))
            patch.locked = [...new Set(raw.locked)];
        else
            bad('locked', `must be a list of setting names (${LOCK_NAMES.join(', ')})`);
    }
    return { patch, errors, notices };
}
const clone = (s) => ({ ...s, rules: { off: [...s.rules.off], custom: [...s.rules.custom], actions: { ...s.rules.actions } }, allow: [...s.allow], secret_files: [...s.secret_files], log: { ...s.log }, locked: [...s.locked], put_back: { ...s.put_back } });
function expandLocks(names) {
    const out = new Set();
    for (const n of names) {
        if (n === 'rules')
            ['rules.off', 'rules.custom', 'rules.actions'].forEach(x => out.add(x));
        else if (n === 'log')
            out.add('log.days');
        else
            out.add(n);
    }
    return out;
}
export function resolveSettings(sources, o = {}) {
    const errors = [];
    const notices = [];
    const parsed = new Map();
    for (const name of ['policy', 'user', 'project', 'local', 'flag']) {
        const p = parseSource(name, sources[name]);
        notices.push(...p.notices);
        if (p.errors.length > 0)
            errors.push(...p.errors);
        else
            parsed.set(name, p.patch);
    }
    const s = clone(DEFAULTS);
    const policy = parsed.get('policy');
    const locks = expandLocks(policy?.locked ?? []);
    const apply = (name, patch, strictOnly) => {
        const skip = (key) => {
            if (locks.has(key) && name !== 'policy') {
                notices.push(`${name}: ${key} is locked by the organization and was left as it is`);
                return true;
            }
            return false;
        };
        const refuse = (key) => void notices.push(`${name}: ${key} ignored (a project can only make things stricter)`);
        for (const key of Object.keys(patch.enums)) {
            const v = patch.enums[key];
            if (skip(key))
                continue;
            if (strictOnly) {
                if (key === 'mode' && v === 'observe') {
                    notices.push(`${name}: mode observe ignored (only managed or user settings can turn it on)`);
                    continue;
                }
                const order = STRICT[key];
                if (!order) {
                    refuse(key);
                    continue;
                }
                if (order.indexOf(v) < order.indexOf(s[key])) {
                    refuse(key);
                    continue;
                }
            }
            ;
            s[key] = v;
        }
        if (patch.off !== undefined && !skip('rules.off')) {
            if (strictOnly)
                refuse('rules.off');
            else
                s.rules.off = patch.off;
        }
        if (patch.custom !== undefined && !skip('rules.custom')) {
            s.rules.custom = strictOnly ? [...s.rules.custom, ...patch.custom.filter(c => !s.rules.custom.some(x => x.id === c.id))] : patch.custom;
        }
        if (patch.actions !== undefined && !skip('rules.actions')) {
            if (!strictOnly)
                s.rules.actions = patch.actions;
            else {
                for (const [id, action] of Object.entries(patch.actions)) {
                    const current = Object.hasOwn(s.rules.actions, id) ? s.rules.actions[id] : 'hide';
                    if (ACTION_STRICT.indexOf(action) >= ACTION_STRICT.indexOf(current))
                        s.rules.actions[id] = action;
                    else
                        refuse('rules.actions');
                }
            }
        }
        if (patch.allow !== undefined && !skip('allow')) {
            if (strictOnly)
                refuse('allow');
            else
                s.allow = patch.allow;
        }
        if (patch.secret_files !== undefined && !skip('secret_files')) {
            s.secret_files = strictOnly ? [...new Set([...s.secret_files, ...patch.secret_files])] : patch.secret_files;
        }
        // put_back (spec §10, D-096) is the one setting with its own rules: a managed off binds with no `locked`, a managed
        // on and any user value are ignored, and a project may say on, but an off from any project source wins.
        if (patch.putBack !== undefined) {
            if (name === 'policy') {
                if (patch.putBack === 'off')
                    s.put_back.managedOff = true;
                else
                    notices.push('policy: put_back on ignored (an organization can only turn put-back off)');
            }
            else if (name === 'user') {
                notices.push('user: put_back ignored here; turn put-back on or off with /redact put-back');
            }
            else if (locks.has('put_back')) {
                notices.push(`${name}: put_back is locked by the organization and was left as it is`);
            }
            else if (s.put_back.repo !== 'off') {
                s.put_back.repo = patch.putBack;
            }
        }
        if (patch.days !== undefined && !skip('log.days')) {
            if (strictOnly)
                refuse('log.days');
            else
                s.log.days = patch.days;
        }
    };
    if (policy) {
        apply('policy', policy, false);
        s.locked = policy.locked ?? [];
        if (locks.has('put_back'))
            s.put_back.managedOff = true;
    }
    const user = parsed.get('user');
    if (user)
        apply('user', user, false);
    for (const name of ['project', 'local', 'flag']) {
        const p = parsed.get(name);
        if (p)
            apply(name, p, true);
    }
    const ok = errors.length === 0;
    // Only a broken managed or user source falls back. A broken project source is left out on its
    // own: a downloaded repo must not be able to freeze the settings at an older state.
    const trustedBroken = errors.some(e => e.startsWith('policy:') || e.startsWith('user:'));
    if (trustedBroken && o.lastGood) {
        // The last good settings may come from another project, or from a version with no put_back (rc.1). A managed
        // off is kept (D-097); what the project says is taken from this run's project sources only.
        const kept = o.lastGood.put_back;
        const put_back = { managedOff: kept?.managedOff === true || s.put_back.managedOff, ...(s.put_back.repo ? { repo: s.put_back.repo } : {}) };
        return { settings: { ...o.lastGood, put_back }, errors, notices, ok };
    }
    return { settings: s, errors, notices, ok };
}
/** What the checker is built from. Bad custom rules are refused by createChecker, with a reason (R-15). */
export function checkerOptions(s) {
    return { off: s.rules.off, actions: s.rules.actions, custom: s.rules.custom, personalData: s.personal_data === 'on' };
}
/** Turns `allow` entries into the Redactor's form. Patterns match the whole value. */
export function compileAllow(entries) {
    const values = new Set();
    const patterns = [];
    const errors = [];
    entries.forEach((entry, i) => {
        if (typeof entry === 'string') {
            values.add(entry);
            return;
        }
        const compiled = convertAllowPattern(entry.pattern);
        if ('reason' in compiled) {
            errors.push(`allow entry ${i + 1}: pattern refused: ${compiled.reason}`);
            return;
        }
        try {
            patterns.push(new RegExp(`^(?:${compiled.source})$`, compiled.flags));
        }
        catch {
            errors.push(`allow entry ${i + 1}: pattern refused: the regex engine refused it`);
        }
    });
    return { allow: { values, patterns }, errors };
}
